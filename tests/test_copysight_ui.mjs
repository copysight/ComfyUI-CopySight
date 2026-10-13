import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";


const STATE_URL = new URL("../web/copysight_state.js", import.meta.url);

async function loadState() {
  const source = await readFile(STATE_URL, "utf8");
  return import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
}

test("similarity values render as bounded percentages", async () => {
  const state = await loadState();
  assert.equal(state.formatSimilarity(0.923), "92%");
  assert.equal(state.formatSimilarity(-1), "0%");
  assert.equal(state.formatSimilarity(2), "100%");
  assert.equal(state.formatSimilarity("invalid"), "0%");
});

test("result model sorts findings without mutating the backend payload", async () => {
  const state = await loadState();
  const payload = {
    contains_face: true,
    finding_count: 2,
    highest_similarity: 0.91,
    preview: { filename: "result.png", type: "temp" },
    findings: [
      { name: "Lower", similarity: 0.4, display_color: "#f97316" },
      { name: "Higher", similarity: 0.91, display_color: "#38bdf8" },
    ],
  };
  const result = state.resultViewModel(payload);
  assert.equal(result.containsFace, true);
  assert.equal(result.highestSimilarity, "91%");
  assert.deepEqual(result.findings.map((finding) => finding.name), ["Higher", "Lower"]);
  assert.deepEqual(result.findings.map((finding) => finding.display_color), ["#38bdf8", "#f97316"]);
  assert.deepEqual(payload.findings.map((finding) => finding.name), ["Lower", "Higher"]);
});

test("phase model keeps errors local and actionable", async () => {
  const state = await loadState();
  assert.deepEqual(state.phaseViewModel("checking"), {
    phase: "checking",
    label: "Checking",
    message: "Uploading image to CopySight…",
  });
  assert.deepEqual(state.phaseViewModel("error", "CopySight rejected the API key."), {
    phase: "error",
    label: "Error",
    message: "CopySight rejected the API key.",
  });
});

test("panel minimum height follows ready and result content", async () => {
  const state = await loadState();
  assert.equal(state.panelMinimumHeight(false), 110);
  assert.equal(state.panelMinimumHeight(true), 400);
});
