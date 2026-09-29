'use strict'
/* news-server console — vanilla JS, no build step */

// API base derived from mount path: /console/ -> '', /news/console/ -> '/news'.
// Lets the same static bundle work on localhost:3001/console and
// bioqif.com/news/console behind a path-prefix reverse proxy.
const API_BASE = location.pathname.replace(/\/console\/?.*$/, '')

const $ = (sel) => document.querySelector(sel)
const $$ = (sel) => [...document.querySelectorAll(sel)]

const store = {
  get token() { return localStorage.getItem('adminToken') || '' },
  set token(v) { localStorage.setItem('adminToken', v) },
}

function toast(msg, isErr = false) {
  const el = $('#toast')
  el.textContent = msg
  el.className = 'toast show' + (isErr ? ' err' : '')
  setTimeout(() => el.classList.remove('show'), 2600)
}

async function api(path, opts = {}) {
  const headers = { ...(opts.headers || {}) }
  if (opts.body) headers['Content-Type'] = 'application/json'
  if (path.startsWith('/api/admin')) headers.Authorization = `Bearer ${store.token}`
  const res = await fetch(API_BASE + path, { ...opts, headers, body: opts.body ? JSON.stringify(opts.body) : undefined })
  if (res.status === 401) { toast('认证失败：请检查 ADMIN_TOKEN', true); throw new Error('unauthorized') }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
  return data
}

const fmtNum = (n) => {
  n = Number(n) || 0
  if (n >= 1e8) return (n / 1e8).toFixed(2) + ' 亿'
  if (n >= 1e4) return (n / 1e4).toFixed(1) + ' 万'
  return String(n)
}
const fmtTime = (s) => s ? new Date(s).toLocaleString('zh-CN', { hour12: false }) : '—'
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

/* ============ tabs ============ */
$$('.tab').forEach((btn) => btn.addEventListener('click', () => {
  $$('.tab').forEach((b) => b.classList.toggle('active', b === btn))
  $$('.panel').forEach((p) => p.classList.toggle('active', p.id === `tab-${btn.dataset.tab}`))
  refreshTab(btn.dataset.tab)
}))

function refreshTab(name) {
  if (name === 'dashboard') loadDashboard()
  if (name === 'news') loadNews()
  if (name === 'spider') loadJobs()
}

/* ============ auth & health ============ */
$('#tokenInput').value = store.token
$('#tokenSave').addEventListener('click', () => {
  store.token = $('#tokenInput').value.trim()
  toast('token 已保存')
  refreshTab($('.tab.active').dataset.tab)
})

async function health() {
  const dot = $('#healthDot')
  try {
    const h = await api('/api/health')
    dot.className = 'dot ' + (h.db === 'up' ? 'up' : 'down')
    dot.title = `db: ${h.db} · uptime: ${h.uptime}s`
  } catch {
    dot.className = 'dot down'
    dot.title = 'server unreachable'
  }
}

/* ============ dashboard ============ */
async function loadDashboard() {
  let ov
  try { ov = await api('/api/admin/overview') } catch { return }
  $('#statTotal').textContent = ov.stats.total.toLocaleString()
  $('#statSum').textContent = fmtNum(ov.stats.sumFlow)
  $('#statAvg').textContent = fmtNum(ov.stats.avgFlow)
  $('#statMax').textContent = fmtNum(ov.stats.maxFlow)

  const top = ov.top || []
  const max = Math.max(...top.map((t) => t.flow), 1)
  $('#topChart').innerHTML = top.map((t) => `
    <div class="bar-row" title="${esc(t.name)}">
      <div class="bar-label">${esc(t.name)}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${(t.flow / max * 100).toFixed(1)}%"></div></div>
      <div class="bar-val">${fmtNum(t.flow)}</div>
    </div>`).join('') || '<p class="muted">暂无数据</p>'

  $('#recentJobsTbl tbody').innerHTML = (ov.spider.recent || []).map((j) => `
    <tr>
      <td class="num">${esc(j.id)}</td>
      <td><span class="status ${esc(j.status)}">${esc(j.status)}</span></td>
      <td>${fmtTime(j.started_at)}</td>
      <td class="num">${j.items ?? '—'}</td>
    </tr>`).join('') || '<tr><td colspan="4" class="muted">暂无任务（需先运行 npm run migrate 并启动爬虫）</td></tr>'
}

/* ============ news ============ */
const newsState = { page: 1, pageSize: 20, q: '', sortBy: 'id', order: 'desc' }

async function loadNews() {
  let res
  try {
    const p = new URLSearchParams({
      page: newsState.page, pageSize: newsState.pageSize,
      q: newsState.q, sortBy: newsState.sortBy, order: newsState.order,
    })
    res = await api(`/api/v1/news?${p}`)
  } catch (e) { toast(e.message, true); return }

  $('#newsTotal').textContent = `共 ${res.pagination.total} 条`
  $('#newsPage').textContent = `${res.pagination.page} / ${res.pagination.totalPages}`
  $('#newsPrev').disabled = res.pagination.page <= 1
  $('#newsNext').disabled = res.pagination.page >= res.pagination.totalPages

  $('#newsTbl tbody').innerHTML = res.data.map((r) => `
    <tr data-id="${r.id}">
      <td class="num">${r.id}</td>
      <td class="title-cell"><a href="${esc(r.url)}" target="_blank" rel="noopener" title="${esc(r.url)}">${esc(r.name)}</a></td>
      <td class="num">${fmtNum(r.flow)}</td>
      <td class="muted">${r.created_at ? fmtTime(r.created_at) : '—'}</td>
      <td>
        <button class="btn small act-edit">编辑</button>
        <button class="btn small danger act-del">删除</button>
      </td>
    </tr>`).join('') || '<tr><td colspan="5" class="muted">无数据</td></tr>'
}

$('#newsSearch').addEventListener('click', () => {
  newsState.q = $('#newsQ').value.trim()
  newsState.page = 1
  loadNews()
})
$('#newsQ').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#newsSearch').click() })
$('#newsSort').addEventListener('change', () => {
  const [sortBy, order] = $('#newsSort').value.split(':')
  newsState.sortBy = sortBy; newsState.order = order; newsState.page = 1
  loadNews()
})
$('#newsPrev').addEventListener('click', () => { newsState.page--; loadNews() })
$('#newsNext').addEventListener('click', () => { newsState.page++; loadNews() })

$('#newsTbl').addEventListener('click', async (e) => {
  const tr = e.target.closest('tr[data-id]')
  if (!tr) return
  const id = tr.dataset.id

  if (e.target.classList.contains('act-del')) {
    if (!confirm(`确认删除 #${id}？`)) return
    try { await api(`/api/admin/news/${id}`, { method: 'DELETE' }); toast(`已删除 #${id}`); loadNews() }
    catch (err) { toast(err.message, true) }
  }

  if (e.target.classList.contains('act-edit')) {
    const cell = tr.querySelector('.title-cell')
    const oldName = cell.querySelector('a').textContent
    cell.innerHTML = `<input class="edit-input" value="${esc(oldName)}">`
    const input = cell.querySelector('input')
    input.focus()
    const commit = async () => {
      const name = input.value.trim()
      if (!name || name === oldName) { loadNews(); return }
      try { await api(`/api/admin/news/${id}`, { method: 'PUT', body: { name } }); toast(`已更新 #${id}`) }
      catch (err) { toast(err.message, true) }
      loadNews()
    }
    input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') commit(); if (ev.key === 'Escape') loadNews() })
    input.addEventListener('blur', commit)
  }
})

/* ============ spider ============ */
let logJobId = null
let logTimer = null

$('#spiderRun').addEventListener('click', async () => {
  try {
    const job = await api('/api/admin/spider/run', { method: 'POST', body: { spider: 'new' } })
    toast(`任务已启动：${job.id}`)
    $('#spiderMsg').textContent = ''
    loadJobs()
  } catch (e) {
    $('#spiderMsg').textContent = e.message
    toast(e.message, true)
  }
})

async function loadJobs() {
  let res
  try { res = await api('/api/admin/spider/jobs') } catch { return }
  const all = [
    ...(res.live || []),
    ...(res.history || []).filter((h) => !(res.live || []).some((l) => l.id === h.id)),
  ]
  $('#jobsTbl tbody').innerHTML = all.map((j) => {
    const id = j.id
    const status = j.status
    const started = j.startedAt || j.started_at
    const finished = j.finishedAt || j.finished_at
    const dur = finished ? `${Math.round((new Date(finished) - new Date(started)) / 1000)}s` : (status === 'running' ? '…' : '—')
    return `<tr data-id="${esc(id)}">
      <td class="num">${esc(id.replace(/^job-\d+-/, '…'))}</td>
      <td><span class="status ${esc(status)}">${esc(status)}</span></td>
      <td>${fmtTime(started)}</td>
      <td class="num">${dur}</td>
      <td class="num">${j.items ?? '—'}</td>
      <td>
        <button class="btn small act-log">日志</button>
        ${status === 'running' ? '<button class="btn small danger act-stop">停止</button>' : ''}
      </td>
    </tr>`
  }).join('') || '<tr><td colspan="6" class="muted">暂无任务</td></tr>'
}

$('#jobsTbl').addEventListener('click', async (e) => {
  const tr = e.target.closest('tr[data-id]')
  if (!tr) return
  const id = tr.dataset.id
  if (e.target.classList.contains('act-stop')) {
    try { await api(`/api/admin/spider/jobs/${id}/stop`, { method: 'POST' }); toast('已发送停止信号') }
    catch (err) { toast(err.message, true) }
    return
  }
  if (e.target.classList.contains('act-log')) {
    logJobId = id
    $('#logJobId').textContent = ` — ${id}`
    pollLog()
  }
})

async function pollLog() {
  if (!logJobId) return
  clearTimeout(logTimer)
  try {
    const j = await api(`/api/admin/spider/jobs/${logJobId}?tail=200`)
    $('#jobLog').textContent = j.log || '（暂无日志输出）'
    $('#jobLog').scrollTop = $('#jobLog').scrollHeight
    if (j.status === 'running') logTimer = setTimeout(pollLog, 2000)
    else setTimeout(loadJobs, 500)
  } catch {
    $('#jobLog').textContent = '任务不在内存中（服务重启后仅保留历史记录）'
  }
}

/* ============ boot ============ */
health()
setInterval(health, 15000)
loadDashboard()
