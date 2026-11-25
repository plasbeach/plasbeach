#!/usr/bin/env python3
"""Chess.com rating history for the www.plasbea.ch home page.

chess.com's public API has no rating-history endpoint, so this reads the monthly game
archives and keeps the player's rating after each rated standard game. Past months never
change, so they are cached; only the current month is fetched again on each run.

Output: ~/www/data/chess/chess.json, served publicly by Caddy at /api/chess/chess.json.
Run by the systemd user timer chess-stats.timer (deploy/chess-stats.*).
"""
import json
import os
import sys
import time
import urllib.request
from pathlib import Path

USER = "plasbeach"
API = f"https://api.chess.com/pub/player/{USER}"
OUT = Path.home() / "www/data/chess/chess.json"
CACHE = Path.home() / ".cache/plasbeach/chess"
CLASSES = ("rapid", "blitz", "bullet", "daily")
HEADERS = {"User-Agent": "plasbea.ch-site (rating chart)"}


def get(url: str):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def month_games(url: str, current: bool) -> list:
    """Games of one archive month; finished months are read from the cache."""
    cached = CACHE / (url.rsplit("/games/", 1)[1].replace("/", "-") + ".json")
    if not current and cached.exists():
        return json.loads(cached.read_text())
    games = get(url).get("games", [])
    # Keep only what the chart needs
    slim = []
    for g in games:
        if not g.get("rated") or g.get("rules") != "chess" or g.get("time_class") not in CLASSES:
            continue
        side = "white" if g["white"]["username"].lower() == USER else "black"
        slim.append([g["end_time"], g["time_class"], g[side]["rating"]])
    if not current:
        cached.write_text(json.dumps(slim))
    time.sleep(0.5)  # be gentle with the API
    return slim


def main() -> int:
    CACHE.mkdir(parents=True, exist_ok=True)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    archives = get(f"{API}/games/archives")["archives"]
    this_month = time.strftime("%Y/%m", time.gmtime())
    games = []
    for url in archives:
        games += month_games(url, current=url.endswith(this_month) or url == archives[-1])
    games.sort()

    stats = get(f"{API}/stats")
    out = {
        "username": USER,
        "url": f"https://www.chess.com/member/{USER}",
        "updated": int(time.time()),
        "classes": {},
    }
    for c in CLASSES:
        hist = [[t, r] for t, tc, r in games if tc == c]
        s = stats.get(f"chess_{c}") or {}
        if not hist:
            continue
        rec = s.get("record", {})
        out["classes"][c] = {
            "current": s.get("last", {}).get("rating", hist[-1][1]),
            "best": s.get("best", {}).get("rating"),
            "games": rec.get("win", 0) + rec.get("loss", 0) + rec.get("draw", 0),
            "history": hist,
        }

    tmp = OUT.with_suffix(".tmp")
    tmp.write_text(json.dumps(out, separators=(",", ":")))
    os.replace(tmp, OUT)
    print(f"wrote {OUT}: " + ", ".join(f"{c} {len(v['history'])}" for c, v in out["classes"].items()))
    return 0


if __name__ == "__main__":
    sys.exit(main())
