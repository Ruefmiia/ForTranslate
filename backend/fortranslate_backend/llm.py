from __future__ import annotations

import base64
import json

import httpx

from .config import Settings


SYSTEM_PROMPT = """你是以泰语和泰国娱乐内容为重点的多语种中文翻译助手。自动识别输入语言，把泰语、英语及其他常见语言自然地翻译成简体中文；已经是中文的正文原样保留。保留人名、昵称、品牌、作品名、语气、对话结构和粉丝文化含义，不要逐字硬译。原文中的所有 Emoji 和表情符号必须原样、按原顺序保留在 translation 中，不要翻译、删除或改写；它们可能用于标识对话中的说话者。混合语言内容应保持正确语序和说话者对应关系。只输出一个 JSON 对象，字段为 translation、notes、uncertainties、entities；后三项必须是数组。不要使用 Markdown 代码块。"""


class ModelError(RuntimeError):
    pass


class LLMClient:
    def __init__(self, settings: Settings, transport: httpx.BaseTransport | None = None):
        self.settings = settings
        self.transport = transport

    def _glossary_text(self, terms: list[dict]) -> str:
        if not terms:
            return "（无匹配术语）"
        return "\n".join(
            f'- "{term["source"]}" → "{term["target"]}"'
            + (f'（{term["note"]}）' if term["note"] else "")
            for term in terms
        )

    def translate_text(self, text: str, context: str, terms: list[dict]) -> tuple[dict, dict]:
        content = f"术语表：\n{self._glossary_text(terms)}\n\n上下文：\n{context or '（无）'}\n\n待翻译文本：\n{text}"
        return self._complete([{"role": "user", "content": content}])

    def translate_image(self, image: bytes, media_type: str, source: str, terms: list[dict]) -> tuple[dict, dict]:
        encoded = base64.b64encode(image).decode("ascii")
        prompt = f"识别图片中的泰语并自然翻译成简体中文。来源：{source or 'unknown'}。\n术语表：\n{self._glossary_text(terms)}"
        return self._complete([{
            "role": "user",
            "content": [
                {"type": "text", "text": prompt},
                {"type": "image_url", "image_url": {"url": f"data:{media_type};base64,{encoded}"}},
            ],
        }])

    def _complete(self, messages: list[dict]) -> tuple[dict, dict]:
        if not self.settings.llm_api_key:
            raise ModelError("LLM API key is not configured")
        url = f"{self.settings.llm_base_url.rstrip('/')}/chat/completions"
        headers = {"Authorization": f"Bearer {self.settings.llm_api_key}"}
        payload = {
            "model": self.settings.llm_model,
            "messages": [{"role": "system", "content": SYSTEM_PROMPT}, *messages],
            "temperature": 0.2,
            "response_format": {"type": "json_object"},
        }
        if self.settings.llm_thinking:
            payload["thinking"] = {"type": self.settings.llm_thinking}
        try:
            with httpx.Client(timeout=self.settings.request_timeout_seconds, transport=self.transport) as client:
                response = client.post(url, headers=headers, json=payload)
                response.raise_for_status()
                body = response.json()
            content = body["choices"][0]["message"]["content"]
            result = json.loads(content)
            if not isinstance(result, dict):
                raise TypeError("response content is not a JSON object")
        except (httpx.HTTPError, KeyError, IndexError, TypeError, ValueError, json.JSONDecodeError) as exc:
            raise ModelError(f"Model API returned an invalid response: {exc}") from exc
        translation = result.get("translation")
        if not isinstance(translation, str) or not translation.strip():
            raise ModelError("Model API response did not contain a translation")
        normalized = {
            "translation": translation.strip(),
            "notes": result.get("notes") if isinstance(result.get("notes"), list) else [],
            "uncertainties": result.get("uncertainties") if isinstance(result.get("uncertainties"), list) else [],
            "entities": result.get("entities") if isinstance(result.get("entities"), list) else [],
        }
        usage = body.get("usage") or {}
        normalized_usage = {
            "input_tokens": max(0, int(usage.get("prompt_tokens", usage.get("input_tokens", 0)) or 0)),
            "output_tokens": max(0, int(usage.get("completion_tokens", usage.get("output_tokens", 0)) or 0)),
        }
        return normalized, normalized_usage
