import { MeshcoreCard } from "./card.js";
import { MeshcoreCardEditor } from "./editor.js";
import { MeshcoreContactCard, MeshcoreContactCardEditor } from "./contact-card.js";
import { MeshcoreChannelCard, MeshcoreChannelCardEditor } from "./channel-card.js";

// ── Registration ──────────────────────────────────────────────────────────────

if (!customElements.get("meshcore-card")) {
  customElements.define("meshcore-card", MeshcoreCard);
}
if (!customElements.get("meshcore-card-editor")) {
  customElements.define("meshcore-card-editor", MeshcoreCardEditor);
}
if (!customElements.get("meshcore-contact-card")) {
  customElements.define("meshcore-contact-card", MeshcoreContactCard);
}
if (!customElements.get("meshcore-contact-card-editor")) {
  customElements.define("meshcore-contact-card-editor", MeshcoreContactCardEditor);
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
if (!window.customCards.find((c) => c.type === "meshcore-contact-card")) {
  window.customCards.push({
    type: "meshcore-contact-card",
    name: "MeshCore Contact Card",
    description: "Lists all MeshCore contact nodes sorted by most recently heard",
    preview: true,
    documentationURL: "https://github.com/jpettitt/meshcore-card",
  });
}

if (!customElements.get("meshcore-channel-card")) {
  customElements.define("meshcore-channel-card", MeshcoreChannelCard);
}
if (!customElements.get("meshcore-channel-card-editor")) {
  customElements.define("meshcore-channel-card-editor", MeshcoreChannelCardEditor);
}
if (!window.customCards.find((c) => c.type === "meshcore-channel-card")) {
  window.customCards.push({
    type: "meshcore-channel-card",
    name: "MeshCore Channel Card",
    description: "Shows active MeshCore channels by hub",
    preview: true,
    documentationURL: "https://github.com/jpettitt/meshcore-card",
  });
}
