"""Check container-local Rio readiness without contacting the Agent."""

import urllib.error
import urllib.request


def check_health(url: str = "http://127.0.0.1:8000/healthz") -> int:
    try:
        with urllib.request.urlopen(url, timeout=5) as response:
            return 0 if response.status == 200 else 1
    except (urllib.error.URLError, TimeoutError, OSError):
        return 1


if __name__ == "__main__":
    raise SystemExit(check_health())
