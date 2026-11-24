// Reads mailbox, calendar and Claude credentials from a private env file on the Pi
// (SECRETS_FILE, e.g. ~/ai-mailbox/secrets.env, mode 600). Nothing here is sent to the browser.
import { readFileSync } from 'node:fs'

export interface MailAccountCreds {
  id: string
  address: string
  password: string
  imapHost: string
  smtpHost: string
}

export interface Secrets {
  mail: MailAccountCreds[]
  caldav?: { serverUrl: string; username: string; password: string }
  anthropicKey?: string
}

function parseEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of text.split('\n')) {
    if (!line.includes('=') || line.trimStart().startsWith('#')) continue
    const i = line.indexOf('=')
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim()
  }
  return out
}

/** Short stable id for an address: "contact@arnaudnager.ch" -> "arnaudnager-ch". */
export function accountId(address: string): string {
  return address.split('@')[1].replace(/[^a-z0-9]+/gi, '-').toLowerCase()
}

export function loadSecrets(file: string | undefined): Secrets {
  if (!file) return { mail: [] }
  const e = parseEnv(readFileSync(file, 'utf8'))
  const mail: MailAccountCreds[] = []
  for (let i = 1; e[`MAIL${i}_ADDRESS`]; i++) {
    const address = e[`MAIL${i}_ADDRESS`]
    mail.push({
      id: accountId(address),
      address,
      password: e[`MAIL${i}_PASSWORD`],
      imapHost: e.IMAP_HOST || 'mail.infomaniak.com',
      smtpHost: e.SMTP_HOST || 'mail.infomaniak.com',
    })
  }
  const caldav = e.CALDAV_USER && e.CALDAV_PASSWORD
    ? { serverUrl: e.CALDAV_URL ? new URL(e.CALDAV_URL).origin : 'https://sync.infomaniak.com', username: e.CALDAV_USER, password: e.CALDAV_PASSWORD }
    : undefined
  return { mail, caldav, anthropicKey: e.ANTHROPIC_API_KEY || undefined }
}
