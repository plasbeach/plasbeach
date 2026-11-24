import { homedir } from 'node:os'
import { join } from 'node:path'
import { buildApp } from './app.js'
import { UserStore } from './users.js'

const dir = process.env.AUTH_DIR ?? join(homedir(), '.config/plasbeach/auth')
const users = new UserStore(join(dir, 'users.json'))
if (!users.names().length) {
  console.error(`No users in ${join(dir, 'users.json')}. Create one with: npm run user -- add <name>`)
  process.exit(1)
}

const app = buildApp(users, {
  publicOrigin: process.env.PUBLIC_ORIGIN ?? 'https://www.plasbea.ch',
  sessionsFile: join(dir, 'sessions.json'),
})

app.listen({ host: process.env.HOST ?? '127.0.0.1', port: Number(process.env.PORT ?? 8789) }).catch((err) => {
  app.log.error(err)
  process.exit(1)
})
