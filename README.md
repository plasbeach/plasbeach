# calendar-mail-tool

A self-hosted web app for your calendars and mailboxes, running on a Raspberry Pi, with Claude built in to help act on meetings, emails and to-dos.

## What's here

- `web/`: the Vue 3 + Vite + TypeScript front end. It has three screens: **Today** (schedule, to-dos, Ask Claude), **Mail** (all inboxes plus each mailbox's own folders) and **Calendar** (week/day view with calendars grouped by account). It also has a light/dark theme switch.
- `docs/DESIGN.md`: design notes and a link to the design canvas.
- `fonts/gothic-terminal/`: the app's custom display font (a gothic terminal pixel font), with its source and build script.

The front end currently runs on sample data (`web/src/data/mock.ts`). The backend that connects real accounts and Claude comes next.

## Run it

```bash
cd web
npm install
npm run dev       # http://localhost:5173, also reachable from your LAN
npm run build     # type-check and build to web/dist
```

Node 20 or newer is needed.

## Planned architecture

```
Browser ──► Pi backend (Node) ──► Google / Microsoft 365 / IMAP / ICS
                    │
                    └──► Claude API (API key lives only on the Pi)
```

- The browser never sees credentials. The backend keeps the OAuth tokens and the Claude API key, for example in `server/.env`, which is never committed.
- The front end calls `POST /api/ask` with the selected item (event, to-do or email) and an instruction. See `web/src/api/claude.ts`.
- Email to-dos are created automatically only for mail that is really meant for you (not newsletters or notifications).
