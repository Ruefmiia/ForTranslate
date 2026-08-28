import json

import httpx

from fortranslate_backend.config import Settings
from fortranslate_backend.llm import LLMClient


def test_openai_compatible_request_and_usage(tmp_path):
    captured = {}

    def handler(request):
        captured["authorization"] = request.headers["authorization"]
        captured["payload"] = json.loads(request.content)
        return httpx.Response(200, json={
            "choices": [{"message": {"content": json.dumps({"translation": "你好", "notes": [], "uncertainties": [], "entities": []})}}],
            "usage": {"prompt_tokens": 9, "completion_tokens": 3},
        })

    settings = Settings("access", "api-key", "https://example.test/v1/", "demo", tmp_path / "db")
    client = LLMClient(settings, httpx.MockTransport(handler))
    result, usage = client.translate_text("สวัสดี", "", [])
    assert result["translation"] == "你好"
    assert usage == {"input_tokens": 9, "output_tokens": 3}
    assert captured["authorization"] == "Bearer api-key"
    assert captured["payload"]["model"] == "demo"
    assert captured["payload"]["response_format"] == {"type": "json_object"}
