from pathlib import Path

from fastapi.testclient import TestClient

from fortranslate_backend.app import create_app
from fortranslate_backend.config import Settings


class FakeLLM:
    def __init__(self):
        self.text_terms = []
        self.image_call = None

    def translate_text(self, text, context, terms):
        self.text_terms = terms
        return (
            {"translation": "自然译文", "notes": [], "uncertainties": [], "entities": []},
            {"input_tokens": 12, "output_tokens": 5},
        )

    def translate_image(self, image, media_type, source, terms):
        self.image_call = (image, media_type, source, terms)
        return (
            {"translation": "图片译文", "notes": [], "uncertainties": [], "entities": []},
            {"input_tokens": 20, "output_tokens": 8},
        )


def make_client(tmp_path: Path, max_image_bytes: int = 1024, max_text_chars: int = 3000):
    settings = Settings(
        "secret",
        "model-key",
        "https://model.example/v1",
        "test-model",
        tmp_path / "test.db",
        max_image_bytes=max_image_bytes,
        max_text_chars=max_text_chars,
    )
    fake = FakeLLM()
    return TestClient(create_app(settings, fake)), fake


def auth():
    return {"Authorization": "Bearer secret"}


def test_authentication_and_health(tmp_path):
    with make_client(tmp_path)[0] as client:
        assert client.app.version == "0.3.1"
        assert client.get("/health").status_code == 401
        assert client.get("/health", headers=auth()).json() == {"status": "ok"}
        preflight = client.options(
            "/v1/translate/text",
            headers={
                "Origin": "chrome-extension://test",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "authorization,content-type",
                "Access-Control-Request-Private-Network": "true",
            },
        )
        assert preflight.status_code == 200
        assert preflight.headers["access-control-allow-origin"] == "*"
        assert preflight.headers["access-control-allow-private-network"] == "true"


def test_individual_access_tokens_can_be_managed(tmp_path):
    client, _ = make_client(tmp_path)
    with client:
        record, token = client.app.state.database.create_access_token("Android 测试用户")
        individual_auth = {"Authorization": f"Bearer {token}"}
        assert client.get("/health", headers=individual_auth).json() == {"status": "ok"}
        listed = client.app.state.database.list_access_tokens()
        assert listed[0]["name"] == "Android 测试用户"
        assert listed[0]["last_used_at"] is not None
        assert "token_hash" not in listed[0]
        assert client.app.state.database.set_access_token_enabled(record["id"], False)
        assert client.get("/health", headers=individual_auth).status_code == 401
        assert client.app.state.database.set_access_token_enabled(record["id"], True)
        assert client.get("/health", headers=individual_auth).status_code == 200
        assert client.app.state.database.revoke_access_token(record["id"])
        assert client.get("/health", headers=individual_auth).status_code == 401


def test_glossary_is_injected_and_usage_is_recorded(tmp_path):
    client, fake = make_client(tmp_path)
    with client:
        term = client.put(
            "/v1/glossary",
            headers=auth(),
            json={"source": "พีพี", "target": "PP", "note": "艺名"},
        )
        assert term.status_code == 200
        response = client.post(
            "/v1/translate/text",
            headers=auth(),
            json={"text": "พีพี สวัสดี", "source": "test"},
        )
        assert response.status_code == 200
        assert response.json()["usage"] == {"input_tokens": 12, "output_tokens": 5}
        assert fake.text_terms[0]["target"] == "PP"
        usage = client.get("/v1/usage", headers=auth()).json()
        assert usage == {
            "requests": 1,
            "input_tokens": 12,
            "output_tokens": 5,
            "total_tokens": 17,
            "by_endpoint": [{
                "endpoint": "text",
                "requests": 1,
                "input_tokens": 12,
                "output_tokens": 5,
                "total_tokens": 17,
            }],
        }
        assert client.delete(f'/v1/glossary/{term.json()["id"]}', headers=auth()).json() == {"deleted": True}


def test_text_length_limit_rejects_before_model_call(tmp_path):
    client, fake = make_client(tmp_path, max_text_chars=3)
    with client:
        response = client.post(
            "/v1/translate/text",
            headers=auth(),
            json={"text": "สวัสดี", "source": "limit-test"},
        )
        assert response.status_code == 413
        assert response.json() == {"detail": "Text exceeds the 3 character limit"}
        assert fake.text_terms == []


def test_image_translation_and_validation(tmp_path):
    client, fake = make_client(tmp_path, max_image_bytes=8)
    with client:
        response = client.post(
            "/v1/translate/image",
            headers=auth(),
            files={"image": ("x.png", b"png", "image/png")},
            data={"source": "browser"},
        )
        assert response.json()["translation"] == "图片译文"
        assert fake.image_call[:3] == (b"png", "image/png", "browser")
        wrong_type = client.post(
            "/v1/translate/image",
            headers=auth(),
            files={"image": ("x.txt", b"text", "text/plain")},
        )
        assert wrong_type.status_code == 415
        too_large = client.post(
            "/v1/translate/image",
            headers=auth(),
            files={"image": ("x.png", b"123456789", "image/png")},
        )
        assert too_large.status_code == 413
