# server.py
# Simple vulnerable web server for the "Hidden Admin Panel" challenge
# The flag is in the /admin page

import http.server
import os

FLAG = os.environ.get("FLAG", "flag{default}")
PORT = 80


class ChallengeHandler(http.server.BaseHTTPRequestHandler):

    def do_GET(self):
        if self.path == "/":
            # main page - looks like a normal website
            self.send_response(200)
            self.send_header("Content-Type", "text/html")
            self.end_headers()
            html = """
            <html>
            <head><title>Welcome</title></head>
            <body style="background:#111; color:#0f0; font-family:monospace; padding:40px;">
                <h1>Welcome to the Server</h1>
                <p>This is a totally normal web server.</p>
                <p>Nothing to see here... or is there?</p>
                <p>Try exploring different pages.</p>
                <hr>
                <p style="color:#333;">Hint: admins have their own page</p>
            </body>
            </html>
            """
            self.wfile.write(html.encode())

        elif self.path == "/admin":
            # the hidden page with the flag!
            self.send_response(200)
            self.send_header("Content-Type", "text/html")
            self.end_headers()
            html = """
            <html>
            <head><title>Admin Panel</title></head>
            <body style="background:#111; color:#0f0; font-family:monospace; padding:40px;">
                <h1>Admin Panel</h1>
                <p>Congratulations! You found the hidden admin page!</p>
                <p>Here is your flag:</p>
                <h2 style="color:#ff0;">{flag}</h2>
                <p>Submit this flag on the platform to earn your points.</p>
            </body>
            </html>
            """.format(flag=FLAG)
            self.wfile.write(html.encode())

        elif self.path == "/robots.txt":
            # another hint
            self.send_response(200)
            self.send_header("Content-Type", "text/plain")
            self.end_headers()
            self.wfile.write(b"User-agent: *\nDisallow: /admin\n")

        else:
            self.send_response(404)
            self.send_header("Content-Type", "text/html")
            self.end_headers()
            html = """
            <html>
            <body style="background:#111; color:#f00; font-family:monospace; padding:40px;">
                <h1>404 - Page Not Found</h1>
                <p>The page you're looking for doesn't exist.</p>
            </body>
            </html>
            """
            self.wfile.write(html.encode())

    # suppress default logging
    def log_message(self, format, *args):
        print(self.path, *args)


if __name__ == "__main__":
    server = http.server.HTTPServer(("0.0.0.0", PORT), ChallengeHandler)
    print("challenge server running on port " + str(PORT))
    server.serve_forever()
