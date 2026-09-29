# news-server

新闻热榜数据后端：Express + MySQL，含管理控制台与 Scrapy 任务控制。

架构与接口契约见 [docs/architecture.md](docs/architecture.md)。

## 快速开始

```bash
cp .env.example .env       # 填 DB_* 与 ADMIN_TOKEN
npm run migrate            # 幂等迁移（建表/索引/去重）
npm run dev                # 开发（--watch 热重载）
npm start                  # 生产
```

- API: `http://localhost:3001/api/...`
- 控制台: `http://localhost:3001/console/`（需要 `.env` 里的 `ADMIN_TOKEN`）
- `ADMIN_TOKEN` 留空时每次启动随机生成并打印到 stdout

## 接口速查

| 类型 | 端点 |
|---|---|
| 公开 | `GET /api/health` · `GET /api/news` · `GET /api/news/:id` |
| 公开 v1 | `GET /api/v1/news?page&pageSize&q&sortBy&order` · `GET /api/v1/news/top` · `GET /api/v1/stats` |
| 管理 | `GET /api/admin/overview` · `POST /api/admin/spider/run` · `GET /api/admin/spider/jobs` · `GET /api/admin/spider/jobs/:id?tail=N` · `POST .../stop` · `PUT|DELETE /api/admin/news/:id` |

管理接口需 `Authorization: Bearer <ADMIN_TOKEN>`。

## 爬虫

控制台点「运行爬虫」或：

```bash
curl -X POST -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" -d '{"spider":"new"}' \
     http://localhost:3001/api/admin/spider/run
```

爬取日志落盘 `logs/<jobId>.log`，任务历史持久化在 `spider_runs` 表。
MongoDB pipeline 已改为可选容错（Atlas 不可达时自动跳过，不影响 MySQL 入库）。

## 文件说明

- `mongo.js` —— 早期学习用的 MongoDB 连接测试脚本，与运行时无关，保留存档。
- `news/`（兄弟目录）—— Scrapy 项目，`SCRAPY_DIR` 默认指向 `../news`。
