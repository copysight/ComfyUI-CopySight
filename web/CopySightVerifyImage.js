import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";
import {
  formatSimilarity,
  panelMinimumHeight,
  phaseViewModel,
  READY_PANEL_MIN_HEIGHT,
  resultViewModel,
} from "./copysight_state.js";


const NODE_CLASS = "CopySightVerifyImage";
const EVENT_NAME = "copysight_progress";
const LOGO_URL = new URL("./assets/copysight-logo.png", import.meta.url).href;
const INSTANCES = new Map();
const MIN_NODE_WIDTH = 320;
const RESULT_MIN_NODE_WIDTH = 560;

const STYLES = `
  .copysight-container {
    container-type: size;
    height: 100%;
    min-height: 0;
    min-width: 0;
    overflow: hidden;
    width: 100%;
  }
  .copysight-panel {
    --copysight-accent: #38bdf8;
    --copysight-border: var(--border-color, #343741);
    --copysight-control: var(--comfy-input-bg, #24262d);
    --copysight-muted: var(--descrip-text, #979cab);
    background: var(--comfy-menu-bg, #17181d);
    border: 1px solid var(--copysight-border);
    border-radius: 9px;
    box-sizing: border-box;
    color: var(--fg-color, #f4f4f5);
    display: flex;
    flex-direction: column;
    font-size: clamp(8px, 2.7cqw, 11px);
    gap: clamp(5px, 1.6cqw, 10px);
    height: 100%;
    min-height: 0;
    overflow: hidden;
    padding: clamp(6px, 2cqw, 11px);
    width: 100%;
  }
  .copysight-panel * { box-sizing: border-box; }
  .copysight-panel [hidden] { display: none !important; }
  .copysight-result {
    display: grid;
    flex: 1;
    gap: clamp(5px, 1.6cqw, 10px);
    grid-template-columns: minmax(0, 1.45fr) minmax(145px, .9fr);
    min-height: 0;
    overflow: hidden;
  }
  .copysight-result-main {
    display: grid;
    gap: clamp(5px, 1.6cqw, 10px);
    grid-template-rows: minmax(110px, 1fr) auto;
    min-height: 0;
    overflow: hidden;
  }
  .copysight-result-findings {
    display: grid;
    gap: clamp(4px, 1.3cqw, 7px);
    grid-template-rows: auto minmax(0, 1fr);
    min-height: 0;
    overflow: hidden;
  }
  .copysight-header {
    align-items: center;
    display: flex;
    gap: 10px;
    justify-content: space-between;
  }
  .copysight-brand {
    align-items: center;
    display: flex;
    gap: clamp(6px, 2cqw, 9px);
    min-width: 0;
  }
  .copysight-logo {
    flex: 0 0 auto;
    height: clamp(20px, 6cqw, 28px);
    object-fit: contain;
    width: clamp(20px, 6cqw, 28px);
  }
  .copysight-title {
    font-size: clamp(11px, 3.2cqw, 13px);
    font-weight: 700;
    line-height: 1.25;
  }
  .copysight-subtitle {
    color: var(--copysight-muted);
    font-size: clamp(8px, 2.5cqw, 10px);
    line-height: 1.35;
    margin-top: 2px;
  }
  .copysight-badge {
    background: var(--copysight-control);
    border: 1px solid var(--copysight-border);
    border-radius: 999px;
    color: var(--copysight-muted);
    flex: 0 0 auto;
    font-size: clamp(8px, 2.5cqw, 10px);
    font-weight: 700;
    padding: clamp(3px, 1cqw, 4px) clamp(6px, 2cqw, 8px);
  }
  .copysight-panel[data-phase="checking"] .copysight-badge,
  .copysight-panel[data-phase="preparing"] .copysight-badge,
  .copysight-panel[data-phase="rendering"] .copysight-badge {
    border-color: var(--copysight-accent);
    color: var(--copysight-accent);
  }
  .copysight-panel[data-phase="complete"] .copysight-badge {
    border-color: #22c55e;
    color: #86efac;
  }
  .copysight-panel[data-phase="error"] .copysight-badge {
    border-color: #ef4444;
    color: #fca5a5;
  }
  .copysight-status {
    background: var(--copysight-control);
    border: 1px solid var(--copysight-border);
    border-radius: 7px;
    color: var(--copysight-muted);
    font-size: clamp(8px, 2.5cqw, 10px);
    line-height: 1.4;
    min-height: clamp(30px, 9cqh, 36px);
    padding: clamp(6px, 2cqw, 9px);
  }
  .copysight-panel[data-phase="complete"] .copysight-status {
    display: none;
  }
  .copysight-panel[data-phase="error"] .copysight-status {
    border-color: #ef4444;
    color: #fecaca;
  }
  .copysight-preview {
    align-items: center;
    background: #0b0d12;
    border: 1px solid var(--copysight-border);
    border-radius: 7px;
    display: flex;
    height: 100%;
    justify-content: center;
    min-height: 0;
    min-width: 0;
    overflow: hidden;
    width: 100%;
  }
  .copysight-preview img {
    display: block;
    height: 100%;
    object-fit: contain;
    width: 100%;
  }
  .copysight-summary {
    display: grid;
    gap: clamp(4px, 1.5cqw, 7px);
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .copysight-summary-item {
    background: var(--copysight-control);
    border: 1px solid var(--copysight-border);
    border-radius: 7px;
    min-width: 0;
    padding: clamp(5px, 2cqw, 8px);
  }
  .copysight-summary-label {
    color: var(--copysight-muted);
    font-size: clamp(7px, 2.2cqw, 9px);
    line-height: 1.2;
  }
  .copysight-summary-value {
    font-size: clamp(11px, 3.5cqw, 14px);
    font-variant-numeric: tabular-nums;
    font-weight: 700;
    line-height: 1.25;
    margin-top: 3px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .copysight-findings-header {
    align-items: flex-start;
    display: flex;
    flex-direction: column;
    font-size: clamp(8px, 2.5cqw, 10px);
    font-weight: 700;
    gap: 2px;
  }
  .copysight-findings-note {
    color: var(--copysight-muted);
    font-size: clamp(7px, 2.2cqw, 9px);
    font-weight: 400;
  }
  .copysight-findings {
    display: flex;
    flex-direction: column;
    gap: clamp(4px, 1.5cqw, 6px);
    height: 100%;
    min-height: 0;
    overflow: auto;
    padding-right: 2px;
  }
  .copysight-finding {
    background: var(--copysight-control);
    border: 1px solid var(--copysight-border);
    border-radius: 6px;
    padding: clamp(5px, 2cqw, 8px);
  }
  .copysight-finding-top {
    align-items: baseline;
    display: flex;
    gap: 8px;
    justify-content: space-between;
  }
  .copysight-finding-identity {
    align-items: center;
    display: flex;
    gap: clamp(4px, 1.5cqw, 7px);
    min-width: 0;
  }
  .copysight-finding-swatch {
    background: var(--copysight-finding-color, var(--copysight-accent));
    border-radius: 2px;
    flex: 0 0 auto;
    height: clamp(7px, 2.2cqw, 10px);
    width: clamp(7px, 2.2cqw, 10px);
  }
  .copysight-finding-name {
    font-size: clamp(9px, 2.8cqw, 11px);
    font-weight: 700;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .copysight-finding-score {
    color: var(--copysight-finding-color, var(--copysight-accent));
    flex: 0 0 auto;
    font-size: clamp(9px, 2.8cqw, 11px);
    font-variant-numeric: tabular-nums;
    font-weight: 700;
  }
  .copysight-finding-category,
  .copysight-finding-detail {
    color: var(--copysight-muted);
    font-size: clamp(7px, 2.2cqw, 9px);
    line-height: 1.35;
    margin-top: 3px;
    overflow-wrap: anywhere;
  }
  .copysight-empty {
    align-items: center;
    border: 1px dashed var(--copysight-border);
    border-radius: 7px;
    color: var(--copysight-muted);
    display: flex;
    font-size: clamp(8px, 2.5cqw, 10px);
    height: 100%;
    justify-content: center;
    min-height: 54px;
    padding: clamp(6px, 2cqw, 10px);
    text-align: center;
  }
`;

function injectStyles() {
  const id = "copysight-node-styles";
  if (document.getElementById(id)) return;
  const style = document.createElement("style");
  style.id = id;
  style.textContent = STYLES;
  document.head.appendChild(style);
}

function nodeKey(value) {
  return value == null ? "" : String(value);
}

function previewUrl(preview) {
  if (!preview?.filename) return "";
  const params = new URLSearchParams({
    filename: preview.filename,
    subfolder: preview.subfolder || "",
    type: preview.type || "temp",
    timestamp: String(Date.now()),
  });
  return api.apiURL(`/view?${params.toString()}`);
}

class CopySightPanel {
  constructor(node, container) {
    injectStyles();
    this.node = node;
    this.container = container;
    this.hasResult = false;
    this.build();
    this.setPhase("idle");
  }

  build() {
    this.container.innerHTML = `
      <section class="copysight-panel" data-phase="idle" aria-label="CopySight verification result">
        <header class="copysight-header">
          <div class="copysight-brand">
            <img class="copysight-logo" src="${LOGO_URL}" alt="" aria-hidden="true">
            <div>
              <div class="copysight-title">CopySight</div>
              <div class="copysight-subtitle">IP similarity verification</div>
            </div>
          </div>
          <span class="copysight-badge" data-role="badge">Ready</span>
        </header>
        <div class="copysight-status" data-role="status" aria-live="polite"></div>
        <div class="copysight-result" data-role="result" hidden>
          <div class="copysight-result-main">
            <div class="copysight-preview">
              <img data-role="preview" alt="CopySight annotated result">
            </div>
            <div class="copysight-summary">
              <div class="copysight-summary-item">
                <div class="copysight-summary-label">Findings</div>
                <div class="copysight-summary-value" data-role="finding-count">0</div>
              </div>
              <div class="copysight-summary-item">
                <div class="copysight-summary-label">Highest match</div>
                <div class="copysight-summary-value" data-role="highest-similarity">0%</div>
              </div>
              <div class="copysight-summary-item">
                <div class="copysight-summary-label">Face detected</div>
                <div class="copysight-summary-value" data-role="contains-face">No</div>
              </div>
            </div>
          </div>
          <aside class="copysight-result-findings" aria-label="Detected similarities">
            <div class="copysight-findings-header">
              <span>Detected similarities</span>
              <span class="copysight-findings-note">Evidence, not a legal verdict</span>
            </div>
            <div class="copysight-findings" data-role="findings"></div>
          </aside>
        </div>
      </section>
    `;
    this.panel = this.container.querySelector(".copysight-panel");
    this.badge = this.container.querySelector('[data-role="badge"]');
    this.status = this.container.querySelector('[data-role="status"]');
    this.result = this.container.querySelector('[data-role="result"]');
    this.preview = this.container.querySelector('[data-role="preview"]');
    this.findingCount = this.container.querySelector('[data-role="finding-count"]');
    this.highestSimilarity = this.container.querySelector('[data-role="highest-similarity"]');
    this.containsFace = this.container.querySelector('[data-role="contains-face"]');
    this.findings = this.container.querySelector('[data-role="findings"]');
  }

  setPhase(phase, message = "") {
    const state = phaseViewModel(phase, message);
    this.panel.dataset.phase = state.phase;
    this.badge.textContent = state.label;
    this.status.textContent = state.message;
    if (["idle", "preparing", "checking"].includes(state.phase)) this.clearResult();
  }

  clearResult() {
    const hadResult = this.hasResult;
    this.hasResult = false;
    delete this.panel.dataset.hasResult;
    this.result.hidden = true;
    this.preview.removeAttribute("src");
    this.findings.replaceChildren();
    if (hadResult) {
      requestAnimationFrame(() => {
        const computed = this.node.computeSize();
        this.node.setSize([
          Math.max(this.node.size[0], MIN_NODE_WIDTH),
          Math.max(computed[1], 260),
        ]);
        app.graph?.setDirtyCanvas(true, true);
      });
    }
  }

  applyResult(payload) {
    const result = resultViewModel(payload);
    const url = previewUrl(result.preview);
    if (url) this.preview.src = url;
    else this.preview.removeAttribute("src");
    this.findingCount.textContent = String(result.findingCount);
    this.highestSimilarity.textContent = result.highestSimilarity;
    this.containsFace.textContent = result.containsFace ? "Yes" : "No";
    this.renderFindings(result.findings);
    this.hasResult = true;
    this.panel.dataset.hasResult = "true";
    this.result.hidden = false;
    this.setPhase("complete");
    requestAnimationFrame(() => {
      const computed = this.node.computeSize();
      this.node.setSize([
        Math.max(this.node.size[0], RESULT_MIN_NODE_WIDTH),
        Math.max(this.node.size[1], computed[1]),
      ]);
      app.graph?.setDirtyCanvas(true, true);
    });
  }

  renderFindings(findings) {
    this.findings.replaceChildren();
    if (!findings.length) {
      const empty = document.createElement("div");
      empty.className = "copysight-empty";
      empty.textContent = "No protected IP matches were returned.";
      this.findings.appendChild(empty);
      return;
    }

    const fragment = document.createDocumentFragment();
    for (const finding of findings) {
      const item = document.createElement("article");
      item.className = "copysight-finding";
      item.style.setProperty("--copysight-finding-color", finding.display_color || "#38bdf8");

      const top = document.createElement("div");
      top.className = "copysight-finding-top";
      const identity = document.createElement("div");
      identity.className = "copysight-finding-identity";
      const swatch = document.createElement("span");
      swatch.className = "copysight-finding-swatch";
      swatch.setAttribute("aria-hidden", "true");
      const name = document.createElement("div");
      name.className = "copysight-finding-name";
      name.textContent = finding.name || "Unnamed finding";
      identity.append(swatch, name);
      const score = document.createElement("div");
      score.className = "copysight-finding-score";
      score.textContent = formatSimilarity(finding.similarity);
      top.append(identity, score);
      item.appendChild(top);

      const category = document.createElement("div");
      category.className = "copysight-finding-category";
      category.textContent = finding.category || "Uncategorized";
      item.appendChild(category);

      if (finding.author) {
        const author = document.createElement("div");
        author.className = "copysight-finding-detail";
        author.textContent = `Author: ${finding.author}`;
        item.appendChild(author);
      }
      if (finding.owner) {
        const owner = document.createElement("div");
        owner.className = "copysight-finding-detail";
        owner.textContent = `Owner: ${finding.owner}`;
        item.appendChild(owner);
      }
      fragment.appendChild(item);
    }
    this.findings.appendChild(fragment);
  }

  dispose() {
    this.preview.removeAttribute("src");
    this.container.replaceChildren();
  }
}

function removeInstance(node) {
  const key = nodeKey(node.id);
  INSTANCES.get(key)?.dispose();
  INSTANCES.delete(key);
}

function restoreDefaultNodeColors(node) {
  node.color = null;
  node.bgcolor = null;
}


app.registerExtension({
  name: "ComfyUI.CopySightVerifyImage",
  nodeCreated(node) {
    if ((node.constructor?.comfyClass || node.comfyClass) !== NODE_CLASS) return;
    restoreDefaultNodeColors(node);

    const container = document.createElement("div");
    container.className = "copysight-container";
    container.style.width = "100%";
    container.style.height = "100%";
    container.style.minHeight = `${READY_PANEL_MIN_HEIGHT}px`;

    let panel = null;
    const widget = node.addDOMWidget("copysight_panel", "copysight-panel", container, {
      getMinHeight: () => panelMinimumHeight(panel?.hasResult),
      hideOnZoom: false,
      serialize: false,
    });
    node.setSize([
      Math.max(node.size[0], MIN_NODE_WIDTH),
      Math.max(node.computeSize()[1], 260),
    ]);

    window.setTimeout(() => {
      removeInstance(node);
      panel = new CopySightPanel(node, container);
      INSTANCES.set(nodeKey(node.id), panel);
    }, 0);

    const originalOnConfigure = node.onConfigure;
    node.onConfigure = function (...args) {
      const result = originalOnConfigure?.apply(this, args);
      restoreDefaultNodeColors(this);
      return result;
    };

    const originalOnExecuted = node.onExecuted;
    node.onExecuted = function (message) {
      originalOnExecuted?.apply(this, arguments);
      const payload = message?.copysight?.[0];
      if (payload) INSTANCES.get(nodeKey(this.id))?.applyResult(payload);
    };

    const originalOnRemoved = node.onRemoved;
    node.onRemoved = function () {
      removeInstance(this);
      return originalOnRemoved?.apply(this, arguments);
    };
    widget.onRemove = () => removeInstance(node);
  },
});

api.addEventListener("executing", (event) => {
  const detail = event.detail;
  const activeNode = detail && typeof detail === "object" ? detail.node : detail;
  INSTANCES.get(nodeKey(activeNode))?.setPhase("preparing");
});

api.addEventListener(EVENT_NAME, (event) => {
  const detail = event.detail;
  if (!detail) return;
  INSTANCES.get(nodeKey(detail.node))?.setPhase(detail.phase, detail.message);
});
