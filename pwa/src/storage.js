const TOKEN_KEY = "fortranslate.pwa.token";
const SETTINGS_KEY = "fortranslate.pwa.settings";
const HISTORY_KEY = "fortranslate.pwa.history";
const HISTORY_LIMIT = 20;

function readJson(storage, key, fallback) {
  try {
    return JSON.parse(storage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

export function getSettings() {
  const value = readJson(localStorage, SETTINGS_KEY, {});
  return {
    rememberToken: value.rememberToken !== false,
    historyEnabled: value.historyEnabled !== false
  };
}

export function saveSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({
    rememberToken: settings.rememberToken === true,
    historyEnabled: settings.historyEnabled === true
  }));
}

export function getToken() {
  return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY) || "";
}

export function saveToken(token, remember) {
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
  (remember ? localStorage : sessionStorage).setItem(TOKEN_KEY, token.trim());
}

export function getHistory() {
  const values = readJson(localStorage, HISTORY_KEY, []);
  if (!Array.isArray(values)) return [];
  return values.filter((item) =>
    item && typeof item.source === "string" && typeof item.translation === "string"
  ).slice(0, HISTORY_LIMIT);
}

export function addHistory(source, translation) {
  const duplicateFree = getHistory().filter((item) => item.source !== source);
  duplicateFree.unshift({ source, translation, createdAt: new Date().toISOString() });
  localStorage.setItem(HISTORY_KEY, JSON.stringify(duplicateFree.slice(0, HISTORY_LIMIT)));
}

export function clearHistory() {
  localStorage.removeItem(HISTORY_KEY);
}
