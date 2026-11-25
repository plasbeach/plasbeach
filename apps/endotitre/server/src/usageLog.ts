// Records the tokens of every Claude API call (one JSON line each) so the home page can show
// what the API key costs this month. Shared with the spam filter: ~/.local/share/plasbeach/api-usage.jsonl
import { appendFile, mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

const FILE = process.env.API_USAGE_LOG ?? join(homedir(), '.local/share/plasbeach/api-usage.jsonl')

interface Usage { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null }

export function logUsage(app: string, feature: string, model: string, usage: Usage | undefined) {
  if (!usage) return
  const line = JSON.stringify({
    ts: Math.floor(Date.now() / 1000), app, feature, model,
    in: usage.input_tokens ?? 0, out: usage.output_tokens ?? 0,
    cr: usage.cache_read_input_tokens ?? 0, cw: usage.cache_creation_input_tokens ?? 0,
  })
  void mkdir(dirname(FILE), { recursive: true }).then(() => appendFile(FILE, line + '\n')).catch(() => {})
}
