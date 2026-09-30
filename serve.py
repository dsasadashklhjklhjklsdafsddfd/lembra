"""Servidor local do Lembra.

Uso:  python serve.py        (abre em http://localhost:5173)

As notificações do sistema e o service worker só funcionam em http://localhost
ou https — abrir o index.html direto pelo explorador de arquivos não basta.
"""
import http.server
import socketserver
import os
import sys
import webbrowser

PORT = next((int(a) for a in sys.argv[1:] if a.isdigit()), 5173)
ROOT = os.path.dirname(os.path.abspath(__file__))


class Handler(http.server.SimpleHTTPRequestHandler):
    # No Windows o registro às vezes mapeia .js como text/plain, o que quebra ES modules.
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".css": "text/css",
        ".svg": "image/svg+xml",
        ".webmanifest": "application/manifest+json",
        ".json": "application/json",
        ".png": "image/png",
    }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def log_message(self, fmt, *args):
        pass


class Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = False  # no Windows, True deixaria dois servidores na mesma porta


if __name__ == "__main__":
    url = f"http://localhost:{PORT}"
    try:
        httpd = Server(("127.0.0.1", PORT), Handler)
    except OSError:
        # Já está rodando (ex.: clicou duas vezes no atalho): só abre o navegador.
        webbrowser.open(url)
        sys.exit(0)
    with httpd:
        print(f"Lembra rodando em {url}  (Ctrl+C para parar)")
        if "--no-open" not in sys.argv:
            webbrowser.open(url)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass
