const BACKEND_URLS = ["ws://localhost:8000/ws", "ws://127.0.0.1:8000/ws"];

let socket = null;
let backendIndex = 0;
let lastSeenCaption = "";
let lastSentCaption = "";
let lastSentAt = 0;
let lastCaptionAt = 0;
let dragState = null;

const STORAGE_KEY = "lingualink_settings_v1";
const DEFAULT_SETTINGS = {
  showCaptions: true,
  showEs: true,
  showHi: true,
  position: null,
};

const CAPTION_SELECTORS = [
  '[aria-live="polite"]',
  '[aria-live="assertive"]',
  '[role="log"]',
  '[role="region"][aria-live]',
  "[data-caption]",
  '[class*="caption"]',
  '[class*="Caption"]',
  '[class*="subtitle"]',
  '[class*="Subtitle"]',
  ".nMcdL",
  ".VbkSUe",
  ".ygicle",
];
const CAPTION_SELECTOR = CAPTION_SELECTORS.join(",");

const MEET_LINE_CONTAINER = ".nMcdL";
const MEET_LINE_TEXT = ".VbkSUe, .ygicle";

const SYSTEM_MESSAGE_PATTERNS = [
  /\byour (camera|mic|microphone)\b/i,
  /\byou('re| are) (muted|presenting)\b/i,
  /\bmeeting (is|will be|will end|recording)\b/i,
  /\bturn on captions\b/i,
  /\bno one else is here\b/i,
  /\brejoin\b/i,
  /\bc[a\u00e1]mara\b/i,
  /\bmicr[o\u00f3]fono\b/i,
  /\b(apagada|apagado|silenciado|silenciada)\b/i,
  /\bgrabaci[o\u00f3]n\b/i,
];

const existingOverlay = document.getElementById("lingualink-overlay");
const overlay = existingOverlay || document.createElement("div");
overlay.id = "lingualink-overlay";
overlay.innerHTML = `
  <div class="ll-title ll-drag">
    <span>LinguaLink Live</span>
    <span class="ll-status" id="ll-status">connecting</span>
  </div>
  <div class="ll-controls">
    <button class="ll-btn" id="ll-toggle">Hide</button>
    <label class="ll-check"><input type="checkbox" id="ll-es-toggle" checked> ES</label>
    <label class="ll-check"><input type="checkbox" id="ll-hi-toggle" checked> HI</label>
    <button class="ll-btn" id="ll-reset">Reset</button>
  </div>
  <div class="ll-line" id="ll-es"><span class="ll-label">ES</span><span class="ll-text"></span></div>
  <div class="ll-line" id="ll-hi"><span class="ll-label hi">HI</span><span class="ll-text"></span></div>
`;
if (!existingOverlay) {
  document.documentElement.appendChild(overlay);
}

const esLine = overlay.querySelector("#ll-es");
const hiLine = overlay.querySelector("#ll-hi");
const esText = overlay.querySelector("#ll-es .ll-text");
const hiText = overlay.querySelector("#ll-hi .ll-text");
const statusText = overlay.querySelector("#ll-status");
const toggleButton = overlay.querySelector("#ll-toggle");
const esToggle = overlay.querySelector("#ll-es-toggle");
const hiToggle = overlay.querySelector("#ll-hi-toggle");
const resetButton = overlay.querySelector("#ll-reset");
const dragHandle = overlay.querySelector(".ll-drag");

const settings = loadSettings();
applySettings();
wireControls();

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { ...DEFAULT_SETTINGS };
    }
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch (err) {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (err) {
    // Ignore storage errors.
  }
}

function applySettings() {
  esToggle.checked = settings.showEs;
  hiToggle.checked = settings.showHi;
  updateVisibility();
  applyPosition(settings.position);
}

function updateVisibility() {
  const show = settings.showCaptions;
  const showEs = show && settings.showEs;
  const showHi = show && settings.showHi;
  esLine.style.display = showEs ? "" : "none";
  hiLine.style.display = showHi ? "" : "none";
  overlay.classList.toggle("ll-collapsed", !show);
  overlay.classList.toggle("ll-empty", show && !settings.showEs && !settings.showHi);
  toggleButton.textContent = show ? "Hide" : "Show";
}

function wireControls() {
  toggleButton.addEventListener("click", () => {
    settings.showCaptions = !settings.showCaptions;
    updateVisibility();
    saveSettings();
    lastSentCaption = "";
  });

  esToggle.addEventListener("change", () => {
    settings.showEs = esToggle.checked;
    updateVisibility();
    saveSettings();
    lastSentCaption = "";
  });

  hiToggle.addEventListener("change", () => {
    settings.showHi = hiToggle.checked;
    updateVisibility();
    saveSettings();
    lastSentCaption = "";
  });

  resetButton.addEventListener("click", () => {
    settings.position = null;
    applyPosition(null);
    saveSettings();
  });

  dragHandle.addEventListener("pointerdown", startDrag);
  window.addEventListener("pointermove", onDrag);
  window.addEventListener("pointerup", endDrag);
  window.addEventListener("resize", () => {
    if (settings.position) {
      const clamped = clampPosition(settings.position.left, settings.position.top);
      settings.position = clamped;
      applyPosition(clamped);
      saveSettings();
    }
  });
}

function startDrag(event) {
  if (event.button !== 0) {
    return;
  }
  event.preventDefault();
  dragHandle.setPointerCapture(event.pointerId);
  const rect = overlay.getBoundingClientRect();
  dragState = {
    startX: event.clientX,
    startY: event.clientY,
    startLeft: rect.left,
    startTop: rect.top,
  };
  overlay.style.left = `${rect.left}px`;
  overlay.style.top = `${rect.top}px`;
  overlay.style.right = "auto";
  overlay.style.bottom = "auto";
}

function onDrag(event) {
  if (!dragState) {
    return;
  }
  const deltaX = event.clientX - dragState.startX;
  const deltaY = event.clientY - dragState.startY;
  const nextLeft = dragState.startLeft + deltaX;
  const nextTop = dragState.startTop + deltaY;
  const clamped = clampPosition(nextLeft, nextTop);
  overlay.style.left = `${clamped.left}px`;
  overlay.style.top = `${clamped.top}px`;
}

function endDrag(event) {
  if (!dragState) {
    return;
  }
  dragHandle.releasePointerCapture(event.pointerId);
  const rect = overlay.getBoundingClientRect();
  settings.position = { left: rect.left, top: rect.top };
  saveSettings();
  dragState = null;
}

function clampPosition(left, top) {
  const maxLeft = Math.max(0, window.innerWidth - overlay.offsetWidth);
  const maxTop = Math.max(0, window.innerHeight - overlay.offsetHeight);
  return {
    left: Math.min(Math.max(0, left), maxLeft),
    top: Math.min(Math.max(0, top), maxTop),
  };
}

function applyPosition(position) {
  if (position && typeof position.left === "number" && typeof position.top === "number") {
    overlay.style.left = `${position.left}px`;
    overlay.style.top = `${position.top}px`;
    overlay.style.right = "auto";
    overlay.style.bottom = "auto";
  } else {
    overlay.style.left = "";
    overlay.style.top = "";
    overlay.style.right = "20px";
    overlay.style.bottom = "20px";
  }
}

function setStatus(text, state) {
  statusText.textContent = text;
  statusText.classList.toggle("ok", state === "ok");
  statusText.classList.toggle("err", state === "err");
}

function connectSocket() {
  const url = BACKEND_URLS[backendIndex];
  setStatus("connecting");
  socket = new WebSocket(url);
  socket.addEventListener("open", () => {
    setStatus("connected", "ok");
  });
  socket.addEventListener("message", (event) => {
    try {
      const payload = JSON.parse(event.data);
      if (payload.translations) {
        esText.textContent = payload.translations.es || "";
        hiText.textContent = payload.translations.hi || "";
      }
    } catch (err) {
      // Ignore invalid messages.
    }
  });
  socket.addEventListener("close", () => {
    setStatus("reconnecting", "err");
    backendIndex = (backendIndex + 1) % BACKEND_URLS.length;
    setTimeout(connectSocket, 1500);
  });
  socket.addEventListener("error", () => {
    setStatus("error", "err");
  });
}

function normalizeText(text) {
  return text.replace(/\s+/g, " ").trim();
}

function isVisible(element) {
  return !!(element.offsetWidth || element.offsetHeight || element.getClientRects().length);
}

function isCaptionContainer(element) {
  if (!element) {
    return false;
  }
  if (element.getAttribute("role") === "log") {
    return true;
  }
  if (element.closest('[role="log"]')) {
    return true;
  }
  if (element.hasAttribute("aria-live")) {
    return true;
  }
  if (element.hasAttribute("data-caption")) {
    return true;
  }
  return /caption|subtitle/i.test(element.className || "");
}

function looksLikeSystemMessage(text) {
  return SYSTEM_MESSAGE_PATTERNS.some((pattern) => pattern.test(text));
}

function shouldAcceptCandidate(element, text) {
  if (!text) {
    return false;
  }
  if (looksLikeSystemMessage(text) && !isCaptionContainer(element)) {
    return false;
  }
  return true;
}

function captureFromElement(element) {
  if (!element || element === document.documentElement || element === document.body) {
    return "";
  }
  const captionElement =
    (element.matches && element.matches(CAPTION_SELECTOR) && element) ||
    (element.closest && element.closest(CAPTION_SELECTOR));
  if (!captionElement) {
    return "";
  }
  if (!isVisible(captionElement) && !captionElement.hasAttribute("aria-live")) {
    return "";
  }
  let text = "";
  const lineContainer =
    (captionElement.matches && captionElement.matches(MEET_LINE_CONTAINER) && captionElement) ||
    (captionElement.closest && captionElement.closest(MEET_LINE_CONTAINER));
  if (lineContainer) {
    const lineText = lineContainer.querySelector(MEET_LINE_TEXT);
    if (lineText) {
      text = normalizeText(lineText.textContent || "");
    }
  }
  if (!text && captionElement.matches && captionElement.matches(MEET_LINE_TEXT)) {
    text = normalizeText(captionElement.textContent || "");
  }
  if (!text) {
    text = normalizeText(captionElement.textContent || "");
  }
  if (text.length < 2 || text.length > 300) {
    return "";
  }
  if (!shouldAcceptCandidate(captionElement, text)) {
    return "";
  }
  return text;
}

function handleCandidate(text) {
  if (!text || text === lastSeenCaption) {
    return;
  }
  lastSeenCaption = text;
  lastCaptionAt = Date.now();
}

function scanForCaption() {
  let best = "";
  let bestScore = 0;
  getSearchRoots().forEach((root) => {
    root.querySelectorAll(MEET_LINE_TEXT).forEach((node) => {
      const text = normalizeText(node.textContent || "");
      if (text.length < 2 || text.length > 300) {
        return;
      }
      if (!shouldAcceptCandidate(node, text)) {
        return;
      }
      const score = scoreCandidate(node, text) + 20;
      if (score > bestScore) {
        bestScore = score;
        best = text;
      }
    });
    root.querySelectorAll(CAPTION_SELECTOR).forEach((node) => {
      const text = normalizeText(node.textContent || "");
      if (text.length < 2 || text.length > 300) {
        return;
      }
      if (!isVisible(node) && !node.hasAttribute("aria-live")) {
        return;
      }
      if (!shouldAcceptCandidate(node, text)) {
        return;
      }
      const score = scoreCandidate(node, text);
      if (score > bestScore) {
        bestScore = score;
        best = text;
      }
    });
  });
  handleCandidate(best);
}

const observer = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    if (mutation.type === "characterData") {
      const text = captureFromElement(mutation.target.parentElement);
      if (text) {
        handleCandidate(text);
      }
      continue;
    }
    for (const node of mutation.addedNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = captureFromElement(node.parentElement);
        if (text) {
          handleCandidate(text);
        }
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const text = captureFromElement(node);
        if (text) {
          handleCandidate(text);
        }
      }
    }
  }
});

const observedTargets = new WeakSet();

function observeTarget(target) {
  if (!target || observedTargets.has(target)) {
    return;
  }
  observedTargets.add(target);
  observer.observe(target, { subtree: true, childList: true, characterData: true });
}

function getDocuments() {
  const docs = [document];
  document.querySelectorAll("iframe").forEach((frame) => {
    try {
      const doc = frame.contentDocument;
      if (doc && !docs.includes(doc)) {
        docs.push(doc);
      }
    } catch (err) {
      // Cross-origin frame.
    }
  });
  return docs;
}

function getShadowRoots(doc) {
  const roots = [];
  if (!doc || !doc.documentElement) {
    return roots;
  }
  const walker = doc.createTreeWalker(doc.documentElement, NodeFilter.SHOW_ELEMENT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node.shadowRoot) {
      roots.push(node.shadowRoot);
    }
  }
  return roots;
}

function getSearchRoots() {
  const roots = [];
  getDocuments().forEach((doc) => {
    roots.push(doc);
    getShadowRoots(doc).forEach((root) => roots.push(root));
  });
  return roots;
}

function scoreCandidate(node, text) {
  let score = text.length;
  if (node.getAttribute("aria-live")) {
    score += 50;
  }
  if (node.getAttribute("role") === "log") {
    score += 40;
  }
  if (node.hasAttribute("data-caption")) {
    score += 40;
  }
  if (/caption|subtitle/i.test(node.className || "")) {
    score += 30;
  }
  if (looksLikeSystemMessage(text)) {
    score -= 40;
  }
  return score;
}

function refreshObservers() {
  getDocuments().forEach((doc) => {
    observeTarget(doc.body || doc.documentElement);
    getShadowRoots(doc).forEach((root) => observeTarget(root));
  });
}

function ensureOverlayAttached() {
  if (!overlay.isConnected) {
    document.documentElement.appendChild(overlay);
  }
}

function isFinal(text) {
  return /[.!?]\s*$/.test(text);
}

function getSelectedTargets() {
  const targets = [];
  if (settings.showEs) {
    targets.push("spa_Latn");
  }
  if (settings.showHi) {
    targets.push("hin_Deva");
  }
  return targets;
}

function tick() {
  if (socket && socket.readyState === WebSocket.OPEN) {
    const now = Date.now();
    const targets = getSelectedTargets();
    if (settings.showCaptions && targets.length > 0) {
      if (lastSeenCaption && lastSeenCaption !== lastSentCaption && now - lastSentAt > 250) {
        lastSentCaption = lastSeenCaption;
        lastSentAt = now;
        socket.send(
          JSON.stringify({
            text: lastSeenCaption,
            is_final: isFinal(lastSeenCaption),
            targets: targets,
          })
        );
      }
    }
  }
  requestAnimationFrame(tick);
}

connectSocket();
refreshObservers();
scanForCaption();
setInterval(() => {
  ensureOverlayAttached();
  refreshObservers();
  if (Date.now() - lastCaptionAt > 2000) {
    scanForCaption();
  }
}, 1000);
requestAnimationFrame(tick);
