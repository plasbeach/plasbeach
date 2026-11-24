#!/usr/bin/env python3
"""Write live Raspberry Pi stats to a JSON file for the plasbea.ch home page.

The file lives outside the public site (~/www/private is not under Caddy's site root).
Caddy serves it at www.plasbea.ch/api/pi/stats.json only after the login check
(forward_auth to apps/auth), so the panel shows up only when logged in.
"""
import json, os, shutil, subprocess, time, urllib.request
from collections import deque

OUT = os.path.expanduser(os.environ.get("PI_STATS_OUT", "~/www/private/pi-stats/stats.json"))
INTERVAL = 5          # seconds between samples
HISTORY = 180         # 180 x 5 s = 15 min of history
APPS = {              # app id -> URL to health-check (every 30 s)
    "nextcloud": "https://www.plasbea.ch/nextcloud/status.php",
    "site": "https://www.plasbea.ch/",
}
USER_SERVICES = ["calendar-mail", "plasbeach-auth", "ai-spamfilter"]


def read(path, default=None):
    try:
        with open(path) as f:
            return f.read().strip()
    except OSError:
        return default


def hwmon(name, file):
    for h in os.listdir("/sys/class/hwmon"):
        if read(f"/sys/class/hwmon/{h}/name") == name:
            v = read(f"/sys/class/hwmon/{h}/{file}")
            return int(v) if v and v.lstrip("-").isdigit() else None
    return None


def cpu_times():
    parts = [int(x) for x in read("/proc/stat").splitlines()[0].split()[1:]]
    idle = parts[3] + parts[4]
    return idle, sum(parts)


def net_bytes(iface="eth0"):
    rx = read(f"/sys/class/net/{iface}/statistics/rx_bytes", "0")
    tx = read(f"/sys/class/net/{iface}/statistics/tx_bytes", "0")
    return int(rx), int(tx)


def meminfo():
    m = {}
    for line in read("/proc/meminfo").splitlines():
        k, v = line.split(":", 1)
        m[k] = int(v.split()[0]) * 1024
    return m


def throttled():
    try:
        out = subprocess.run(["vcgencmd", "get_throttled"], capture_output=True, text=True, timeout=3).stdout
        v = int(out.strip().split("=")[1], 16)
    except Exception:
        return None
    return {
        "undervoltage_now": bool(v & 0x1), "throttled_now": bool(v & 0x4),
        "undervoltage_seen": bool(v & 0x10000), "throttled_seen": bool(v & 0x40000),
    }


def containers():
    try:
        out = subprocess.run(["docker", "ps", "-a", "--format", "{{.Names}}\t{{.State}}"],
                             capture_output=True, text=True, timeout=10).stdout
        return [{"name": n, "state": s} for n, s in (l.split("\t") for l in out.splitlines() if "\t" in l)]
    except Exception:
        return []


def user_services():
    res = []
    for s in USER_SERVICES:
        r = subprocess.run(["systemctl", "--user", "is-active", s], capture_output=True, text=True)
        res.append({"name": s, "state": r.stdout.strip() or "unknown"})
    return res


def app_health():
    res = {}
    for app, url in APPS.items():
        t0 = time.monotonic()
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "pistats"})
            with urllib.request.urlopen(req, timeout=8) as r:
                ok = 200 <= r.status < 400
        except Exception:
            ok = False
        res[app] = {"up": ok, "ms": round((time.monotonic() - t0) * 1000)}
    return res


def write_atomic(data):
    tmp = OUT + ".tmp"
    with open(tmp, "w") as f:
        json.dump(data, f, separators=(",", ":"))
    os.chmod(tmp, 0o644)
    os.replace(tmp, OUT)


def main():
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    hist = deque(maxlen=HISTORY)
    prev_idle, prev_total = cpu_times()
    prev_rx, prev_tx = net_bytes()
    prev_t = time.monotonic()
    slow, slow_at = {}, 0
    while True:
        time.sleep(INTERVAL)
        now = time.monotonic()
        idle, total = cpu_times()
        cpu = 100 * (1 - (idle - prev_idle) / max(total - prev_total, 1))
        rx, tx = net_bytes()
        dt = now - prev_t
        rx_s, tx_s = (rx - prev_rx) / dt, (tx - prev_tx) / dt
        prev_idle, prev_total, prev_rx, prev_tx, prev_t = idle, total, rx, tx, now

        if now - slow_at > 30 or not slow:      # slower checks every 30 s
            slow = {"containers": containers(), "services": user_services(),
                    "apps": app_health(), "throttle": throttled()}
            slow_at = now

        m = meminfo()
        du = shutil.disk_usage("/")
        temp = (hwmon("cpu_thermal", "temp1_input") or 0) / 1000
        ts = int(time.time())
        hist.append([ts, round(temp, 1), round(cpu, 1)])
        load = os.getloadavg()
        write_atomic({
            "ts": ts,
            "hostname": "raspbeach",
            "model": read("/proc/device-tree/model", "").rstrip("\x00"),
            "uptime_s": int(float(read("/proc/uptime").split()[0])),
            "cpu": {"temp_c": round(temp, 1), "usage_pct": round(cpu, 1), "cores": os.cpu_count(),
                    "load": [round(x, 2) for x in load],
                    "freq_mhz": int(read("/sys/devices/system/cpu/cpu0/cpufreq/scaling_cur_freq", "0")) // 1000},
            "fan_rpm": hwmon("pwmfan", "fan1_input"),
            "nvme_temp_c": (hwmon("nvme", "temp1_input") or 0) / 1000 or None,
            "mem": {"total": m["MemTotal"], "used": m["MemTotal"] - m["MemAvailable"]},
            "disk": {"total": du.total, "used": du.used},
            "net": {"rx_bps": round(rx_s), "tx_bps": round(tx_s)},
            "history": list(hist),
            **slow,
        })


if __name__ == "__main__":
    main()
