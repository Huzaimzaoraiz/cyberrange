# server.py
# Vulnerable "Network Diagnostics" page for "Command Injection" challenge
# The ping endpoint passes user input directly to the shell — ; or && can chain commands

import os
import subprocess
from flask import Flask, request, render_template_string

FLAG = os.environ.get("FLAG", "flag{default}")
PORT = 80

# Write the flag to a file so attackers can discover it via command injection
with open("/flag.txt", "w") as f:
    f.write(FLAG + "\n")

app = Flask(__name__)


HOME_PAGE = """
<!DOCTYPE html>
<html>
<head>
  <title>NetDiag — Network Diagnostics</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #0d0d1a; color: #c9d1d9; font-family: monospace;
           display: flex; justify-content: center; align-items: center; min-height: 100vh; }
    .card { background: #161b22; border: 1px solid #30363d; border-radius: 8px;
            padding: 40px; width: 520px; }
    h1 { color: #58a6ff; margin-bottom: 4px; }
    .sub { color: #8b949e; font-size: 0.8rem; margin-bottom: 28px; }
    label { display: block; color: #8b949e; font-size: 0.8rem; margin-bottom: 4px; }
    input[type=text] { width: 100%; padding: 10px 12px; background: #0d1117;
                       border: 1px solid #30363d; border-radius: 6px; color: #c9d1d9;
                       font-family: monospace; font-size: 0.9rem; }
    input:focus { outline: none; border-color: #58a6ff; }
    .field { margin-bottom: 16px; }
    button { padding: 10px 24px; background: #1f6feb; border: none; border-radius: 6px;
             color: #fff; font-family: monospace; font-size: 0.9rem; cursor: pointer; }
    button:hover { background: #388bfd; }
    pre { margin-top: 24px; background: #0d1117; border: 1px solid #30363d;
          border-radius: 6px; padding: 16px; white-space: pre-wrap; word-break: break-all;
          color: #3fb950; min-height: 60px; font-size: 0.85rem; }
    .hint { margin-top: 16px; color: #3d4451; font-size: 0.75rem; }
  </style>
</head>
<body>
  <div class="card">
    <h1>📡 NetDiag</h1>
    <p class="sub">Internal network diagnostics tool — ping a host to check connectivity.</p>
    <form method="GET" action="/ping">
      <div class="field">
        <label>Target Host / IP</label>
        <input type="text" name="host" value="{{ host or '8.8.8.8' }}" autocomplete="off" />
      </div>
      <button type="submit">▶ Run Ping</button>
    </form>
    {% if output is not none %}
    <pre>{{ output }}</pre>
    {% endif %}
    <p class="hint">Tip: try a hostname like google.com or an IP address.</p>
  </div>
</body>
</html>
"""


@app.route("/", methods=["GET"])
def index():
    return render_template_string(HOME_PAGE, host=None, output=None)


@app.route("/ping", methods=["GET"])
def ping():
    host = request.args.get("host", "").strip()
    if not host:
        return render_template_string(HOME_PAGE, host="", output="Error: no host specified.")

    # 🚨 VULNERABLE: host is passed directly to shell=True — semicolons let attackers chain commands
    try:
        result = subprocess.run(
            "ping -c 2 " + host,
            shell=True,
            capture_output=True,
            text=True,
            timeout=10,
        )
        output = result.stdout + result.stderr
    except subprocess.TimeoutExpired:
        output = "Error: ping timed out."
    except Exception as e:
        output = "Error: " + str(e)

    return render_template_string(HOME_PAGE, host=host, output=output or "(no output)")


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=PORT)
