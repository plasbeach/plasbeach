// Talks to the backend on the Pi, which holds the Claude API key and the mail/calendar credentials.
// The key never reaches the browser.
import type { AskTarget } from '@/data/types'

export interface AskResult {
  ok: boolean
  message: string
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
    const res = await fetch('/api/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target, instruction }),
    })
    if (!res.ok) throw new Error(String(res.status))
    const data = (await res.json()) as { message?: string }
    return { ok: true, message: data.message ?? 'Done.' }
  } catch {
    return { ok: false, message: 'Claude isn’t connected yet. Once the Pi backend is running, this request will be sent to it.' }
  }
}
