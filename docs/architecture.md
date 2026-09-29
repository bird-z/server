# news-server 后端架构设计

> 版本 v1.0 ｜ 2026-09-29
> 范围：`server/`（Express + MySQL）与 `news/`（Scrapy 爬虫）组成的数据后端。
> 不含 `shnda/` 前端——其接口契约（`docs/api.md`）已冻结，本后端不向其提供服务。

## 1. 总体结构

```
┌─────────────┐   HTTP    ┌──────────────────────────────────┐
│  浏览器/调用方 │ ────────▶ │  Express App (src/app.js)          │
└─────────────┘           │                                  │
                          │  ├─ middleware                    │
                          │  │   ├─ requestLogger             │
                          │  │   ├─ adminAuth (Bearer token)   │
                          │  │   ├─ notFound                  │
                          │  │   └─ errorHandler              │
                          │  ├─ routes/public   /api/*        │
                          │  ├─ routes/admin    /api/admin/*  │
                          │  └─ static console  /console      │
                          │                                  │
                          │  ├─ services/newsService  ──▶ MySQL newsdb
                          │  └─ services/spiderService ─▶ spawn scrapy
└──────────────────────────────────────────────────────────┘
```

分层：`routes` 只做 HTTP ↔ service 的翻译；`services` 持有业务逻辑与外部资源（DB 连接池、子进程）；`middleware` 处理横切关注点。

## 2. 目录

```
server/
├── index.js              # 入口：起服务 + 优雅退出（薄）
├── src/
│   ├── config.js         # 环境变量解析（node --env-file）
│   ├── db.js             # mysql2 连接池 + ping()
│   ├── app.js            # Express 装配
│   ├── middleware/       # requestLogger / adminAuth / notFound / errorHandler
│   ├── routes/           # public.js / admin.js
│   ├── services/         # newsService.js / spiderService.js
│   └── utils/asyncHandler.js
├── console/              # 管理控制台（纯静态 vanilla JS，无构建）
├── scripts/migrate.js    # 幂等数据库迁移
├── docs/architecture.md  # 本文档
├── logs/                 # 爬虫任务日志（gitignore）
└── .env / .env.example   # 配置（.env gitignore）
```

## 3. 接口契约

### 3.1 公开接口（保留兼容 + 新增 v1）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/` | 服务信息 |
| GET | `/api/health` | `{ status, db, uptime }`，db 探活 |
| GET | `/api/news` | **旧契约不变**：返回全部行裸数组 |
| GET | `/api/news/:id` | **旧契约不变**：单行或 404 |
| GET | `/api/v1/news` | `?page&pageSize&q&sortBy&order` → `{ data, pagination }` |
| GET | `/api/v1/news/top` | `?limit` → 按 flow 降序 |
| GET | `/api/v1/stats` | `{ total, sumFlow, avgFlow, maxFlow }` |

设计取舍：旧端点原样保留（裸数组），所有"新形态"查询走 `/api/v1`，避免同一个路径按参数返回两种 shape。

### 3.2 管理接口（`/api/admin/*`，Bearer token）

认证：`Authorization: Bearer <ADMIN_TOKEN>`。token 来自 `.env`；
未配置时服务启动生成随机 token 并打印到 stdout，admin 接口照常可用。

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/admin/overview` | 控制台首屏聚合：stats + 最近任务 |
| POST | `/api/admin/spider/run` | `{ spider }` 启动爬取任务（同一时间仅一个运行中） |
| GET | `/api/admin/spider/jobs` | 任务列表（内存态 + `spider_runs` 表） |
| GET | `/api/admin/spider/jobs/:id` | 任务详情 + `?tail=N` 日志尾部 |
| POST | `/api/admin/spider/jobs/:id/stop` | 终止运行中任务 |
| PUT | `/api/admin/news/:id` | 改 name/url/flow |
| DELETE | `/api/admin/news/:id` | 删行 |

## 4. 数据库

- 连接：`mysql2/promise` 连接池（`.env` 注入，密码不再硬编码）。
- `news(id, name, url, flow, created_at)`：迁移补 `created_at` 与 `url` 唯一键
  （先去重再加唯一索引），之后爬虫写库用 `INSERT ... ON DUPLICATE KEY UPDATE flow`，
  重复跑不再产生重复行。
- `spider_runs(id, spider, status, pid, started_at, finished_at, exit_code, items, error)`
  持久化任务历史，重启后控制台仍能看到过往运行。

## 5. 爬虫控制（spiderService）

- `spawn('scrapy', ['crawl', spider], { cwd: ../news })`，stdout/stderr 写 `logs/<jobId>.log`，
  同时进内存环形 buffer（末 200 行）供 tail 查询。
- 并发约束：全局最多 1 个运行中任务（单机单 MySQL，避免 pipeline 互相打架）。
- 解析 scrapy 输出中的 `item_scraped_count` 统计入库条数。
- 退出码非 0 → status=`failed`；被 stop 杀掉 → `stopped`。

## 6. 控制台（/console）

纯静态三件套（`index.html`/`app.js`/`style.css`），无构建、无框架依赖：

- **仪表盘**：总条数 / 总热度 / 均热度 / DB 健康；Top N 热度条形图。
- **新闻管理**：分页表格，支持 `q` 搜索、排序、行内编辑、删除。
- **爬虫控制**：启动任务、任务历史列表、日志 tail 轮询、停止按钮。
- **认证**：token 输入框 → localStorage，所有 admin 请求带 Bearer 头。

## 7. 配置（.env）

```
PORT=3001
DB_HOST=localhost  DB_USER=...  DB_PASSWORD=...  DB_NAME=newsdb
DB_POOL_SIZE=10
ADMIN_TOKEN=...            # 留空则启动时随机生成
CORS_ORIGINS=*             # 逗号分隔白名单，* 为放开
SCRAPY_DIR=../news         # scrapy 项目相对 server/ 的路径
SPIDER_COOLDOWN_MS=10000   # 两次运行最小间隔
```

## 8. 运维

- `npm run dev`：node --watch 热重载；`npm start`：生产启动；`npm run migrate`：幂等迁移。
- 优雅退出：SIGINT/SIGTERM → 停接新连接 → 杀运行中子进程 → 关连接池。
- 日志：HTTP 请求行打到 stdout；爬虫日志落 `logs/`。
