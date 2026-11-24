# Put the app online at plasbea.ch

The app runs on the Raspberry Pi and is reachable only through a **Cloudflare Tunnel**. **Cloudflare Access** guards it, and only your email can log in.

```
You ──HTTPS──► Cloudflare (Access login) ──tunnel──► cloudflared on the Pi ──► app on 127.0.0.1:8787
```

- No router port is opened, and your home IP is not exposed.
- Cloudflare blocks anyone who isn't on the allow list before they reach the Pi.
- The app also verifies Cloudflare's signed login token (`Cf-Access-Jwt-Assertion`) on every request. It rejects anything without a valid token for an allowed email, even from your home network.
- The app listens on `127.0.0.1` only.

## 1. Move plasbea.ch to Cloudflare (once)

1. Create a free account at https://dash.cloudflare.com and choose **Add a domain** → `plasbea.ch`, on the Free plan.
2. Cloudflare shows two nameservers. At your domain registrar, replace the current nameservers with those two.
3. Wait until Cloudflare marks the domain as **Active**. This usually takes minutes but can take up to a day.

## 2. Install and build the app on the Pi

You need Raspberry Pi OS (64-bit recommended) and Node 20 or newer.

```bash
cd ~
git clone https://github.com/plasbeach/calendar-mail-tool.git
cd calendar-mail-tool
(cd web && npm ci && npm run build)
(cd server && npm ci && npm run build)
cp server/.env.example server/.env   # you fill this in at step 4
```

## 3. Create the tunnel

1. In the Cloudflare dashboard, go to **Zero Trust → Networks → Tunnels → Create a tunnel**, choose **Cloudflared**, and name it `pi`.
2. Pick **Debian** and **arm64** (or **armhf** on 32-bit OS), then run the install commands it shows on the Pi. The last one looks like `sudo cloudflared service install <token>`.
3. Under **Public hostnames**, add:
   - Subdomain: *(empty)*, Domain: `plasbea.ch`
   - Service: `HTTP` → `localhost:8787`
4. Save. The tunnel should show as **Healthy**.

## 4. Lock it to your email with Access

1. Go to **Zero Trust → Access → Applications → Add an application → Self-hosted**.
2. Name it `Calendar + Mail`, with domain `plasbea.ch`. Choose a session duration, for example 1 month.
3. Add a policy: Action **Allow**, Include **Emails** → your email address. Add nothing else.
4. Under login methods, keep **One-time PIN**. You can add Google if you prefer.
5. Save. Then open the application's **Overview** and copy the **Application Audience (AUD) Tag**.
6. Find your team domain under **Zero Trust → Settings → Custom pages**. It looks like `<team>.cloudflareaccess.com`.
7. On the Pi, edit `server/.env` and set `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD` and `ALLOWED_EMAILS`. Use the same email as in the policy.

## 5. Run the app as a service

```bash
# If your user isn't "pi" or the repo isn't in ~/calendar-mail-tool, edit the paths in the unit first.
sudo cp deploy/calendar-mail.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now calendar-mail
curl -s localhost:8787/healthz        # → {"ok":true}
curl -s -o /dev/null -w '%{http_code}\n' localhost:8787/   # → 403 (no login token: expected)
```

Now open https://plasbea.ch. Cloudflare asks for your email, sends a code, and then shows the app. Your email and a **Log out** button appear at the bottom of the menu.

## Your data

To-dos are stored only on the Pi, in `server/data/todos.json`. Nothing is synced anywhere else. To back them up, copy that file. To use another folder, set `DATA_DIR` in `server/.env`.

## Updating

```bash
~/calendar-mail-tool/deploy/update.sh
```

## Troubleshooting

- **"Forbidden" after logging in:** the email in `ALLOWED_EMAILS`, the AUD tag or the team domain doesn't match Access. Check them with `journalctl -u calendar-mail -n 50`.
- **Cloudflare error 1033 or 502:** the tunnel or the app isn't running. Check `systemctl status cloudflared calendar-mail`.
- **The service refuses to start with "Missing required settings":** fill in `server/.env`.

## Local development

```bash
cd server && npm install && npm run dev   # fakes a login as dev@localhost; never use in production
cd web && npm install && npm run dev      # http://localhost:5173, /api is proxied to the backend
```
