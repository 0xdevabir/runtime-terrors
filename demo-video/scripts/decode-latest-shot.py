#!/usr/bin/env python3
"""Decode newest CDP Page.captureScreenshot JSON → PNG path from argv."""
import json, base64, sys
from pathlib import Path

out = Path(sys.argv[1])
logs = sorted(Path.home().joinpath(".cursor/browser-logs").glob("cdp-response-Page.captureScreenshot-*.json"))
if not logs:
    raise SystemExit("no cdp screenshot logs")
data = json.loads(logs[-1].read_text())

def find(o):
    if isinstance(o, dict):
        for k, v in o.items():
            if k == "data" and isinstance(v, str) and len(v) > 1000:
                return v
            r = find(v)
            if r:
                return r
    elif isinstance(o, list):
        for i in o:
            r = find(i)
            if r:
                return r
    return None

b64 = data.get("data") or (data.get("result") or {}).get("data") or find(data)
if not b64:
    raise SystemExit(f"no data in {logs[-1]}")
out.parent.mkdir(parents=True, exist_ok=True)
out.write_bytes(base64.b64decode(b64))
print(out, out.stat().st_size)
