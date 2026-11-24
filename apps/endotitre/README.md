# calendar-mail-tool

A self-hosted web app for your calendars and mailboxes, running on a Raspberry Pi, with Claude built in to help act on meetings, emails and to-dos.

## What's here

- `web/`: the Vue 3 + Vite + TypeScript front end. It has three screens: **Today** (schedule, to-dos, Ask Claude), **Mail** (all inboxes plus each mailbox's own folders) and **Calendar** (week/day view with calendars grouped by account). It also has a light/dark theme switch.
- `server/`: the Node backend (Fastify). It serves the built app and checks the login on every request: the shared secret that Caddy adds after its password prompt (or a Cloudflare Access token, if configured).
- `docs/DESIGN.md`: design notes and a link to the design canvas.

The theme and the Gothic Terminal font are shared with the rest of the site, in `../../theme/`. Deployment is described in the [root README](../../README.md).

The app uses the real Infomaniak mailboxes (IMAP) and calendars (CalDAV), and Claude for Ask Claude. The sample data in `web/src/data/mock.ts` is only used when no backend is reachable.

## Run it

```bash
cd web
npm install
npm run dev       # http://localhost:5173, also reachable from your LAN
npm run build     # type-check and build to web/dist
```

Backend: `cd server && npm install && npm test`. To deploy on the Pi, see the [root README](../../README.md).

Node 20 or newer is needed.

## Architecture

```
Browser ──► Caddy password (www.plasbea.ch/mail/) ──► Pi backend (Node) ──► Infomaniak IMAP / CalDAV
                                                              └──► Claude API (key lives only on the Pi)
```

- The browser never sees credentials: the backend reads them from `SECRETS_FILE` on the Pi.
- Ask Claude (`POST /api/ask`) can list calendar events, create events and add to-dos. Email content is passed as data, never as instructions.
