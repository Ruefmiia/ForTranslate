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
        position: fixed; z-index: 2147483647; width: min(320px, calc(100vw - 24px));
        min-width: 260px; min-height: 180px; max-width: calc(100vw - 24px);
        max-height: calc(100vh - 24px); overflow: auto; resize: both; display: none;
        background: #fbfcfe; color: #142532; border: 1px solid #cbd8e2; border-radius: 15px;
        box-shadow: 0 14px 36px rgba(10, 34, 52, .2); font: 13px/1.55 system-ui, "Noto Sans Thai", sans-serif;
      }
      .ft-panel[data-mode="docked"] { box-shadow: 0 10px 30px rgba(10, 34, 52, .18); }
      .ft-panel[aria-hidden="false"] { display: block; animation: ft-in 180ms ease-out; }
      .ft-controls { position: absolute; inset: 5px 5px auto 5px; display: flex; align-items: center; justify-content: flex-end; gap: 3px; }
      .ft-control, .ft-copy { border: 0; background: transparent; color: #526775; cursor: pointer; border-radius: 8px; min-width: 32px; min-height: 32px; }
      .ft-control:hover, .ft-copy:hover { background: #edf2f5; color: #142532; }
      .ft-drag { margin-right: auto; cursor: grab; touch-action: none; font-weight: 800; letter-spacing: -2px; }
      .ft-drag:active { cursor: grabbing; }
      .ft-follow { display: none; padding: 0 9px; font-size: 11px; font-weight: 650; }
      .ft-panel[data-mode="manual"] .ft-follow, .ft-panel[data-mode="docked"] .ft-follow { display: block; }
      .ft-body { padding: 14px; padding-top: 42px; }
      .ft-label { color: #667b89; font: 650 11px/1.2 system-ui, sans-serif; letter-spacing: .08em; text-transform: uppercase; }
      .ft-source { margin: 7px 0 16px; color: #526775; font-size: 12px; line-height: 1.55; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
      .ft-result { margin: 6px 0 0; font-size: 14px; line-height: 1.65; white-space: pre-wrap; overflow-wrap: anywhere; }
      .ft-actions { margin-top: 14px; display: flex; align-items: center; justify-content: space-between; gap: 12px; }
      .ft-copy { padding: 0 11px; border: 1px solid #cbd8e2; color: #254052; font-weight: 650; }
      .ft-status { color: #667b89; font-size: 12px; }
      .ft-error { padding: 12px; border-radius: 12px; background: #fff0eb; color: #942f16; }
      .ft-loader { display: flex; gap: 6px; align-items: center; color: #526775; }
      .ft-dot { width: 7px; height: 7px; background: #d45c2d; border-radius: 50%; animation: ft-pulse 900ms infinite alternate; }
      .ft-dot:nth-child(2) { animation-delay: 180ms; } .ft-dot:nth-child(3) { animation-delay: 360ms; }
      .ft-details { margin-top: 12px; border-radius: 10px; background: #edf4f7; color: #3c5362; font-size: 12px; }
      .ft-details summary { min-height: 40px; padding: 10px 12px; cursor: pointer; font-weight: 650; }
      .ft-notes { padding: 0 12px 12px; white-space: pre-wrap; }
      @keyframes ft-in { from { opacity: 0; transform: translateY(7px) scale(.98); } }
      @keyframes ft-pulse { to { opacity: .25; transform: translateY(-2px); } }
      @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; } }
    </style>
    <button class="ft-trigger" type="button" aria-label="翻译选中文字">译</button>
    <section class="ft-panel" role="dialog" aria-label="ForTranslate 翻译结果" aria-hidden="true" data-mode="anchored">
      <div class="ft-controls">
        <button class="ft-control ft-drag" type="button" aria-label="拖动翻译浮窗；也可用方向键移动" title="拖动浮窗">⋮⋮</button>
        <button class="ft-control ft-follow" type="button">跟随原文</button>
        <button class="ft-control ft-smaller" type="button" aria-label="缩小翻译浮窗" title="缩小">−</button>
        <button class="ft-control ft-larger" type="button" aria-label="放大翻译浮窗" title="放大">＋</button>
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

  chrome.storage.local.get({ floatingPanelSize: null }).then(({ floatingPanelSize }) => {
    if (!floatingPanelSize) return;
    panel.style.width = `${Math.max(260, Math.min(floatingPanelSize.width, window.innerWidth - 24))}px`;
    panel.style.height = `${Math.max(180, Math.min(floatingPanelSize.height, window.innerHeight - 24))}px`;
  });

  function readSelection(target = document.activeElement) {
    if (target instanceof HTMLTextAreaElement || (target instanceof HTMLInputElement && /^(text|search|url|tel|email)$/i.test(target.type))) {
      const start = target.selectionStart ?? 0;
      const end = target.selectionEnd ?? 0;
      return target.value.slice(start, end).trim();
    }
    return window.getSelection()?.toString().trim() || "";
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
  function position(element, rect, width = 320) {
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
    position(panel, rect, panel.offsetWidth || 320);
  }

  function schedulePanelPosition() {
    if (positionFrame) return;
    positionFrame = requestAnimationFrame(() => {
      positionFrame = 0;
      updatePanelPosition();
    });
  }

  function setPanelSize(width, height = panel.offsetHeight) {
    const nextWidth = Math.max(260, Math.min(width, window.innerWidth - 24));
    const nextHeight = Math.max(180, Math.min(height, window.innerHeight - 24));
    panel.style.width = `${nextWidth}px`;
    panel.style.height = `${nextHeight}px`;
    chrome.storage.local.set({ floatingPanelSize: { width: nextWidth, height: nextHeight } });
    schedulePanelPosition();
  }

  function renderLoading(sourceText) {
    body.innerHTML = `<div class="ft-label">原文</div><div class="ft-source"></div><div class="ft-loader"><span class="ft-dot"></span><span class="ft-dot"></span><span class="ft-dot"></span><span>正在理解语境…</span></div>`;
    body.querySelector(".ft-source").textContent = sourceText;
    showPanel();
  }

  function renderError(message) {
    body.innerHTML = `<div class="ft-error" role="alert"></div><div class="ft-actions"><span class="ft-status">可在扩展设置中检查服务地址</span></div>`;
    body.querySelector(".ft-error").textContent = message;
    showPanel();
  }

  function renderResult(result, sourceText) {
    body.innerHTML = `<div class="ft-label">原文</div><div class="ft-source"></div><div class="ft-label">中文</div><div class="ft-result"></div><details class="ft-details" hidden><summary>解释与说明</summary><div class="ft-notes"></div></details><div class="ft-actions"><span class="ft-status"></span><button class="ft-copy" type="button">复制译文</button></div>`;
    body.querySelector(".ft-source").textContent = sourceText;
    body.querySelector(".ft-result").textContent = result.translation;
    const notes = [...(result.notes || []), ...(result.uncertainties || [])];
    if (notes.length) {
      const notesNode = body.querySelector(".ft-notes");
      body.querySelector(".ft-details").hidden = false;
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
  shadow.querySelector(".ft-follow").addEventListener("click", () => {
    panelMode = "anchored";
    updatePanelPosition();
  });
  shadow.querySelector(".ft-smaller").addEventListener("click", () => setPanelSize(panel.offsetWidth - 40, panel.offsetHeight - 40));
  shadow.querySelector(".ft-larger").addEventListener("click", () => setPanelSize(panel.offsetWidth + 40, panel.offsetHeight + 40));
  shadow.querySelector(".ft-close").addEventListener("click", hidePanel);
  document.addEventListener("scroll", schedulePanelPosition, { passive: true, capture: true });
  window.addEventListener("resize", schedulePanelPosition, { passive: true });
  window.visualViewport?.addEventListener("resize", schedulePanelPosition, { passive: true });
  new ResizeObserver(() => {
    if (panel.offsetWidth && panel.offsetHeight) {
      chrome.storage.local.set({ floatingPanelSize: { width: panel.offsetWidth, height: panel.offsetHeight } });
      if (panelMode === "manual") {
        const rect = panel.getBoundingClientRect();
        panel.style.left = `${Math.max(12, Math.min(rect.left, window.innerWidth - panel.offsetWidth - 12))}px`;
        panel.style.top = `${Math.max(12, Math.min(rect.top, window.innerHeight - panel.offsetHeight - 12))}px`;
      }
      schedulePanelPosition();
    }
  }).observe(panel);
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
