# About me notes

Backend for the **About me** page (`site/src/about/`, www.plasbea.ch/about): notes shown as a mind map.

- Anyone can read: `GET /api/about/notes`.
- Writing (`POST /notes`, `PUT /notes/:id`, `PUT /layout`, `DELETE /notes/:id`) needs the site login.
  Caddy runs `forward_auth` on every non-GET request, then adds `X-Proxy-Auth` (a secret only Caddy
  and this service know) and `X-Proxy-User`. Requests also have to come from `https://www.plasbea.ch`.
- Data: one JSON file, `~/.local/share/plasbeach/about/notes.json` (the previous version is kept as `.bak`).
- Service: `deploy/plasbeach-about.service` (user unit, `172.18.0.1:8790`). Secret: `PROXY_AUTH_SECRET`
  in `~/.config/plasbeach/about.env`, same value as in the `/api/about/*` block of the Caddyfile.

In a note's text, a blank line starts a new paragraph, `[[Another note]]` links to that note, and web
addresses become links. Notes can also be linked with the picker in the editor; links have no direction.

```sh
npm ci && npm test && npm run build
```
