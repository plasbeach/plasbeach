# Spam filter

Runs in the background on the Pi and checks both Infomaniak mailboxes every 5 minutes.
Claude (Haiku 5.5) reads each new email; confident spam or phishing (score ≥ 0.85) is moved to a
**Spam-IA** folder. Nothing is ever deleted.

- People you've written to (your Sent folder) are never moved.
- Move a mail from Spam-IA back to the inbox and its sender is allowlisted within 5 minutes.
- Instructions hidden inside an email are ignored.

## Files outside the repo (`~/ai-mailbox`, or `AI_MAILBOX_DIR`)

| File | What |
|---|---|
| `secrets.env` | Mailbox app passwords, CalDAV login, Anthropic API key (mode 600, never committed). The endotitre app reads it too. |
| `state.db` | Which mails were checked, what was moved, the allowlist |
| `filter.log` | Every decision |
| `.venv/` | Python environment (`python3 -m venv ~/ai-mailbox/.venv && ~/ai-mailbox/.venv/bin/pip install -r requirements.txt`) |

## Commands

```bash
~/ai-mailbox/.venv/bin/python spamfilter.py --once --dry-run   # classify only, change nothing
~/ai-mailbox/.venv/bin/python spamfilter.py --baseline         # mark the current inbox as already checked
cp ai-spamfilter.service ~/.config/systemd/user/ && systemctl --user daemon-reload && systemctl --user enable --now ai-spamfilter
tail -f ~/ai-mailbox/filter.log
```
