export const READY_PANEL_MIN_HEIGHT = 110;
export const RESULT_PANEL_MIN_HEIGHT = 400;

export function panelMinimumHeight(hasResult) {
  return hasResult ? RESULT_PANEL_MIN_HEIGHT : READY_PANEL_MIN_HEIGHT;
}

export function formatSimilarity(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "0%";
  return `${Math.round(Math.max(0, Math.min(1, number)) * 100)}%`;
}

export function resultViewModel(payload = {}) {
  const findings = Array.isArray(payload.findings)
    ? [...payload.findings].sort((left, right) => Number(right.similarity || 0) - Number(left.similarity || 0))
    : [];
  return {
    preview: payload.preview && typeof payload.preview === "object" ? payload.preview : null,
    containsFace: payload.contains_face === true,
    findingCount: Number.isInteger(payload.finding_count) ? payload.finding_count : findings.length,
    highestSimilarity: formatSimilarity(payload.highest_similarity),
    findings,
  };
}

export function phaseViewModel(phase, message = "") {
  const states = {
    idle: ["Ready", "Connect one image and queue the graph."],
    preparing: ["Preparing", "Preparing image…"],
    checking: ["Checking", "Uploading image to CopySight…"],
    rendering: ["Rendering", "Rendering CopySight findings…"],
    complete: ["Complete", "CopySight check complete."],
    error: ["Error", "CopySight verification failed."],
  };
  const [label, fallback] = states[phase] || states.idle;
  return { phase: states[phase] ? phase : "idle", label, message: message || fallback };
}
