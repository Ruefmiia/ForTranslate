import { getSettings, normalizeBaseUrl } from "./config.js";
import { listGlossaryDrafts } from "./glossary-drafts.js";

function normalizeResult(data) {
  const translation = data?.translation ?? data?.translated_text ?? data?.text;
  if (!translation || typeof translation !== "string") {
    throw new Error("服务返回了无法识别的翻译结果");
  }

  return {
    translation: translation.trim(),
    notes: Array.isArray(data.notes) ? data.notes : [],
    uncertainties: Array.isArray(data.uncertainties) ? data.uncertainties : [],
    entities: Array.isArray(data.entities) ? data.entities : [],
    usage: data.usage ?? null
  };
}

async function request(path, options) {
  const settings = await getSettings();
  const baseUrl = normalizeBaseUrl(settings.apiBaseUrl);
  if (!baseUrl) throw new Error("请先设置翻译服务地址");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), settings.requestTimeoutMs);
  const headers = new Headers(options.headers || {});
  if (settings.accessToken) headers.set("Authorization", `Bearer ${settings.accessToken}`);

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers,
      signal: controller.signal
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(payload?.detail || payload?.message || `翻译服务返回 ${response.status}`);
    }
    return payload;
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("翻译超时，请检查服务状态");
    if (error instanceof TypeError) throw new Error("无法连接翻译服务，请检查地址和网络");
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function translateText(text, context = "") {
  const settings = await getSettings();
  if (settings.translationMode === "direct") return translateDirect(text, settings);
  const payload = await request("/v1/translate/text", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, context, source: "browser_selection" })
  });
  return normalizeResult(payload);
}

async function translateDirect(text, settings) {
  const baseUrl = normalizeBaseUrl(settings.llmBaseUrl);
  if (!baseUrl || !settings.llmApiKey || !settings.llmModel) throw new Error("请完整填写自有 API 设置");
  const bundled = await fetch(chrome.runtime.getURL("assets/glossary.json")).then((response) => response.json());
  const merged = new Map((bundled.terms || []).map((term) => [term.source, term]));
  for (const term of await listGlossaryDrafts()) merged.set(term.source, term);
  const matches = [...merged.values()].filter((term) => text.includes(term.source)).sort((a, b) => b.source.length - a.source.length).slice(0, 40);
  const glossary = matches.length ? matches.map((term) => `${term.source} => ${term.target}${term.note ? `（${term.note}）` : ""}`).join("\n") : "无匹配术语。";
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), settings.requestTimeoutMs);
  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST", signal: controller.signal,
      headers: { "Authorization": `Bearer ${settings.llmApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: settings.llmModel, temperature: 0.2, response_format: { type: "json_object" }, messages: [
        { role: "system", content: `把用户文字翻译成自然、准确的简体中文。保留说话人标记、换行、emoji、语气和专有名词，不要省略。术语优先遵循：\n${glossary}\n只返回 JSON：{"translation":"...","notes":[],"uncertainties":[],"entities":[]}` },
        { role: "user", content: text }
      ]})
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error?.message || `模型 API 返回 ${response.status}`);
    const result = JSON.parse(payload.choices?.[0]?.message?.content || "");
    result.usage = { input_tokens: payload.usage?.prompt_tokens || 0, output_tokens: payload.usage?.completion_tokens || 0 };
    return normalizeResult(result);
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("模型请求超时");
    throw error;
  } finally { clearTimeout(timeoutId); }
}

export async function translateImageUrl(imageUrl) {
  const imageResponse = await fetch(imageUrl);
  if (!imageResponse.ok) throw new Error("无法读取所选图片");
  const blob = await imageResponse.blob();
  if (blob.size > 10 * 1024 * 1024) throw new Error("图片超过 10MB，请先压缩");

  const form = new FormData();
  form.append("image", blob, "browser-image");
  form.append("source", "browser_context_menu");
  const payload = await request("/v1/translate/image", { method: "POST", body: form });
  return normalizeResult(payload);
}

export async function testConnection() {
  const settings = await getSettings();
  if (settings.translationMode === "direct") {
    await translateDirect("连接测试", settings);
    return "ok";
  }
  const payload = await request("/health", { method: "GET" });
  return payload?.status || "ok";
}
