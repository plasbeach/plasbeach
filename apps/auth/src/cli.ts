// Manage login users on the Pi.
//   npm run user -- add <name>            create a user (asks for the password)
//   npm run user -- password <name>       change the password
//   npm run user -- reset-2fa <name>      forget the authenticator app (lost phone): next login registers a new one
//   npm run user -- list
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { hashSecret, UserStore } from './users.js'

const dir = process.env.AUTH_DIR ?? join(homedir(), '.config/plasbeach/auth')
const store = new UserStore(join(dir, 'users.json'))
const [cmd, name] = process.argv.slice(2)

async function askPassword(): Promise<string> {
  if (process.env.NEW_PASSWORD) return process.env.NEW_PASSWORD
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const pw = await new Promise<string>((res) => rl.question('Password: ', res))
  rl.close()
  if (pw.length < 12) throw new Error('Use at least 12 characters.')
  return pw
}

async function main() {
  if (cmd === 'list') {
    for (const n of store.names()) console.log(n, store.get(n)!.totp ? '(2FA registered)' : '(no 2FA yet)')
    return
  }
  if (!name) throw new Error('Missing user name')
  const u = store.get(name)
  if (cmd === 'add') {
    if (u) throw new Error('User exists')
    store.set(name, { password: await hashSecret(await askPassword()), totp: null, lastStep: -1, recovery: [] })
  } else if (cmd === 'password') {
    if (!u) throw new Error('No such user')
    store.set(name, { ...u, password: await hashSecret(await askPassword()) })
  } else if (cmd === 'reset-2fa') {
    if (!u) throw new Error('No such user')
    store.set(name, { ...u, totp: null, lastStep: -1, recovery: [] })
  } else throw new Error(`Unknown command ${cmd}`)
  console.log('Done. Restart the service: systemctl --user restart plasbeach-auth')
}

main().catch((e) => { console.error((e as Error).message); process.exit(1) })
