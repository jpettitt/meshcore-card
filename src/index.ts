import { MeshcoreCard } from "./card.js";
import { MeshcoreCardEditor } from "./editor.js";

// ── Registration ──────────────────────────────────────────────────────────────

if (!customElements.get("meshcore-card")) {
  customElements.define("meshcore-card", MeshcoreCard);
}
if (!customElements.get("meshcore-card-editor")) {
  customElements.define("meshcore-card-editor", MeshcoreCardEditor);
}

window.customCards = window.customCards || [];
if (!window.customCards.find((c) => c.type === "meshcore-card")) {
  window.customCards.push({
    type: "meshcore-card",
    name: "MeshCore Card",
    description: "Displays node statistics from the MeshCore integration",
    preview: true,
    documentationURL: "https://github.com/jpettitt/meshcore-card",
  });
}
