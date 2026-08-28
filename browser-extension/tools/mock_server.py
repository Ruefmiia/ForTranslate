"""Zero-dependency development server for the ForTranslate extension."""

from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json


HOST = "127.0.0.1"
PORT = 8787


class Handler(BaseHTTPRequestHandler):
    def _headers(self, status=200):
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.end_headers()

    def _json(self, payload, status=200):
        self._headers(status)
        self.wfile.write(json.dumps(payload, ensure_ascii=False).encode("utf-8"))

    def do_OPTIONS(self):
        self._headers(204)

    def do_GET(self):
        if self.path == "/health":
            self._json({"status": "ok"})
        else:
            self._json({"detail": "Not found"}, 404)

    def do_POST(self):
        content_length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(content_length)

        if self.path == "/v1/translate/text":
            try:
                request = json.loads(body or b"{}")
                source = str(request.get("text", "")).strip()
            except (json.JSONDecodeError, UnicodeDecodeError):
                self._json({"detail": "Invalid JSON"}, 400)
                return
            if not source:
                self._json({"detail": "Text is required"}, 422)
                return
            self._json({
                "translation": f"【模拟译文】{source}",
                "notes": ["当前使用本地模拟服务，尚未调用大模型。"],
                "uncertainties": [],
                "entities": [],
                "usage": {"input_tokens": len(source), "output_tokens": len(source) + 6},
            })
            return

        if self.path == "/v1/translate/image":
            self._json({
                "translation": "【模拟图片译文】图片上传成功。接入 OCR 后将在这里返回自然中文。",
                "notes": ["当前模拟服务不会保存或识别图片。"],
                "uncertainties": [],
                "entities": [],
            })
            return

        self._json({"detail": "Not found"}, 404)

    def log_message(self, format, *args):
        print(f"[ForTranslate mock] {self.address_string()} - {format % args}")


if __name__ == "__main__":
    print(f"ForTranslate mock server: http://{HOST}:{PORT}")
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
