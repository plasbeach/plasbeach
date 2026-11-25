#!/usr/bin/env python3
"""Claude Code status line that also records your subscription limits for www.plasbea.ch.

Claude Code runs this on every status refresh and passes JSON on stdin. We keep only what the
home page needs (model, usage limits and when they reset, session cost) in
~/.local/share/plasbeach/claude-limits.json, then print a short status line.
Nothing here reads or sends credentials.
"""
import json
import os
import sys
import tempfile
import time
from datetime import datetime

OUT = os.path.expanduser("~/.local/share/plasbeach/claude-limits.json")
KEEP = ("rate_limits", "cost", "model", "version")


def main() -> None:
    try:
        data = json.load(sys.stdin)
    except Exception:
        print("claude")
        return
    keep = {k: data[k] for k in KEEP if k in data}
    # Any other top-level key about limits/usage, in case the format grows
    for k, v in data.items():
        if k not in keep and any(w in k.lower() for w in ("limit", "usage", "quota")):
            keep[k] = v
    keep["ts"] = int(time.time())
    keep["keys"] = sorted(data.keys())  # to see what Claude Code sends (names only)
    try:
        os.makedirs(os.path.dirname(OUT), exist_ok=True)
        fd, tmp = tempfile.mkstemp(dir=os.path.dirname(OUT))
        with os.fdopen(fd, "w") as f:
            json.dump(keep, f)
        os.chmod(tmp, 0o644)
        os.replace(tmp, OUT)
    except OSError:
        pass

    model = (data.get("model") or {}).get("display_name") or "Claude"
    parts = [model]
    for name, label in (("five_hour", "5h"), ("seven_day", "7d")):
        lim = (data.get("rate_limits") or {}).get(name) or {}
        pct = lim.get("used_percentage", lim.get("utilization"))
        if pct is not None:
            s = f"{label} {round(float(pct))}%"
            reset = lim.get("resets_at")
            if reset:
                try:
                    t = datetime.fromisoformat(str(reset).replace("Z", "+00:00")) if not str(reset).isdigit() else datetime.fromtimestamp(int(reset))
                    s += f" ↻{t.astimezone().strftime('%H:%M' if name == 'five_hour' else '%a %H:%M')}"
                except ValueError:
                    pass
            parts.append(s)
    print(" · ".join(parts))


if __name__ == "__main__":
    main()
