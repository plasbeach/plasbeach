import { loadConfig } from './config.js'
import { createAuthenticator } from './auth.js'
import { buildApp } from './app.js'

const cfg = loadConfig()
const app = buildApp(cfg, createAuthenticator(cfg))

if (cfg.devEmail) app.log.warn(`DEV_AUTH_EMAIL is set: every request is treated as ${cfg.devEmail}. Never use this in production.`)

app.listen({ host: cfg.host, port: cfg.port }).catch((err) => {
  app.log.error(err)
  process.exit(1)
})
