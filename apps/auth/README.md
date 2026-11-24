# Login (password + authenticator code)

Protects the private apps on www.plasbea.ch (today: `/mail/`). Caddy calls `GET /auth/verify`
(`forward_auth`) before each request; if you're not logged in, you're sent to **/login** (the page lives in
`site/src/views/LoginView.vue`).

- First login: password, then register an authenticator app (QR code, "open in app" link on phones, or the
  key to type by hand: TOTP, SHA-1, 6 digits, 30 s, which every app supports). You get 10 one-time recovery codes.
- Next logins: password + 6-digit code (or a recovery code). A code can't be used twice.
- 5 wrong tries in 10 minutes (per IP and per user) lock for 30 minutes.
- Sessions: 12 h max, 2 h of inactivity; "remember this device": 30 days / 7 days inactivity.
- POSTs must come from `https://www.plasbea.ch`; cookie `__Host-plasbeach_auth` (Secure, HttpOnly, SameSite=Lax).

Data (outside Git): `~/.config/plasbeach/auth/users.json` (scrypt password hashes, TOTP secret, hashed
recovery codes) and `sessions.json` (hashed session tokens). Both mode 600.

```bash
npm run user -- list
npm run user -- add <name>          # asks for the password (12+ characters)
npm run user -- password <name>
npm run user -- reset-2fa <name>    # lost phone: the next login registers a new app
npm test                            # RFC 6238 vectors + the whole login flow
```
