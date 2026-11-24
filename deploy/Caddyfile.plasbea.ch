# Template for the www.plasbea.ch block of ~/nextcloud/Caddyfile. Real values:
#   HASH   = MAIL_LOGIN_HASH from ~/.config/plasbeach/caddy-auth.env (caddy hash-password)
#   SECRET = PROXY_AUTH_SECRET from ~/.config/plasbeach/calendar-mail.env
# plasbea.ch: the site (Vue app) + private apps. Source: github.com/plasbeach/plasbeach (deploy/)
www.plasbea.ch {
    encode gzip zstd

    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
        X-Content-Type-Options nosniff
        Referrer-Policy strict-origin-when-cross-origin
    }

    # Calendar + Mail (private): password first, then the Node backend on the host
    redir /mail /mail/ 308
    handle_path /mail/* {
        basic_auth {
            arnaud HASH
        }
        reverse_proxy 172.18.0.1:8787 {
            # Replaces anything the client sent: only Caddy knows this secret
            header_up X-Proxy-Auth "SECRET"
            header_up X-Proxy-User {http.auth.user.id}
        }
    }

    # The public site: a single-page app, so unknown paths fall back to index.html
    handle {
        root * /srv/www/plasbea.ch
        @assets path /assets/*
        header @assets Cache-Control "public, max-age=31536000, immutable"
        try_files {path} /index.html
        file_server
    }
}
