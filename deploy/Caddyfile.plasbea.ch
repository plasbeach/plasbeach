# Template for the www.plasbea.ch block of ~/nextcloud/Caddyfile. Real values:
#   SECRET = PROXY_AUTH_SECRET from ~/.config/plasbeach/calendar-mail.env
# plasbea.ch: the site (Vue app) + private apps. Source: github.com/plasbeach/plasbeach (deploy/)
www.plasbea.ch {
    encode gzip zstd

    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
        X-Content-Type-Options nosniff
        Referrer-Policy strict-origin-when-cross-origin
    }

    # Login service (password + authenticator code): apps/auth, user service plasbeach-auth.
    # The login page itself is /login in the site.
    handle /auth/* {
        # /auth/verify is only for Caddy's own forward_auth below, not for browsers
        respond /auth/verify 404
        reverse_proxy 172.18.0.1:8789
    }

    # Calendar + Mail (private): login + 2FA first, then the Node backend on the host
    redir /mail /mail/ 308
    handle /mail/* {
        route {
            forward_auth 172.18.0.1:8789 {
                uri /auth/verify
                copy_headers Remote-User
            }
            uri strip_prefix /mail
            reverse_proxy 172.18.0.1:8787 {
                # Replaces anything the client sent: only Caddy knows this secret
                header_up X-Proxy-Auth "SECRET"
                header_up X-Proxy-User {http.request.header.Remote-User}
            }
        }
    }

    # Nextcloud (moved here from nager.internet-box.ch). Apache in the container sees "/",
    # Nextcloud generates /nextcloud/... links itself (occ: overwritewebroot=/nextcloud,
    # overwritehost=www.plasbea.ch, overwrite.cli.url=https://www.plasbea.ch/nextcloud).
    redir /nextcloud /nextcloud/ 308
    redir /.well-known/carddav /nextcloud/remote.php/dav/ 301
    redir /.well-known/caldav /nextcloud/remote.php/dav/ 301
    handle_path /nextcloud/* {
        reverse_proxy app:80
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

# Old Nextcloud address
nager.internet-box.ch {
    redir https://www.plasbea.ch/nextcloud{uri} 301
}
