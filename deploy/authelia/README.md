# Authelia (login + two-factor authentication)

Protects **www.plasbea.ch/mail/**. Runs as the `authelia` service in `~/nextcloud/docker-compose.yml`
(same Docker network as Caddy). The login page is **www.plasbea.ch/auth**.

On the Pi:

| Path | What |
|---|---|
| `~/nextcloud/authelia/config/configuration.yml` | this folder's `configuration.yml` |
| `~/nextcloud/authelia/config/users_database.yml` | users + argon2 password hashes (mode 600, not in Git) |
| `~/nextcloud/authelia/config/db.sqlite3` | registered 2FA devices, sessions |
| `~/nextcloud/authelia/secrets/` | `jwt_secret`, `session_secret`, `storage_encryption_key`, `smtp_password` (mode 600, not in Git) |

Compose service:

```yaml
  authelia:
    image: authelia/authelia:4.39
    restart: unless-stopped
    volumes:
      - ./authelia/config:/config
      - ./authelia/secrets:/secrets:ro
    environment:
      TZ: Europe/Zurich
      AUTHELIA_IDENTITY_VALIDATION_RESET_PASSWORD_JWT_SECRET_FILE: /secrets/jwt_secret
      AUTHELIA_SESSION_SECRET_FILE: /secrets/session_secret
      AUTHELIA_STORAGE_ENCRYPTION_KEY_FILE: /secrets/storage_encryption_key
      AUTHELIA_NOTIFIER_SMTP_PASSWORD_FILE: /secrets/smtp_password
    networks:
      - nextcloud_net
```

Useful commands (from `~/nextcloud`):

```bash
# New password hash for users_database.yml
docker run --rm authelia/authelia:4.39 authelia crypto hash generate argon2
# Lost your phone: remove the registered authenticator app so you can register a new one
docker compose exec authelia authelia storage user totp delete plasbeach --config /config/configuration.yml
docker compose restart authelia   # after editing the config
```
