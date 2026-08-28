import { getSettings, normalizeBaseUrl } from "./config.js";

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
  const payload = await request("/v1/translate/text", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, context, source: "browser_selection" })
  });
  return normalizeResult(payload);
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
  const payload = await request("/health", { method: "GET" });
  return payload?.status || "ok";
}
