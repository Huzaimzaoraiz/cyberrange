# server.py
# Vulnerable login page for "SQL Injection" challenge
# The login query is built with raw string concatenation — classic sqli

import os
import sqlite3
from flask import Flask, request, render_template_string

FLAG = os.environ.get("FLAG", "flag{default}")
PORT = 80

app = Flask(__name__)

# ---- set up an in-memory SQLite DB with dummy user data ----
DB = sqlite3.connect(":memory:", check_same_thread=False)
DB.execute("""CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    username TEXT NOT NULL,
    password TEXT NOT NULL
)""")
DB.execute("INSERT INTO users VALUES (1, 'admin', 'sup3r_s3cr3t_p4ss!')")
DB.execute("INSERT INTO users VALUES (2, 'guest', 'guest123')")
DB.commit()


HOME_PAGE = """
<!DOCTYPE html>
<html>
<head>
  <title>CorpNet Login</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #0d0d1a; color: #c9d1d9; font-family: monospace; display: flex;
           justify-content: center; align-items: center; height: 100vh; }
    .card { background: #161b22; border: 1px solid #30363d; border-radius: 8px;
            padding: 40px; width: 360px; }
    h1 { color: #58a6ff; margin-bottom: 4px; font-size: 1.4rem; }
    .sub { color: #8b949e; font-size: 0.8rem; margin-bottom: 28px; }
    label { display: block; color: #8b949e; font-size: 0.8rem; margin-bottom: 4px; }
    input { width: 100%; padding: 10px 12px; background: #0d1117; border: 1px solid #30363d;
            border-radius: 6px; color: #c9d1d9; font-family: monospace; font-size: 0.9rem; }
    input:focus { outline: none; border-color: #58a6ff; }
    .field { margin-bottom: 16px; }
    button { width: 100%; padding: 10px; background: #238636; border: none;
             border-radius: 6px; color: #fff; font-family: monospace; font-size: 1rem;
             cursor: pointer; margin-top: 4px; }
    button:hover { background: #2ea043; }
    .hint { margin-top: 20px; color: #3d4451; font-size: 0.75rem; text-align: center; }
    .msg { padding: 10px 14px; border-radius: 6px; margin-bottom: 16px; font-size: 0.85rem; }
    .err { background: #3d1212; border: 1px solid #f85149; color: #f85149; }
    .ok  { background: #12291e; border: 1px solid #3fb950; color: #3fb950; }
  </style>
</head>
<body>
  <div class="card">
    <h1>🔐 CorpNet Portal</h1>
    <p class="sub">Internal employee login</p>
    {% if message %}
      <div class="msg {{ msg_class }}">{{ message }}</div>
    {% endif %}
    <form method="POST" action="/login">
      <div class="field">
        <label>Username</label>
        <input type="text" name="username" placeholder="e.g. admin" autocomplete="off" />
      </div>
      <div class="field">
        <label>Password</label>
        <input type="password" name="password" placeholder="••••••••" />
      </div>
      <button type="submit">Login →</button>
    </form>
    <p class="hint">Hint: the admin account holds something valuable.</p>
  </div>
</body>
</html>
"""

WELCOME_PAGE = """
<!DOCTYPE html>
<html>
<head>
  <title>Welcome, Admin!</title>
  <style>
    body {{ background: #0d0d1a; color: #c9d1d9; font-family: monospace;
           display: flex; justify-content: center; align-items: center; height: 100vh; }}
    .card {{ background: #161b22; border: 1px solid #30363d; border-radius: 8px;
             padding: 40px; max-width: 500px; text-align: center; }}
    h1 {{ color: #3fb950; font-size: 1.4rem; margin-bottom: 12px; }}
    p  {{ color: #8b949e; margin-bottom: 16px; }}
    .flag {{ background: #0d1117; border: 1px solid #3fb950; border-radius: 6px;
             padding: 14px 20px; color: #f0e68c; font-size: 1.1rem; letter-spacing: 2px; }}
  </style>
</head>
<body>
  <div class="card">
    <h1>✅ Access Granted</h1>
    <p>Welcome back, <strong>{username}</strong>.<br>You bypassed the login — here is your reward:</p>
    <div class="flag">{flag}</div>
  </div>
</body>
</html>
"""


@app.route("/", methods=["GET"])
def index():
    return render_template_string(HOME_PAGE, message=None, msg_class=None)


@app.route("/login", methods=["POST"])
def login():
    username = request.form.get("username", "")
    password = request.form.get("password", "")

    # 🚨 VULNERABLE: raw string concatenation — no parameterisation
    query = "SELECT * FROM users WHERE username='" + username + "' AND password='" + password + "'"

    try:
        row = DB.execute(query).fetchone()
    except Exception as e:
        return render_template_string(
            HOME_PAGE,
            message="SQL Error: " + str(e),
            msg_class="err"
        )

    if row:
        return WELCOME_PAGE.format(username=row[1], flag=FLAG)

    return render_template_string(
        HOME_PAGE,
        message="Invalid username or password.",
        msg_class="err"
    )


@app.route("/robots.txt")
def robots():
    return "User-agent: *\nDisallow: /admin\n", 200, {"Content-Type": "text/plain"}


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=PORT)
