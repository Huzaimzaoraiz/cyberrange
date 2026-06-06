# server.py
# Vulnerable file viewer for "Directory Traversal" challenge
# The /view endpoint reads files relative to /app/files/ without sanitising ../

import os
from flask import Flask, request, render_template_string, abort

FLAG = os.environ.get("FLAG", "flag{default}")
PORT = 80

# Write the flag outside the web root so only path traversal can reach it
with open("/flag.txt", "w") as f:
    f.write(FLAG + "\n")

BASE_DIR = "/app/files"
app = Flask(__name__)


HOME_PAGE = """
<!DOCTYPE html>
<html>
<head>
  <title>FileServ — Document Portal</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #0d0d1a; color: #c9d1d9; font-family: monospace;
           display: flex; justify-content: center; align-items: center; min-height: 100vh; }
    .card { background: #161b22; border: 1px solid #30363d; border-radius: 8px;
            padding: 40px; width: 560px; }
    h1 { color: #58a6ff; margin-bottom: 4px; }
    .sub { color: #8b949e; font-size: 0.8rem; margin-bottom: 28px; }
    .file-list { list-style: none; margin-bottom: 24px; }
    .file-list li { padding: 8px 0; border-bottom: 1px solid #21262d; }
    .file-list a { color: #79c0ff; text-decoration: none; }
    .file-list a:hover { text-decoration: underline; }
    pre { background: #0d1117; border: 1px solid #30363d; border-radius: 6px;
          padding: 16px; white-space: pre-wrap; word-break: break-all;
          color: #c9d1d9; font-size: 0.85rem; }
    .err-box { background: #3d1212; border: 1px solid #f85149; border-radius: 6px;
               padding: 12px 16px; color: #f85149; }
    .hint { margin-top: 20px; color: #3d4451; font-size: 0.75rem; }
    h2 { color: #8b949e; font-size: 0.95rem; margin-bottom: 12px; }
  </style>
</head>
<body>
  <div class="card">
    <h1>📂 FileServ</h1>
    <p class="sub">Internal document portal — browse and view company files.</p>

    <h2>Available files:</h2>
    <ul class="file-list">
      <li><a href="/view?file=readme.txt">readme.txt</a></li>
      <li><a href="/view?file=contact.txt">contact.txt</a></li>
    </ul>

    {% if content is not none %}
      <h2>📄 {{ filename }}</h2>
      {% if error %}
        <div class="err-box">{{ content }}</div>
      {% else %}
        <pre>{{ content }}</pre>
      {% endif %}
    {% endif %}

    <p class="hint">Hint: there are files outside this directory that you shouldn't be able to read…</p>
  </div>
</body>
</html>
"""


@app.route("/", methods=["GET"])
def index():
    return render_template_string(HOME_PAGE, content=None, filename=None, error=False)


@app.route("/view", methods=["GET"])
def view_file():
    filename = request.args.get("file", "")
    if not filename:
        return render_template_string(HOME_PAGE, content="Error: no file specified.", filename="", error=True)

    # 🚨 VULNERABLE: no os.path.realpath check — ../../../flag.txt traverses outside BASE_DIR
    file_path = os.path.join(BASE_DIR, filename)

    try:
        with open(file_path, "r") as f:
            content = f.read()
        return render_template_string(HOME_PAGE, content=content, filename=filename, error=False)
    except FileNotFoundError:
        return render_template_string(
            HOME_PAGE, content="Error: file not found: " + file_path, filename=filename, error=True
        ), 404
    except PermissionError:
        return render_template_string(
            HOME_PAGE, content="Error: permission denied.", filename=filename, error=True
        ), 403
    except Exception as e:
        return render_template_string(
            HOME_PAGE, content="Error: " + str(e), filename=filename, error=True
        ), 500


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=PORT)
