#!/usr/bin/env python3
"""AI usage for the www.plasbea.ch home page (shown only when logged in).

Combines, every minute:
  - Claude subscription limits, saved by the Claude Code status line (statusline.py):
    ~/.local/share/plasbeach/claude-limits.json
  - API key usage: one line per call written by endotitre and the spam filter:
    ~/.local/share/plasbeach/api-usage.jsonl, priced with the list prices below
  - API key check (every 10 min): a free GET /v1/models with the key
Writes ~/www/private/ai-usage/usage.json; Caddy serves it at /api/ai/usage.json after the login check.
The Anthropic API can't report a key's remaining credit balance, so the panel shows spending instead.
"""
import json
import os
import time
import urllib.error
import urllib.request
from collections import defaultdict
from datetime import datetime
from pathlib import Path

HOME = Path.home()
LIMITS = HOME / ".local/share/plasbeach/claude-limits.json"
USAGE = HOME / ".local/share/plasbeach/api-usage.jsonl"
SECRETS = HOME / "ai-mailbox/secrets.env"
OUT = Path(os.environ.get("AI_USAGE_OUT", HOME / "www/private/ai-usage/usage.json"))
KEYCHECK = HOME / ".cache/plasbeach/ai-keycheck.json"

# USD per million tokens: input, output (cache reads 0.1× input, cache writes 1.25× input)
PRICES = {
    "claude-haiku-5-5": (0.10, 0.50),
    "claude-sonnet-5-5": (2.0, 10.0),
    "claude-opus-5-5": (4.0, 20.0),
    "claude-fable-5-2": (8.0, 40.0),
}


def price(model: str):
    for k, v in PRICES.items():
        if model.startswith(k):
            return v
    return (4.0, 20.0)  # unknown: assume Opus-level so we never under-report


def cost(r: dict) -> float:
    pi, po = price(r.get("model", ""))
    return (r.get("in", 0) * pi + r.get("out", 0) * po + r.get("cr", 0) * pi * 0.1 + r.get("cw", 0) * pi * 1.25) / 1e6


def api_key() -> str:
    try:
        for line in SECRETS.read_text().splitlines():
            if line.startswith("ANTHROPIC_API_KEY="):
                return line.split("=", 1)[1].strip()
    except OSError:
        pass
    return ""


def key_status() -> dict:
    """Checks the key at most every 10 minutes (the models list is free)."""
    try:
        cached = json.loads(KEYCHECK.read_text())
        if time.time() - cached.get("checked", 0) < 600:
            return cached
    except (OSError, ValueError):
        pass
    key = api_key()
    st = {"checked": int(time.time())}
    if not key:
        st["status"] = "missing"
    else:
        req = urllib.request.Request("https://api.anthropic.com/v1/models", headers={"x-api-key": key, "anthropic-version": "2023-06-01"})
        try:
            with urllib.request.urlopen(req, timeout=15):
                st["status"] = "ok"
        except urllib.error.HTTPError as e:
            st["status"] = "invalid" if e.code in (401, 403) else f"error {e.code}"
        except OSError:
            st["status"] = "unreachable"
    KEYCHECK.parent.mkdir(parents=True, exist_ok=True)
    KEYCHECK.write_text(json.dumps(st))
    return st


def api_usage() -> dict:
    now = datetime.now().astimezone()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).timestamp()
    today = now.strftime("%Y-%m-%d")
    by_app, by_model, by_day = defaultdict(float), defaultdict(float), defaultdict(float)
    calls = tokens = 0
    total = today_cost = 0.0
    last = 0
    try:
        lines = USAGE.read_text().splitlines()
    except OSError:
        lines = []
    for line in lines:
        try:
            r = json.loads(line)
        except ValueError:
            continue
        ts = r.get("ts", 0)
        c = cost(r)
        day = datetime.fromtimestamp(ts).strftime("%Y-%m-%d")
        if ts >= time.time() - 30 * 86400:
            by_day[day] += c
        last = max(last, ts)
        if ts < month_start:
            continue
        calls += 1
        tokens += r.get("in", 0) + r.get("out", 0) + r.get("cr", 0) + r.get("cw", 0)
        total += c
        by_app[r.get("app", "?")] += c
        by_model[r.get("model", "?")] += c
        if day == today:
            today_cost += c
    days = [datetime.fromtimestamp(time.time() - i * 86400).strftime("%Y-%m-%d") for i in range(29, -1, -1)]
    return {
        "month": round(total, 4), "today": round(today_cost, 4), "calls": calls, "tokens": tokens, "last_call": last,
        "by_app": {k: round(v, 4) for k, v in sorted(by_app.items(), key=lambda x: -x[1])},
        "by_model": {k: round(v, 4) for k, v in sorted(by_model.items(), key=lambda x: -x[1])},
        "daily": [[d, round(by_day.get(d, 0.0), 4)] for d in days],
    }


def claude_limits() -> dict:
    try:
        d = json.loads(LIMITS.read_text())
    except (OSError, ValueError):
        return {"available": False}
    out = {"available": True, "updated": d.get("ts"), "model": (d.get("model") or {}).get("display_name"), "limits": []}
    names = {"five_hour": "5-hour window", "seven_day": "Week", "seven_day_opus": "Week (Opus)", "seven_day_sonnet": "Week (Sonnet)"}
    for k, v in (d.get("rate_limits") or {}).items():
        if not isinstance(v, dict):
            continue
        pct = v.get("used_percentage", v.get("utilization"))
        if pct is None:
            continue
        out["limits"].append({"id": k, "label": names.get(k, k.replace("_", " ")), "used_pct": round(float(pct), 1), "resets_at": v.get("resets_at")})
    return out


def main() -> None:
    data = {"ts": int(time.time()), "claude": claude_limits(), "api": {**api_usage(), "key": key_status()}}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    tmp = OUT.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, separators=(",", ":")))
    os.chmod(tmp, 0o644)
    os.replace(tmp, OUT)


if __name__ == "__main__":
    main()
