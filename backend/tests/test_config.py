from fortranslate_backend.config import Settings, normalize_llm_model


def test_deepseek_defaults(monkeypatch):
    monkeypatch.delenv("FORTRANSLATE_LLM_BASE_URL", raising=False)
    monkeypatch.delenv("FORTRANSLATE_LLM_MODEL", raising=False)

    settings = Settings.from_env()

    assert settings.llm_base_url == "https://api.deepseek.com"
    assert settings.llm_model == "deepseek-flash"


def test_legacy_deepseek_models_are_migrated():
    assert normalize_llm_model("deepseek-chat") == "deepseek-flash"
    assert normalize_llm_model("deepseek-v4-flash") == "deepseek-flash"
    assert normalize_llm_model("custom-model") == "custom-model"
