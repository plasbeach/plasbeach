import { homedir } from 'node:os'
import { join } from 'node:path'
import { buildApp } from './app.js'
import { NoteStore } from './store.js'

const secret = process.env.PROXY_AUTH_SECRET ?? ''
if (secret.length < 32) {
  console.error('PROXY_AUTH_SECRET (at least 32 characters, same value as in the Caddyfile) is missing')
  process.exit(1)
}

const store = new NoteStore(process.env.NOTES_FILE ?? join(homedir(), '.local/share/plasbeach/about/notes.json'))
const app = buildApp(store, {
  publicOrigin: process.env.PUBLIC_ORIGIN ?? 'https://www.plasbea.ch',
  proxySecret: secret,
})

app.listen({ host: process.env.HOST ?? '127.0.0.1', port: Number(process.env.PORT ?? 8790) }).catch((err) => {
  app.log.error(err)
  process.exit(1)
})
