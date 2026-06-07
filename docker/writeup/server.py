import re
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlsplit

PORT = 80
TIME_CAP_SECONDS = 3

CMS_DATA = {
    "cms_siteprefs.sitepref_value": "5a599ef579066807",
    "cms_users.username": "jkr",
    "cms_users.email": "jkr@writeup.htb",
    "cms_users.password": "62def4866937f08cc13bab43bb14e6f7",
}


def page(title, body):
    return f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>{title}</title>
  <style>
    body {{ margin: 0; font: 16px Arial, sans-serif; background: #f7f7f7; color: #222; }}
    main {{ max-width: 860px; margin: 72px auto; padding: 0 24px; }}
    h1 {{ font-size: 32px; font-weight: 500; margin-bottom: 14px; }}
    p {{ line-height: 1.55; }}
    a {{ color: #2768a8; }}
    .notice {{ margin-top: 28px; padding: 14px 16px; background: #fff; border-left: 4px solid #d8d8d8; }}
  </style>
</head>
<body><main>{body}</main></body>
</html>"""


def index():
    return page(
        "Nothing here yet.",
        """
        <h1>Nothing here yet.</h1>
        <p>This site is still being prepared. Automated scanners are rate limited because of a noisy DoS protection script.</p>
        <div class="notice">Public writeups are not ready for release.</div>
        """,
    )


def robots():
    return "User-agent: *\nDisallow: /writeup/\n"


def writeup():
    return page(
        "Writeups",
        """
        <meta name="Generator" content="CMS Made Simple - Copyright (C) 2004-2019. All rights reserved." />
        <h1>Writeups</h1>
        <p>Writeups will be posted here once the CMS migration is finished.</p>
        <ul>
          <li><a href="#">Hack The Box - Retired</a></li>
          <li><a href="#">Linux enumeration notes</a></li>
        </ul>
        """,
    )


def _hex_to_text(value):
    try:
        return bytes.fromhex(value).decode("utf-8", errors="ignore")
    except ValueError:
        return ""


def _extract_sleep(payload):
    match = re.search(r"sleep\((\d+)\)", payload)
    if not match:
        return 0
    return min(int(match.group(1)), TIME_CAP_SECONDS)


def _matches_time_based_probe(payload):
    table = None
    column = None
    if "from+cms_siteprefs" in payload and "sitepref_value+like+0x" in payload:
        table, column = "cms_siteprefs", "sitepref_value"
    elif "from+cms_users" in payload:
        table = "cms_users"
        for candidate in ("username", "email", "password"):
            if f"{candidate}+like+0x" in payload:
                column = candidate
                break

    if not table or not column:
        return False

    hex_match = re.search(rf"{column}\+like\+0x([0-9a-fA-F]+)25", payload)
    if not hex_match:
        return False

    probe = _hex_to_text(hex_match.group(1))
    expected = CMS_DATA.get(f"{table}.{column}", "")
    return expected.startswith(probe)


def moduleinterface(query):
    payload = parse_qs(query).get("m1_idlist", [""])[0].replace(" ", "+")
    if _matches_time_based_probe(payload):
        time.sleep(_extract_sleep(payload))
    return ""


def not_found():
    return page("Not found", "<h1>Not found</h1><p>The requested page does not exist.</p>")


class Handler(BaseHTTPRequestHandler):
    server_version = "Apache/2.4.29"
    sys_version = ""

    def do_GET(self):
        parsed = urlsplit(self.path)
        routes = {
            "/": (200, "text/html; charset=utf-8", index),
            "/robots.txt": (200, "text/plain; charset=utf-8", robots),
            "/writeup": (200, "text/html; charset=utf-8", writeup),
            "/writeup/": (200, "text/html; charset=utf-8", writeup),
        }
        if parsed.path == "/writeup/moduleinterface.php":
            self._send(200, "text/html; charset=utf-8", moduleinterface(parsed.query))
            return
        status, content_type, view = routes.get(parsed.path, (404, "text/html; charset=utf-8", not_found))
        self._send(status, content_type, view())

    def log_message(self, _format, *_args):
        return

    def _send(self, status, content_type, body):
        data = body.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
