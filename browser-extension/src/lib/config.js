export const DEFAULT_SETTINGS = Object.freeze({
  apiBaseUrl: "http://127.0.0.1:8787",
  accessToken: "",
  requestTimeoutMs: 60000,
  resultFontSize: 13,
  saveHistory: true
});

export async function getSettings() {
  return chrome.storage.local.get(DEFAULT_SETTINGS);
}

export function normalizeBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}
