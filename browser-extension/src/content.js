(() => {
  if (window.__forTranslateLoaded) return;
  window.__forTranslateLoaded = true;

  const host = document.createElement("div");
  host.id = "fortranslate-root";
  const shadow = host.attachShadow({ mode: "closed" });
  document.documentElement.appendChild(host);

  shadow.innerHTML = `
    <style>
      :host { all: initial; }
      * { box-sizing: border-box; }
      .ft-trigger {
        position: fixed; z-index: 2147483647; width: 42px; height: 42px; border: 0;
        border-radius: 14px; background: #15324a; color: #fff; cursor: pointer;
        box-shadow: 0 8px 24px rgba(10, 34, 52, .24); font: 700 15px/1 system-ui, sans-serif;
        display: none; place-items: center; transition: transform 160ms ease, background 160ms ease;
      }
      .ft-trigger:hover { transform: translateY(-2px); background: #1d435f; }
      .ft-trigger:focus-visible, button:focus-visible { outline: 3px solid #f4a261; outline-offset: 2px; }
      .ft-panel {
        position: fixed; z-index: 2147483647; width: min(280px, calc(100vw - 24px));
        min-width: 240px; max-width: min(420px, calc(100vw - 24px));
        max-height: min(60vh, calc(100vh - 24px)); overflow: auto; resize: both; display: none;
        background: #fbfcfe; color: #142532; border: 0; border-radius: 12px;
        box-shadow: 0 8px 24px rgba(10, 34, 52, .14); font: 13px/1.55 system-ui, "Noto Sans Thai", sans-serif;
      }
      .ft-panel[data-mode="docked"] { box-shadow: 0 8px 24px rgba(10, 34, 52, .14); }
      .ft-panel[aria-hidden="false"] { display: block; animation: ft-in 180ms ease-out; }
      .ft-controls { position: absolute; inset: 5px 5px auto 5px; display: flex; align-items: center; justify-content: flex-end; gap: 3px; }
      .ft-control, .ft-copy { border: 0; background: transparent; color: #526775; cursor: pointer; border-radius: 8px; min-width: 32px; min-height: 32px; }
      .ft-control:hover, .ft-copy:hover { background: #edf2f5; color: #142532; }
      .ft-drag { margin-right: auto; cursor: grab; touch-action: none; font-weight: 800; letter-spacing: -2px; }
      .ft-drag:active { cursor: grabbing; }
      .ft-follow { display: none; padding: 0 9px; font-size: 11px; font-weight: 650; }
      .ft-panel[data-mode="manual"] .ft-follow, .ft-panel[data-mode="docked"] .ft-follow { display: block; }
      .ft-body { padding: 38px 11px 10px; }
      .ft-source { padding: 5px 0 2px; color: #526775; font-size: 12px; line-height: 1.55; white-space: pre-wrap; overflow-wrap: anywhere; }
      .ft-result { font-size: var(--ft-result-font-size, 13px); line-height: 1.55; white-space: pre-wrap; overflow-wrap: anywhere; }
      .ft-meta-row { margin-top: 9px; display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
      .ft-copy { padding: 0 8px; color: #254052; font-weight: 650; }
      .ft-status { color: #667b89; font-size: 12px; }
      .ft-error { padding: 4px 0; color: #942f16; }
      .ft-loader { padding: 3px 0 5px; color: #526775; }
      .ft-details, .ft-source-details { color: #526775; font-size: 12px; }
      .ft-details { flex: 1; min-width: 0; }
      .ft-source-details { margin-top: 2px; }
      .ft-details summary, .ft-source-details summary { min-height: 32px; padding: 6px 0; cursor: pointer; font-weight: 650; }
      .ft-notes { padding: 2px 0 5px 12px; white-space: pre-wrap; }
      @keyframes ft-in { from { opacity: 0; transform: translateY(7px) scale(.98); } }
      @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; } }
    </style>
    <button class="ft-trigger" type="button" aria-label="翻译选中文字">译</button>
    <section class="ft-panel" role="dialog" aria-label="ForTranslate 翻译结果" aria-hidden="true" data-mode="anchored">
      <div class="ft-controls">
        <button class="ft-control ft-drag" type="button" aria-label="拖动翻译浮窗；方向键移动；双击恢复默认大小" title="拖动；双击恢复默认大小">⋮⋮</button>
        <button class="ft-control ft-follow" type="button">跟随原文</button>
        <button class="ft-control ft-close" type="button" aria-label="关闭翻译结果" title="关闭">✕</button>
      </div>
      <div class="ft-body"></div>
    </section>`;

  const trigger = shadow.querySelector(".ft-trigger");
  const panel = shadow.querySelector(".ft-panel");
  const body = shadow.querySelector(".ft-body");
  let selectedText = "";
  let anchorRange = null;
  let anchorElement = null;
  let panelMode = "anchored";
  let positionFrame = 0;
  let resizingPanel = false;

  chrome.storage.local.remove("floatingPanelSize");
  chrome.storage.local.get({ floatingPanelSizeV2: null, resultFontSize: 13 }).then(({ floatingPanelSizeV2, resultFontSize }) => {
    panel.style.setProperty("--ft-result-font-size", `${Math.max(12, Math.min(Number(resultFontSize) || 13, 18))}px`);
    if (!floatingPanelSizeV2) return;
    panel.style.width = `${Math.max(240, Math.min(floatingPanelSizeV2.width, 420, window.innerWidth - 24))}px`;
    panel.style.height = `${Math.max(96, Math.min(floatingPanelSizeV2.height, window.innerHeight * .6))}px`;
  });

  function readSelection(target = document.activeElement) {
    if (target instanceof HTMLTextAreaElement || (target instanceof HTMLInputElement && /^(text|search|url|tel|email)$/i.test(target.type))) {
      const start = target.selectionStart ?? 0;
      const end = target.selectionEnd ?? 0;
      return target.value.slice(start, end).trim();
    }
    const selection = window.getSelection();
    if (!selection?.rangeCount) return "";
    const fragment = selection.getRangeAt(0).cloneContents();
    fragment.querySelectorAll("img[alt], [role='img'][aria-label]").forEach((node) => {
      const replacement = node.getAttribute("alt") || node.getAttribute("aria-label") || "";
      node.replaceWith(document.createTextNode(replacement));
    });
    const container = document.createElement("div");
    container.style.cssText = "position:fixed;left:-100000px;top:0;visibility:hidden;white-space:pre-wrap";
    container.appendChild(fragment);
    document.body.appendChild(container);
    const text = container.innerText.trim();
    container.remove();
    return text || selection.toString().trim();
  }

  function selectionRect(target) {
    if (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) return target.getBoundingClientRect();
    const selection = window.getSelection();
    return selection?.rangeCount ? selection.getRangeAt(0).getBoundingClientRect() : target.getBoundingClientRect();
  }

  function captureAnchor(target = document.activeElement) {
    if (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) {
      anchorElement = target;
      anchorRange = null;
      return;
    }
    const selection = window.getSelection();
    anchorRange = selection?.rangeCount ? selection.getRangeAt(0).cloneRange() : null;
    anchorElement = null;
  }

  function anchorRect() {
    if (anchorElement?.isConnected) return anchorElement.getBoundingClientRect();
    if (anchorRange) return anchorRange.getBoundingClientRect();
    return null;
  }

  function hideTrigger() { trigger.style.display = "none"; }
  function hidePanel() { panel.setAttribute("aria-hidden", "true"); }
  function position(element, rect, width = 280) {
    const gap = 10;
    const left = Math.min(Math.max(12, rect.left), window.innerWidth - width - 12);
    const below = rect.bottom + gap;
    const height = element.offsetHeight || 220;
    const top = below + height < window.innerHeight - 12 ? below : Math.max(12, rect.top - height - gap);
    element.style.left = `${left}px`;
    element.style.top = `${top}px`;
  }

  function showPanel() {
    const wasHidden = panel.getAttribute("aria-hidden") === "true";
    panel.setAttribute("aria-hidden", "false");
    if (wasHidden) panelMode = "anchored";
    updatePanelPosition();
  }

  function updatePanelPosition() {
    if (panelMode === "manual" || panel.getAttribute("aria-hidden") === "true") return;
    const rect = anchorRect();
    const visible = rect && rect.width >= 0 && rect.bottom >= 0 && rect.top <= window.innerHeight && rect.right >= 0 && rect.left <= window.innerWidth;
    if (!visible) {
      panelMode = "docked";
      panel.dataset.mode = "docked";
      panel.style.left = `${Math.max(12, window.innerWidth - panel.offsetWidth - 12)}px`;
      panel.style.top = `${Math.max(12, window.innerHeight - panel.offsetHeight - 12)}px`;
      return;
    }
    panelMode = "anchored";
    panel.dataset.mode = "anchored";
    position(panel, rect, panel.offsetWidth || 280);
  }

  function schedulePanelPosition() {
    if (positionFrame) return;
    positionFrame = requestAnimationFrame(() => {
      positionFrame = 0;
      updatePanelPosition();
    });
  }

  function resetPanelSize() {
    panel.style.removeProperty("width");
    panel.style.removeProperty("height");
    chrome.storage.local.remove("floatingPanelSizeV2");
    panelMode = "anchored";
    updatePanelPosition();
  }

  function renderLoading() {
    body.innerHTML = `<div class="ft-loader" role="status">正在翻译…</div>`;
    showPanel();
  }

  function renderError(message) {
    body.innerHTML = `<div class="ft-error" role="alert"></div><div class="ft-status">请检查扩展设置中的服务地址</div>`;
    body.querySelector(".ft-error").textContent = message;
    showPanel();
  }

  function renderResult(result, sourceText) {
    body.innerHTML = `<div class="ft-result"></div><div class="ft-meta-row"><details class="ft-details" hidden><summary></summary><div class="ft-notes"></div></details><button class="ft-copy" type="button">复制</button></div><details class="ft-source-details"><summary>查看原文</summary><div class="ft-source"></div></details>`;
    body.querySelector(".ft-result").textContent = result.translation;
    body.querySelector(".ft-source").textContent = sourceText;
    const notes = [...(result.notes || []), ...(result.uncertainties || [])];
    if (notes.length) {
      const notesNode = body.querySelector(".ft-notes");
      const detailsNode = body.querySelector(".ft-details");
      detailsNode.hidden = false;
      detailsNode.querySelector("summary").textContent = `解释与说明 ${notes.length} 条`;
      notesNode.textContent = notes.map((item) => typeof item === "string" ? item : item.explanation || item.reason || item.text).filter(Boolean).join(" · ");
    }
    body.querySelector(".ft-copy").addEventListener("click", async (event) => {
      await navigator.clipboard.writeText(result.translation);
      event.currentTarget.textContent = "已复制";
    });
    showPanel();
  }

  document.addEventListener("mouseup", (event) => {
    if (host.contains(event.target)) return;
    setTimeout(() => {
      const text = readSelection(event.target);
      if (!text || text.length > 10000) return hideTrigger();
      selectedText = text;
      captureAnchor(event.target);
      const rect = selectionRect(event.target);
      position(trigger, rect, 42);
      trigger.style.display = "grid";
    }, 0);
  });

  document.addEventListener("mousedown", (event) => {
    if (!host.contains(event.target)) hideTrigger();
  });

  trigger.addEventListener("click", () => {
    hideTrigger();
    renderLoading(selectedText);
    chrome.runtime.sendMessage({ type: "TRANSLATE_TEXT", text: selectedText });
  });
  const dragHandle = shadow.querySelector(".ft-drag");
  dragHandle.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const startRect = panel.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    panelMode = "manual";
    panel.dataset.mode = "manual";
    dragHandle.setPointerCapture(event.pointerId);
    const move = (moveEvent) => {
      const left = Math.max(12, Math.min(startRect.left + moveEvent.clientX - startX, window.innerWidth - panel.offsetWidth - 12));
      const top = Math.max(12, Math.min(startRect.top + moveEvent.clientY - startY, window.innerHeight - panel.offsetHeight - 12));
      panel.style.left = `${left}px`;
      panel.style.top = `${top}px`;
    };
    const stop = () => {
      dragHandle.removeEventListener("pointermove", move);
      dragHandle.removeEventListener("pointerup", stop);
      dragHandle.removeEventListener("pointercancel", stop);
    };
    dragHandle.addEventListener("pointermove", move);
    dragHandle.addEventListener("pointerup", stop);
    dragHandle.addEventListener("pointercancel", stop);
  });
  dragHandle.addEventListener("keydown", (event) => {
    const offsets = { ArrowLeft: [-12, 0], ArrowRight: [12, 0], ArrowUp: [0, -12], ArrowDown: [0, 12] };
    if (!offsets[event.key]) return;
    event.preventDefault();
    panelMode = "manual";
    panel.dataset.mode = "manual";
    const rect = panel.getBoundingClientRect();
    panel.style.left = `${Math.max(12, Math.min(rect.left + offsets[event.key][0], window.innerWidth - panel.offsetWidth - 12))}px`;
    panel.style.top = `${Math.max(12, Math.min(rect.top + offsets[event.key][1], window.innerHeight - panel.offsetHeight - 12))}px`;
  });
  dragHandle.addEventListener("dblclick", resetPanelSize);
  shadow.querySelector(".ft-follow").addEventListener("click", () => {
    panelMode = "anchored";
    updatePanelPosition();
  });
  shadow.querySelector(".ft-close").addEventListener("click", hidePanel);
  panel.addEventListener("pointerdown", (event) => {
    const rect = panel.getBoundingClientRect();
    resizingPanel = rect.right - event.clientX <= 18 && rect.bottom - event.clientY <= 18;
  });
  panel.addEventListener("pointerup", () => {
    if (!resizingPanel) return;
    resizingPanel = false;
    chrome.storage.local.set({ floatingPanelSizeV2: { width: panel.offsetWidth, height: panel.offsetHeight } });
  });
  document.addEventListener("scroll", schedulePanelPosition, { passive: true, capture: true });
  window.addEventListener("resize", schedulePanelPosition, { passive: true });
  window.visualViewport?.addEventListener("resize", schedulePanelPosition, { passive: true });
  new ResizeObserver(() => {
    if (panel.offsetWidth && panel.offsetHeight) {
      if (panelMode === "manual") {
        const rect = panel.getBoundingClientRect();
        panel.style.left = `${Math.max(12, Math.min(rect.left, window.innerWidth - panel.offsetWidth - 12))}px`;
        panel.style.top = `${Math.max(12, Math.min(rect.top, window.innerHeight - panel.offsetHeight - 12))}px`;
      }
      schedulePanelPosition();
    }
  }).observe(panel);
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || !changes.resultFontSize) return;
    const fontSize = Math.max(12, Math.min(Number(changes.resultFontSize.newValue) || 13, 18));
    panel.style.setProperty("--ft-result-font-size", `${fontSize}px`);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") { hideTrigger(); hidePanel(); }
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === "GET_SELECTION") {
      captureAnchor();
      sendResponse({ text: readSelection() });
    } else if (message.type === "TRANSLATION_LOADING") {
      renderLoading(message.sourceText);
    } else if (message.type === "TRANSLATION_SUCCESS") {
      renderResult(message.result, message.sourceText);
    } else if (message.type === "TRANSLATION_ERROR") {
      renderError(message.message);
    }
  });
})();
