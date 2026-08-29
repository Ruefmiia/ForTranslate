const STORAGE_KEY = "glossaryDrafts";

function clean(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

export async function listGlossaryDrafts() {
  const stored = await chrome.storage.local.get({ [STORAGE_KEY]: [] });
  return Array.isArray(stored[STORAGE_KEY]) ? stored[STORAGE_KEY] : [];
}

export async function saveGlossaryDraft({ id = "", source, target, note = "" }) {
  const normalized = {
    source: clean(source, 200),
    target: clean(target, 200),
    note: clean(note, 500)
  };
  if (!normalized.source || !normalized.target) throw new Error("原词和中文译名不能为空");

  const drafts = await listGlossaryDrafts();
  const idIndex = id ? drafts.findIndex((draft) => draft.id === id) : -1;
  const sourceIndex = drafts.findIndex((draft) =>
    draft.source.toLocaleLowerCase() === normalized.source.toLocaleLowerCase()
  );
  if (idIndex >= 0 && sourceIndex >= 0 && sourceIndex !== idIndex) {
    throw new Error("已存在相同 source 的术语草稿");
  }
  const existingIndex = idIndex >= 0 ? idIndex : sourceIndex;
  const now = new Date().toISOString();
  const draft = {
    id: existingIndex >= 0 ? drafts[existingIndex].id : crypto.randomUUID(),
    ...normalized,
    createdAt: existingIndex >= 0 ? drafts[existingIndex].createdAt : now,
    updatedAt: now
  };
  if (existingIndex >= 0) drafts.splice(existingIndex, 1);
  drafts.unshift(draft);
  await chrome.storage.local.set({ [STORAGE_KEY]: drafts });
  return draft;
}

export async function deleteGlossaryDraft(id) {
  const drafts = await listGlossaryDrafts();
  await chrome.storage.local.set({ [STORAGE_KEY]: drafts.filter((draft) => draft.id !== id) });
}

function csvCell(value) {
  return `"${String(value || "").replaceAll('"', '""')}"`;
}

export function glossaryDraftsToCsv(drafts) {
  const rows = drafts.map((draft) => [draft.source, draft.target, draft.note].map(csvCell).join(","));
  return `\uFEFF"source","target","note"\r\n${rows.join("\r\n")}${rows.length ? "\r\n" : ""}`;
}

export function glossaryDraftFilename(date = new Date()) {
  const stamp = [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map((part) => String(part).padStart(2, "0"))
    .join("");
  return `fortranslate-glossary-draft-${stamp}.csv`;
}
