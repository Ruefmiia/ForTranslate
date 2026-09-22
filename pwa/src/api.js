import { MAX_TEXT_CHARS } from "./translation-rules.generated.js";

export class ApiError extends Error {
  constructor(message, statusCode = null) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
  }
}

export function codePointLength(value) {
  return Array.from(value).length;
}

export function normalizeResult(data) {
  const translation = data?.translation ?? data?.translated_text ?? data?.text;
  if (typeof translation !== "string" || !translation.trim()) {
    throw new ApiError("服务返回了无法识别的翻译结果");
  }
  const strings = (value) => Array.isArray(value) ? value.map(String) : [];
  return {
    translation: translation.trim(),
    notes: strings(data.notes),
    uncertainties: strings(data.uncertainties),
    entities: strings(data.entities),
    usage: data?.usage && typeof data.usage === "object" ? data.usage : null,
    cached: data?.cached === true
  };
}

export function serviceError(status, detail) {
  if (status === 401) return "访问令牌无效或已停用，请在设置中更新令牌";
  if (status === 413) return `原文不能超过 ${MAX_TEXT_CHARS.toLocaleString()} 个字符，请缩短后重试`;
  if (status === 429) return "翻译额度已用完，请联系管理员充值";
  if (status === 502) return "模型服务暂时不可用，请稍后重试";
  if (status >= 500) return "翻译服务暂时不可用，请稍后重试";
  return detail || `翻译服务返回 ${status}`;
}

async function request(path, { token, method = "GET", body, signal, timeoutMs = 45_000, authenticated = true } = {}) {
  if (authenticated && !token?.trim()) throw new ApiError("请先填写访问令牌", 401);

  const controller = new AbortController();
  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const abortFromCaller = () => controller.abort();
  signal?.addEventListener("abort", abortFromCaller, { once: true });

  try {
    const headers = new Headers();
    if (token?.trim()) headers.set("Authorization", `Bearer ${token.trim()}`);
    if (body !== undefined) headers.set("Content-Type", "application/json");
    const response = await fetch(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
      cache: "no-store"
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new ApiError(serviceError(response.status, payload?.detail || payload?.message), response.status);
    }
    return payload;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error?.name === "AbortError") {
      throw new ApiError(timedOut ? "连接超时，请稍后重试" : "已取消翻译");
    }
    if (error instanceof TypeError) throw new ApiError("无法连接翻译服务，请检查网络");
    throw error;
  } finally {
    clearTimeout(timeoutId);
    signal?.removeEventListener("abort", abortFromCaller);
  }
}

export async function testConnection(token) {
  const payload = await request("/health", { token });
  if (payload?.status !== "ok") throw new ApiError("服务状态异常");
  return payload;
}

export async function getTokenBalance(token) {
  return request("/v1/token/usage", { token });
}

export async function translateText(token, text, signal) {
  if (!text.trim()) throw new ApiError("请先输入或粘贴需要翻译的内容");
  if (codePointLength(text) > MAX_TEXT_CHARS) {
    throw new ApiError(`原文不能超过 ${MAX_TEXT_CHARS.toLocaleString()} 个字符，请缩短后重试`, 413);
  }
  const payload = await request("/v1/translate/text", {
    token,
    method: "POST",
    body: { text, context: "", source: "pwa" },
    signal,
    timeoutMs: 90_000
  });
  return normalizeResult(payload);
}

export function getShortcutConfig() {
  return request("/v1/shortcut/config", { authenticated: false });
}

export function getShortcutCredentials(token) {
  return request("/v1/shortcut/credentials", { token });
}

export function createShortcutCredential(token) {
  return request("/v1/shortcut/credentials", { token, method: "POST" });
}

export function revokeShortcutCredentials(token) {
  return request("/v1/shortcut/credentials", { token, method: "DELETE" });
}
