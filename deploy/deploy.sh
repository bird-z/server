#!/usr/bin/env bash
# news-server 部署/更新脚本（在目标机上运行）
set -euo pipefail
cd /srv/news-server
git pull origin main
npm ci --omit=dev
sudo systemctl restart news-server
systemctl status news-server --no-pager | head -5
