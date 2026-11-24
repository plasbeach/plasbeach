#!/usr/bin/env bash
# Build everything and put it live on the Pi. Run from anywhere: ~/plasbeach/deploy/deploy.sh
#   - site/                 -> ~/www/plasbea.ch (served by Caddy at www.plasbea.ch)
#   - apps/auth/            -> systemd user service plasbeach-auth (login + 2FA, page at /login)
#   - apps/calendar-mail/   -> systemd user service calendar-mail (www.plasbea.ch/mail/, behind the login)
#   - apps/spamfilter/      -> systemd user service ai-spamfilter
set -euo pipefail
cd "$(dirname "$0")/.."

echo "== site"
(cd site && npm ci --silent && npm run build)
rsync -a --delete site/dist/ "$HOME/www/plasbea.ch/"

echo "== auth"
(cd apps/auth && npm ci --silent && npm run build)
systemctl --user restart plasbeach-auth

echo "== calendar-mail"
(cd apps/calendar-mail/web && npm ci --silent && npm run build)
(cd apps/calendar-mail/server && npm ci --silent && npm run build)
# The backend lists its static files at startup, so restart it after every web build
systemctl --user restart calendar-mail

echo "== spamfilter"
"$HOME/ai-mailbox/.venv/bin/pip" install -q -r apps/spamfilter/requirements.txt
systemctl --user restart ai-spamfilter

sleep 3
systemctl --user --no-pager --lines=0 status plasbeach-auth calendar-mail ai-spamfilter | grep -E '●|Active'
