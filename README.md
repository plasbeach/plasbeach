# plasbeach

Everything that runs on my Raspberry Pi 5 and makes up **[www.plasbea.ch](https://www.plasbea.ch)**, sharing one look:
the **Gothic Terminal** pixel font for headings and the purple palette (light and dark).

| Folder | What | Where it runs |
|---|---|---|
| `site/` | The website: home page and **Schieber**, the Jass score sheet (Vue 3 + Vite) | www.plasbea.ch, www.plasbea.ch/chibre |
| `apps/endotitre/` | **endotitre**: my mailboxes and calendars with Claude built in (Vue front end + Fastify backend) | www.plasbea.ch/endotitre/ (login + 2FA) |
| `apps/spamfilter/` | Background spam/phishing filter for both mailboxes (Python + Claude Haiku) | systemd user service |
| `theme/` | Shared CSS tokens, the Gothic Terminal font and its source | imported by every project |
| `apps/auth/` | Login service: password + authenticator code (TOTP), recovery codes, lockout; the page is `site/` `/login` | systemd user service |
| `deploy/` | Caddy block, systemd units, deploy script | |

## How it's served

```
Browser ─► Cloudflare ─► Caddy (Docker, ~/nextcloud) ─┬─ /         static site  (~/www/plasbea.ch)
                                                      ├─ /login, /auth  login page + login service (password + authenticator code)
                                                      ├─ /endotitre/* login check ─► Node backend on 172.18.0.1:8787
                                                      └─ /nextcloud/*  Nextcloud container (was nager.internet-box.ch)
```

- Caddy asks the login service (`apps/auth`) whether you're logged in with password **and** a code from
  your authenticator app, then adds a secret header (`X-Proxy-Auth`) that the backend checks on
  every request. The backend only listens on the Docker bridge address, so nothing else can reach it.
- Mailbox, calendar and Claude credentials live in `~/ai-mailbox/secrets.env` (mode 600), never in Git.
  Backend settings: `~/.config/plasbeach/endotitre.env`. The Caddy block template is `deploy/Caddyfile.plasbea.ch`.

## Develop

```bash
cd site && npm install && npm run dev                      # site on :5173
cd apps/endotitre/server && npm install && npm run dev  # fake login, real data if SECRETS_FILE is set
cd apps/endotitre/web && npm install && npm run dev        # http://localhost:5173/endotitre/
```

## Deploy (on the Pi)

```bash
git pull && deploy/deploy.sh
```
