#!/usr/bin/env bash
# Pull the latest code, rebuild, and restart the app. Run on the Pi from the repo root.
set -euo pipefail
cd "$(dirname "$0")/.."
git pull --ff-only
(cd web && npm ci && npm run build)
(cd server && npm ci && npm run build)
sudo systemctl restart calendar-mail
systemctl --no-pager --lines=5 status calendar-mail
