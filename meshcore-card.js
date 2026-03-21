/**
 * MeshCore Card for Home Assistant
 * Displays node statistics from the meshcore integration
 */

const NODE_TYPES = { 1: "Client", 2: "Repeater", 3: "Room Server", 4: "Sensor" };

class MeshcoreCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  setConfig(config) {
    this._config = config;
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  _getState(entityId) {
    return this._hass.states[entityId];
  }

  _val(entityId) {
    const s = this._getState(entityId);
    return s ? s.state : null;
  }

  _attr(entityId, attr) {
    const s = this._getState(entityId);
    return s ? s.attributes[attr] : null;
  }

  // Find the first entity matching a prefix (handles optional _nodename suffix)
  _findEntity(prefix) {
    const exact = this._hass.states[prefix];
    if (exact) return prefix;
    for (const entityId of Object.keys(this._hass.states)) {
      if (entityId.startsWith(prefix + "_")) return entityId;
    }
    return null;
  }

  _valByPrefix(prefix) {
    const id = this._findEntity(prefix);
    return id ? this._val(id) : null;
  }

  _discoverHubs() {
    const hubs = {};
    const pattern = /^sensor\.meshcore_([a-f0-9]+)_node_count(?:_.+)?$/;
    for (const entityId of Object.keys(this._hass.states)) {
      const m = entityId.match(pattern);
      if (m) hubs[m[1]] = m[1];
    }
    return Object.keys(hubs);
  }

  _discoverNodes(pubkey) {
    const nodes = {};
    const pattern = new RegExp(`^sensor\\.meshcore_${pubkey}_status_(.+)$`);
    for (const entityId of Object.keys(this._hass.states)) {
      const m = entityId.match(pattern);
      if (m) nodes[m[1]] = true;
    }
    return Object.keys(nodes);
  }

  _formatLastSeen(entityId) {
    const ts = this._val(entityId);
    if (!ts || ts === "unknown" || ts === "unavailable") return "—";
    const n = Number(ts);
    if (isNaN(n)) return ts;
    const diff = Math.floor((Date.now() / 1000) - n);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  }

  _rssiClass(rssi) {
    const v = Number(rssi);
    if (isNaN(v)) return "";
    if (v >= -70) return "signal-good";
    if (v >= -90) return "signal-ok";
    return "signal-bad";
  }

  _batteryIcon(pct) {
    const v = Number(pct);
    if (isNaN(v)) return "mdi:battery-unknown";
    if (v >= 90) return "mdi:battery";
    if (v >= 70) return "mdi:battery-80";
    if (v >= 50) return "mdi:battery-60";
    if (v >= 30) return "mdi:battery-40";
    if (v >= 10) return "mdi:battery-20";
    return "mdi:battery-alert";
  }

  _batteryClass(pct) {
    const v = Number(pct);
    if (isNaN(v)) return "";
    if (v >= 50) return "battery-good";
    if (v >= 20) return "battery-ok";
    return "battery-low";
  }

  _renderHub(pubkey) {
    const pfx = (m) => `sensor.meshcore_${pubkey}_${m}`;
    const status = this._valByPrefix(pfx("node_status")) || "unknown";
    const battery = this._valByPrefix(pfx("battery_percentage"));
    const nodeCount = this._valByPrefix(pfx("node_count"));
    const freq = this._valByPrefix(pfx("frequency"));
    const bw = this._valByPrefix(pfx("bandwidth"));
    const sf = this._valByPrefix(pfx("spreading_factor"));
    const txPower = this._valByPrefix(pfx("tx_power"));
    const isOnline = status === "online" || status === "connected" || status === "1" || status === "true";

    return `
      <div class="hub-card">
        <div class="hub-header">
          <span class="hub-icon">&#9652;</span>
          <span class="hub-pubkey">${pubkey}</span>
          <span class="status-badge ${isOnline ? "online" : "offline"}">${isOnline ? "Online" : "Offline"}</span>
          ${nodeCount !== null ? `<span class="node-count">${nodeCount} nodes</span>` : ""}
          ${battery !== null ? `<span class="battery ${this._batteryClass(battery)}">${battery}%</span>` : ""}
        </div>
        ${freq || bw || sf || txPower ? `
        <div class="rf-params">
          ${freq ? `<span class="rf-param"><span class="rf-label">Freq</span>${parseFloat(freq).toFixed(3)} MHz</span>` : ""}
          ${bw ? `<span class="rf-param"><span class="rf-label">BW</span>${bw} kHz</span>` : ""}
          ${sf ? `<span class="rf-param"><span class="rf-label">SF</span>${sf}</span>` : ""}
          ${txPower ? `<span class="rf-param"><span class="rf-label">TX</span>${txPower} dBm</span>` : ""}
        </div>` : ""}
      </div>`;
  }

  _renderNode(pubkey, nodeName) {
    const p = (metric) => `sensor.meshcore_${pubkey}_${metric}_${nodeName}`;
    const status = this._val(p("status"));
    const battery = this._val(p("battery_percentage")) ?? this._val(p("battery"));
    const rssi = this._val(p("last_rssi"));
    const snr = this._val(p("last_snr"));
    const pathLen = this._val(p("path_length"));
    const routingPath = this._val(p("routing_path"));
    const lastAdvert = this._val(p("last_advert"));
    const nodeType = this._attr(p("status"), "type");
    const isOnline = status === "online" || status === "connected" || status === "1" || status === "true";
    const displayName = nodeName.replace(/_/g, " ");

    return `
      <div class="node-row ${isOnline ? "node-online" : "node-offline"}">
        <div class="node-main">
          <span class="node-status-dot ${isOnline ? "dot-online" : "dot-offline"}"></span>
          <span class="node-name">${displayName}</span>
          ${nodeType ? `<span class="node-type">${NODE_TYPES[nodeType] || nodeType}</span>` : ""}
        </div>
        <div class="node-stats">
          ${rssi !== null ? `<span class="stat ${this._rssiClass(rssi)}" title="RSSI">&#9632; ${rssi} dBm</span>` : ""}
          ${snr !== null ? `<span class="stat" title="SNR">SNR ${snr} dB</span>` : ""}
          ${battery !== null ? `<span class="stat ${this._batteryClass(battery)}" title="Battery">${battery}%</span>` : ""}
          ${pathLen !== null ? `<span class="stat" title="Hops">${pathLen} hop${pathLen != 1 ? "s" : ""}</span>` : ""}
          ${lastAdvert ? `<span class="stat stat-time" title="Last seen">${this._formatLastSeen(p("last_advert"))}</span>` : ""}
        </div>
        ${routingPath && routingPath !== "unknown" && routingPath !== "unavailable" ? `
        <div class="routing-path">via ${routingPath}</div>` : ""}
      </div>`;
  }

  _render() {
    if (!this._hass || !this._config) return;

    const title = this._config.title || "MeshCore Network";
    const hubs = this._discoverHubs();

    let hubsHtml = "";
    if (hubs.length === 0) {
      hubsHtml = `<div class="empty">No MeshCore hubs found.<br>Make sure the meshcore integration is installed.</div>`;
    } else {
      for (const pubkey of hubs) {
        const nodes = this._discoverNodes(pubkey);
        const nodesHtml = nodes.length > 0
          ? nodes.map((n) => this._renderNode(pubkey, n)).join("")
          : `<div class="empty">No remote nodes found.</div>`;
        hubsHtml += `
          ${this._renderHub(pubkey)}
          <div class="nodes-section">
            <div class="nodes-header">Remote Nodes</div>
            ${nodesHtml}
          </div>`;
      }
    }

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          --mc-bg: var(--ha-card-background, var(--card-background-color, #1c1c1e));
          --mc-surface: var(--secondary-background-color, #2c2c2e);
          --mc-border: var(--divider-color, rgba(255,255,255,0.12));
          --mc-text: var(--primary-text-color, #e5e5ea);
          --mc-text-secondary: var(--secondary-text-color, #8e8e93);
          --mc-green: #30d158;
          --mc-yellow: #ffd60a;
          --mc-red: #ff453a;
          --mc-blue: #0a84ff;
          --mc-purple: #bf5af2;
          --mc-radius: var(--ha-card-border-radius, 12px);
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ha-card {
          background: var(--mc-bg);
          border-radius: var(--mc-radius);
          padding: 16px;
          font-family: var(--paper-font-body1_-_font-family, system-ui, sans-serif);
          color: var(--mc-text);
        }
        .card-header {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 16px;
          font-size: 1rem;
          font-weight: 600;
          letter-spacing: 0.02em;
        }
        .card-header svg {
          width: 18px; height: 18px;
          fill: var(--mc-blue);
          flex-shrink: 0;
        }
        .hub-card {
          background: var(--mc-surface);
          border-radius: 10px;
          padding: 12px 14px;
          margin-bottom: 4px;
          border: 1px solid var(--mc-border);
        }
        .hub-header {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 8px;
          font-size: 0.8rem;
        }
        .hub-icon { color: var(--mc-blue); font-size: 1rem; }
        .hub-pubkey {
          font-family: monospace;
          font-size: 0.75rem;
          color: var(--mc-text-secondary);
          background: var(--mc-bg);
          padding: 1px 6px;
          border-radius: 4px;
        }
        .status-badge {
          font-size: 0.65rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          padding: 2px 7px;
          border-radius: 10px;
        }
        .status-badge.online { background: rgba(48,209,88,0.15); color: var(--mc-green); }
        .status-badge.offline { background: rgba(255,69,58,0.15); color: var(--mc-red); }
        .node-count {
          margin-left: auto;
          font-size: 0.75rem;
          color: var(--mc-text-secondary);
        }
        .battery { font-size: 0.75rem; }
        .battery-good { color: var(--mc-green); }
        .battery-ok { color: var(--mc-yellow); }
        .battery-low { color: var(--mc-red); }
        .rf-params {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-top: 8px;
          padding-top: 8px;
          border-top: 1px solid var(--mc-border);
        }
        .rf-param {
          font-size: 0.72rem;
          color: var(--mc-text-secondary);
          background: var(--mc-bg);
          padding: 2px 8px;
          border-radius: 6px;
          display: flex;
          gap: 4px;
          align-items: center;
        }
        .rf-label {
          color: var(--mc-blue);
          font-weight: 600;
          font-size: 0.65rem;
          text-transform: uppercase;
        }
        .nodes-section { margin-bottom: 12px; }
        .nodes-header {
          font-size: 0.65rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--mc-text-secondary);
          padding: 8px 4px 4px;
        }
        .node-row {
          border-radius: 8px;
          padding: 8px 10px;
          margin-bottom: 2px;
          border: 1px solid transparent;
          transition: background 0.15s;
        }
        .node-row:hover { background: var(--mc-surface); }
        .node-online { border-color: transparent; }
        .node-offline { opacity: 0.55; }
        .node-main {
          display: flex;
          align-items: center;
          gap: 7px;
          margin-bottom: 4px;
        }
        .node-status-dot {
          width: 7px; height: 7px;
          border-radius: 50%;
          flex-shrink: 0;
        }
        .dot-online { background: var(--mc-green); box-shadow: 0 0 5px var(--mc-green); }
        .dot-offline { background: var(--mc-text-secondary); }
        .node-name {
          font-size: 0.875rem;
          font-weight: 500;
          text-transform: capitalize;
        }
        .node-type {
          font-size: 0.65rem;
          color: var(--mc-purple);
          background: rgba(191,90,242,0.12);
          padding: 1px 6px;
          border-radius: 6px;
          font-weight: 500;
        }
        .node-stats {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          padding-left: 14px;
        }
        .stat {
          font-size: 0.72rem;
          color: var(--mc-text-secondary);
          background: var(--mc-surface);
          padding: 1px 7px;
          border-radius: 5px;
        }
        .signal-good { color: var(--mc-green); background: rgba(48,209,88,0.1); }
        .signal-ok { color: var(--mc-yellow); background: rgba(255,214,10,0.1); }
        .signal-bad { color: var(--mc-red); background: rgba(255,69,58,0.1); }
        .stat-time { color: var(--mc-text-secondary); font-style: italic; }
        .routing-path {
          font-size: 0.68rem;
          color: var(--mc-text-secondary);
          padding-left: 14px;
          margin-top: 3px;
          font-family: monospace;
          opacity: 0.7;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .empty {
          text-align: center;
          color: var(--mc-text-secondary);
          font-size: 0.8rem;
          padding: 16px;
          line-height: 1.6;
        }
      </style>
      <ha-card>
        <div class="card-header">
          <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
          </svg>
          ${title}
        </div>
        ${hubsHtml}
      </ha-card>`;
  }

  getCardSize() {
    return 4;
  }

  static getConfigElement() {
    return document.createElement("meshcore-card-editor");
  }

  static getStubConfig() {
    return { title: "MeshCore Network" };
  }
}

class MeshcoreCardEditor extends HTMLElement {
  setConfig(config) {
    this._config = config;
    this._render();
  }

  _render() {
    this.innerHTML = `
      <div style="padding:8px">
        <label style="display:block;margin-bottom:4px;font-size:0.85rem">Title</label>
        <input
          type="text"
          value="${this._config?.title || "MeshCore Network"}"
          style="width:100%;padding:6px 8px;border-radius:6px;border:1px solid var(--divider-color);background:var(--card-background-color);color:var(--primary-text-color)"
          id="title-input"
        />
      </div>`;
    this.querySelector("#title-input").addEventListener("change", (e) => {
      this._config = { ...this._config, title: e.target.value };
      this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: this._config } }));
    });
  }
}

customElements.define("meshcore-card", MeshcoreCard);
customElements.define("meshcore-card-editor", MeshcoreCardEditor);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "meshcore-card",
  name: "MeshCore Card",
  description: "Displays node statistics from the MeshCore integration",
  preview: true,
  documentationURL: "https://github.com/jpettitt/meshcore-card",
});
