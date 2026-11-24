// Talks to the backend on the Pi, which holds the Claude API key and the mail/calendar credentials.
// The key never reaches the browser.
import type { AskTarget } from '@/data/types'
import { apiUrl } from './base'

export interface AskResult {
  ok: boolean
  message: string
  /** What Claude changed ('events', 'todos'), so the screens can reload it. */
  changed?: string[]
}

export function describeTarget(t: AskTarget): string {
  if (t.kind === 'event') return t.event.title
  if (t.kind === 'todo') return `To-do · ${t.todo.title}`
  return `Email · ${t.mail.subject}`
}

export function suggestedActions(t: AskTarget): string[] {
  if (t.kind === 'event') return ['Move it to a free slot', 'Message the other people', 'Prepare notes for it', 'Cancel and let them know']
  if (t.kind === 'todo') {
    return t.todo.mailId
      ? ['Draft the reply', 'Find time to do it', 'Summarise the email thread', 'Mark done once sent']
      : ['Break it into steps', 'Find time this week', 'Remind me tomorrow']
  }
  return ['Draft a reply', 'Summarise it', 'Turn it into a to-do']
}

export async function askClaude(target: AskTarget | null, instruction: string): Promise<AskResult> {
  try {
    const res = await fetch(apiUrl('/api/ask'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target, instruction }),
    })
    const data = (await res.json().catch(() => ({}))) as { message?: string; changed?: string[] }
    if (!res.ok) return { ok: false, message: data.message ?? `Claude couldn’t answer (error ${res.status}).` }
    return { ok: true, message: data.message ?? 'Done.', changed: data.changed }
  } catch {
    return { ok: false, message: 'Can’t reach the Pi backend right now.' }
  }
}
