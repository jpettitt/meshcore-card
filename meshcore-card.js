/**
 * MeshCore Card for Home Assistant
 * Displays node statistics from the meshcore integration
 */

const NODE_TYPES = { 1: "Client", 2: "Repeater", 3: "Room Server", 4: "Sensor" };

class MeshcoreCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.shadowRoot.addEventListener("click", (e) => {
      const el = e.target.closest("[data-entity]");
      if (el) this._moreInfo(el.dataset.entity);
    });
  }

  setConfig(config) {
    this._config = config;
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  _moreInfo(entityId) {
    this.dispatchEvent(new CustomEvent("hass-more-info", {
      bubbles: true, composed: true, detail: { entityId },
    }));
  }

  _state(entityId) {
    return this._hass?.states[entityId];
  }

  _val(entityId) {
    const s = this._state(entityId);
    return s ? s.state : null;
  }

  _attr(entityId, attr) {
    const s = this._state(entityId);
    return s?.attributes[attr] ?? null;
  }

  // Find entity by exact ID or by prefix (handles _nodename suffix)
  _find(prefix) {
    if (this._hass.states[prefix]) return prefix;
    for (const id of Object.keys(this._hass.states)) {
      if (id.startsWith(prefix + "_")) return id;
    }
    return null;
  }

  _discoverHubs() {
    const hubs = {};
    const pattern = /^sensor\.meshcore_([a-f0-9]+)_node_count(?:_(.+))?$/;
    for (const id of Object.keys(this._hass.states)) {
      const m = id.match(pattern);
      if (m && !hubs[m[1]]) {
        hubs[m[1]] = { pubkey: m[1], name: m[2] || m[1], nodeCountEntity: id };
      }
    }
    return Object.values(hubs);
  }

  _discoverNodes(pubkey) {
    const nodes = {};
    const pattern = new RegExp(`^sensor\\.meshcore_${pubkey}_status_(.+)$`);
    for (const id of Object.keys(this._hass.states)) {
      const m = id.match(pattern);
      if (m) nodes[m[1]] = true;
    }
    return Object.keys(nodes);
  }

  // Returns entity ID using hub-name suffix first, then prefix fallback
  _hubEntity(pubkey, hubName, metric) {
    const exact = `sensor.meshcore_${pubkey}_${metric}_${hubName}`;
    if (this._hass.states[exact]) return exact;
    return this._find(`sensor.meshcore_${pubkey}_${metric}`);
  }

  _formatUptime(seconds) {
    if (!seconds || isNaN(seconds)) return null;
    const s = Number(seconds);
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    if (d > 0) return `${d}d ${h}h`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  }

  _formatLastSeen(ts) {
    if (!ts || ts === "unknown" || ts === "unavailable") return "—";
    const n = Number(ts);
    if (isNaN(n)) return ts;
    const diff = Math.floor((Date.now() / 1000) - n);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  }

  _batteryColor(pct) {
    const v = Number(pct);
    if (isNaN(v)) return "var(--mc-text-secondary)";
    if (v >= 50) return "var(--mc-green)";
    if (v >= 20) return "var(--mc-yellow)";
    return "var(--mc-red)";
  }

  _rssiClass(rssi) {
    const v = Number(rssi);
    if (isNaN(v)) return "dim";
    if (v >= -70) return "green";
    if (v >= -90) return "yellow";
    return "red";
  }

  _batteryClass(pct) {
    const v = Number(pct);
    if (isNaN(v)) return "dim";
    if (v >= 50) return "green";
    if (v >= 20) return "yellow";
    return "red";
  }

  _progressBar(pct, color) {
    const clamped = Math.min(100, Math.max(0, Number(pct) || 0));
    return `<div class="bar-track"><div class="bar-fill" style="width:${clamped}%;background:${color}"></div></div>`;
  }

  _clickable(entityId, content, cls = "") {
    if (!entityId) return `<span class="dim">${content}</span>`;
    return `<span class="clickable ${cls}" data-entity="${entityId}">${content}</span>`;
  }

  _statVal(entityId, suffix = "", fallback = "—") {
    if (!entityId) return `<span class="dim">${fallback}</span>`;
    const v = this._val(entityId);
    const display = (v === null || v === "unknown" || v === "unavailable") ? fallback : `${v}${suffix}`;
    return `<span class="clickable stat-value" data-entity="${entityId}">${display}</span>`;
  }

  _renderHub(hub) {
    const { pubkey, name } = hub;
    const e = (metric) => this._hubEntity(pubkey, name, metric);

    const nodeCountEntity   = hub.nodeCountEntity;
    const statusEntity      = e("node_status");
    const batteryPctEntity  = e("battery_percentage");
    const batteryVEntity    = e("battery_voltage") || e("battery");
    const channelEntity     = e("channel_utilization");
    const airtimeEntity     = e("airtime");
    const uptimeEntity      = e("uptime");
    const freqEntity        = e("frequency");
    const bwEntity          = e("bandwidth");
    const sfEntity          = e("spreading_factor");
    const txPowerEntity     = e("tx_power");
    const sentEntity        = e("tx") || e("messages_sent") || e("sent");
    const receivedEntity    = e("rx") || e("messages_received") || e("received");
    const relayedEntity     = e("relayed");
    const canceledEntity    = e("canceled");
    const duplicateEntity   = e("duplicate");
    const malformedEntity   = e("malformed");

    const status    = this._val(statusEntity) || "unknown";
    const battPct   = this._val(batteryPctEntity);
    const battV     = this._val(batteryVEntity);
    const channel   = this._val(channelEntity);
    const airtime   = this._val(airtimeEntity);
    const nodeCount = this._val(nodeCountEntity);
    const uptime    = this._val(uptimeEntity);
    const freq      = this._val(freqEntity);
    const bw        = this._val(bwEntity);
    const sf        = this._val(sfEntity);
    const txPower   = this._val(txPowerEntity);

    // Try to get hardware/firmware from any entity attributes
    const hwModel  = this._attr(statusEntity, "hw_model") || this._attr(nodeCountEntity, "hw_model");
    const firmware = this._attr(statusEntity, "firmware_version") || this._attr(nodeCountEntity, "firmware_version");

    const isOnline = ["online", "connected", "1", "true"].includes(String(status).toLowerCase());
    const uptimeStr = this._formatUptime(uptime);
    const displayName = name.replace(/_/g, " ");

    const showRf = freq || bw || sf || txPower;
    const showTraffic = sentEntity || receivedEntity || relayedEntity || canceledEntity || duplicateEntity || malformedEntity;
    const battColor = this._batteryColor(battPct);

    return `
      <div class="hub-block">
        <div class="hub-header-row">
          <div class="hub-title-group">
            <span class="hub-pubkey clickable dim" data-entity="${statusEntity || nodeCountEntity}">${pubkey}</span>
            <span class="hub-sep">|</span>
            <span class="hub-name">${displayName}</span>
            <span class="status-dot ${isOnline ? "dot-online" : "dot-offline"}"></span>
          </div>
          ${uptimeStr ? `<span class="uptime clickable dim" data-entity="${uptimeEntity}">${uptimeStr}</span>` : ""}
        </div>
        ${hwModel || firmware ? `
        <div class="hw-info">${[hwModel, firmware].filter(Boolean).join(" • ")}</div>` : ""}

        ${battPct !== null ? `
        <div class="bar-row" data-entity="${batteryPctEntity}" class="clickable">
          <div class="bar-label">
            <span class="bar-icon">🔋</span>
            <span class="bar-title">Battery</span>
            ${isOnline ? '<span class="charging-icon">⚡</span>' : ""}
          </div>
          <span class="bar-value clickable" data-entity="${batteryPctEntity}" style="color:${battColor}">${battPct}%</span>
        </div>
        ${this._progressBar(battPct, battColor)}` : ""}

        ${channel !== null ? `
        <div class="bar-row">
          <div class="bar-label">
            <span class="bar-icon">◎</span>
            <span class="bar-title">Channel</span>
          </div>
          <span class="bar-value clickable" data-entity="${channelEntity}">${parseFloat(channel).toFixed(2)}%</span>
        </div>
        ${this._progressBar(channel, "var(--mc-blue)")}` : ""}

        ${airtime !== null ? `
        <div class="bar-row">
          <div class="bar-label">
            <span class="bar-icon">⏱</span>
            <span class="bar-title">Airtime</span>
          </div>
          <span class="bar-value clickable" data-entity="${airtimeEntity}">${parseFloat(airtime).toFixed(2)}%</span>
        </div>
        ${this._progressBar(airtime, "var(--mc-orange)")}` : ""}

        <div class="metrics-row">
          ${battV !== null ? `
          <div class="metric-item">
            <span class="metric-icon">⚡</span>
            <span class="metric-value clickable" data-entity="${batteryVEntity}">${parseFloat(battV).toFixed(3)}V</span>
          </div>` : ""}
          ${nodeCount !== null ? `
          <div class="metric-item">
            <span class="metric-icon">((·))</span>
            <span class="metric-value clickable" data-entity="${nodeCountEntity}">${nodeCount} Nodes</span>
          </div>` : ""}
          ${showRf ? `
          <div class="metric-item rf-inline">
            ${freq ? `<span class="rf-chip clickable" data-entity="${freqEntity}">${parseFloat(freq).toFixed(3)} MHz</span>` : ""}
            ${bw ? `<span class="rf-chip clickable" data-entity="${bwEntity}">${bw} kHz</span>` : ""}
            ${sf ? `<span class="rf-chip clickable" data-entity="${sfEntity}">SF${sf}</span>` : ""}
            ${txPower ? `<span class="rf-chip clickable" data-entity="${txPowerEntity}">${txPower} dBm</span>` : ""}
          </div>` : ""}
        </div>

        ${showTraffic ? `
        <div class="traffic-section">
          <div class="traffic-header">NETWORK TRAFFIC</div>
          <div class="traffic-grid">
            <div class="traffic-cell">
              <div class="traffic-label">Sent</div>
              ${this._statVal(sentEntity)}
            </div>
            <div class="traffic-cell">
              <div class="traffic-label">Received</div>
              ${this._statVal(receivedEntity)}
            </div>
            <div class="traffic-cell">
              <div class="traffic-label">Relayed</div>
              ${this._statVal(relayedEntity, "", "—", "blue")}
            </div>
            <div class="traffic-cell">
              <div class="traffic-label">Canceled</div>
              ${this._statVal(canceledEntity, "", "—", "red")}
            </div>
            <div class="traffic-cell">
              <div class="traffic-label">Duplicate</div>
              ${this._statVal(duplicateEntity, "", "—", "yellow")}
            </div>
            <div class="traffic-cell">
              <div class="traffic-label">Malformed</div>
              ${this._statVal(malformedEntity, "", "—", "red")}
            </div>
          </div>
        </div>` : ""}
      </div>`;
  }

  _statVal(entityId, suffix = "", fallback = "—", colorClass = "") {
    if (!entityId) return `<div class="stat-value dim">${fallback}</div>`;
    const v = this._val(entityId);
    const isBlank = v === null || v === "unknown" || v === "unavailable";
    const display = isBlank ? fallback : `${v}${suffix}`;
    const cls = isBlank ? "dim" : colorClass;
    return `<div class="stat-value ${cls} clickable" data-entity="${entityId}">${display}</div>`;
  }

  _renderNode(pubkey, nodeName) {
    const p = (m) => `sensor.meshcore_${pubkey}_${m}_${nodeName}`;
    const statusEntity  = p("status");
    const battEntity    = p("battery_percentage");
    const rssiEntity    = p("last_rssi");
    const snrEntity     = p("last_snr");
    const pathEntity    = p("path_length");
    const routeEntity   = p("routing_path");
    const advertEntity  = p("last_advert");

    const status   = this._val(statusEntity);
    const battery  = this._val(battEntity);
    const rssi     = this._val(rssiEntity);
    const snr      = this._val(snrEntity);
    const pathLen  = this._val(pathEntity);
    const route    = this._val(routeEntity);
    const lastAdv  = this._val(advertEntity);
    const nodeType = this._attr(statusEntity, "type");

    const isOnline = ["online", "connected", "1", "true"].includes(String(status).toLowerCase());
    const displayName = nodeName.replace(/_/g, " ");

    return `
      <div class="node-row ${isOnline ? "" : "node-offline"}">
        <div class="node-left">
          <span class="status-dot ${isOnline ? "dot-online" : "dot-offline"}"></span>
          <div class="node-info">
            <span class="node-name clickable" data-entity="${statusEntity}">${displayName}</span>
            ${nodeType ? `<span class="node-type">${NODE_TYPES[nodeType] || nodeType}</span>` : ""}
          </div>
        </div>
        <div class="node-right">
          ${rssi !== null ? `<span class="badge ${this._rssiClass(rssi)} clickable" data-entity="${rssiEntity}" title="RSSI">${rssi} dBm</span>` : ""}
          ${snr !== null ? `<span class="badge clickable" data-entity="${snrEntity}" title="SNR">${snr} dB</span>` : ""}
          ${battery !== null ? `<span class="badge ${this._batteryClass(battery)} clickable" data-entity="${battEntity}" title="Battery">${battery}%</span>` : ""}
          ${pathLen !== null ? `<span class="badge clickable" data-entity="${pathEntity}" title="Hops">${pathLen}↑</span>` : ""}
          ${lastAdv ? `<span class="badge dim" title="Last seen">${this._formatLastSeen(lastAdv)}</span>` : ""}
        </div>
        ${route && !["unknown","unavailable"].includes(route) ? `<div class="node-route">↝ ${route}</div>` : ""}
      </div>`;
  }

  _render() {
    if (!this._hass || !this._config) return;

    const hubs = this._discoverHubs();
    let body = "";

    if (hubs.length === 0) {
      body = `<div class="empty">No MeshCore hubs found.<br>Check that the meshcore integration is installed.</div>`;
    } else {
      for (const hub of hubs) {
        const nodes = this._discoverNodes(hub.pubkey);
        const nodesHtml = nodes.length > 0
          ? nodes.map((n) => this._renderNode(hub.pubkey, n)).join("")
          : "";
        body += this._renderHub(hub);
        if (nodesHtml) {
          body += `<div class="nodes-section">
            <div class="section-label">REMOTE NODES</div>
            ${nodesHtml}
          </div>`;
        }
      }
    }

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          --mc-green:  #30d158;
          --mc-yellow: #ffd60a;
          --mc-red:    #ff453a;
          --mc-blue:   #0a84ff;
          --mc-orange: #ff9f0a;
          --mc-purple: #bf5af2;
          --mc-bg:     var(--ha-card-background, var(--card-background-color, #1c1c1e));
          --mc-surface:var(--secondary-background-color, #2c2c2e);
          --mc-border: var(--divider-color, rgba(255,255,255,0.1));
          --mc-text:   var(--primary-text-color, #e5e5ea);
          --mc-dim:    var(--secondary-text-color, #636366);
          --mc-radius: var(--ha-card-border-radius, 12px);
          --mc-font:   var(--paper-font-body1_-_font-family, system-ui, sans-serif);
        }
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        ha-card {
          background: var(--mc-bg);
          border-radius: var(--mc-radius);
          padding: 16px;
          font-family: var(--mc-font);
          color: var(--mc-text);
          font-size: 14px;
        }

        /* ── Hub block ─────────────────────────────── */
        .hub-block {
          margin-bottom: 16px;
        }

        .hub-header-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 2px;
        }
        .hub-title-group {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 1rem;
          font-weight: 600;
        }
        .hub-pubkey {
          font-family: monospace;
          font-size: 0.8rem;
        }
        .hub-sep { color: var(--mc-dim); }
        .hub-name { font-weight: 700; }
        .hw-info {
          font-size: 0.72rem;
          color: var(--mc-dim);
          margin-bottom: 10px;
        }
        .uptime {
          font-size: 0.8rem;
          font-weight: 600;
          background: var(--mc-surface);
          padding: 3px 10px;
          border-radius: 20px;
        }

        /* ── Status dot ────────────────────────────── */
        .status-dot {
          width: 8px; height: 8px;
          border-radius: 50%;
          flex-shrink: 0;
          display: inline-block;
        }
        .dot-online  { background: var(--mc-green); box-shadow: 0 0 5px var(--mc-green); }
        .dot-offline { background: var(--mc-dim); }

        /* ── Progress bars ─────────────────────────── */
        .bar-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 3px;
          margin-top: 8px;
        }
        .bar-label {
          display: flex;
          align-items: center;
          gap: 5px;
          font-size: 0.82rem;
          color: var(--mc-text);
        }
        .bar-icon { font-size: 0.9rem; }
        .charging-icon { color: var(--mc-yellow); font-size: 0.8rem; }
        .bar-value {
          font-size: 0.82rem;
          font-weight: 600;
          min-width: 44px;
          text-align: right;
        }
        .bar-track {
          height: 5px;
          border-radius: 3px;
          background: var(--mc-surface);
          overflow: hidden;
          margin-bottom: 2px;
        }
        .bar-fill {
          height: 100%;
          border-radius: 3px;
          transition: width 0.4s ease;
        }

        /* ── Metrics row ───────────────────────────── */
        .metrics-row {
          display: flex;
          align-items: center;
          gap: 16px;
          flex-wrap: wrap;
          margin-top: 12px;
          padding: 10px 0;
          border-top: 1px solid var(--mc-border);
          border-bottom: 1px solid var(--mc-border);
        }
        .metric-item {
          display: flex;
          align-items: center;
          gap: 5px;
          font-size: 0.82rem;
        }
        .metric-icon { color: var(--mc-dim); font-size: 0.8rem; }
        .metric-value { font-weight: 700; font-size: 0.95rem; }
        .rf-inline { display: flex; gap: 5px; flex-wrap: wrap; margin-left: auto; }
        .rf-chip {
          font-size: 0.68rem;
          padding: 2px 7px;
          border-radius: 6px;
          background: var(--mc-surface);
          color: var(--mc-blue);
          font-weight: 500;
        }

        /* ── Traffic section ───────────────────────── */
        .traffic-section {
          margin-top: 10px;
          background: var(--mc-surface);
          border-radius: 10px;
          padding: 10px 14px;
        }
        .traffic-header {
          font-size: 0.65rem;
          font-weight: 700;
          letter-spacing: 0.1em;
          color: var(--mc-dim);
          margin-bottom: 8px;
        }
        .traffic-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 8px 4px;
        }
        .traffic-cell { display: flex; flex-direction: column; gap: 2px; }
        .traffic-label {
          font-size: 0.68rem;
          color: var(--mc-dim);
        }
        .stat-value {
          font-size: 1rem;
          font-weight: 700;
          line-height: 1.2;
        }

        /* ── Color classes ─────────────────────────── */
        .green  { color: var(--mc-green); }
        .yellow { color: var(--mc-yellow); }
        .red    { color: var(--mc-red); }
        .blue   { color: var(--mc-blue); }
        .dim    { color: var(--mc-dim); }

        /* ── Clickable ─────────────────────────────── */
        .clickable {
          cursor: pointer;
          transition: opacity 0.15s;
        }
        .clickable:hover { opacity: 0.7; }

        /* ── Nodes section ─────────────────────────── */
        .nodes-section { margin-top: 4px; }
        .section-label {
          font-size: 0.65rem;
          font-weight: 700;
          letter-spacing: 0.1em;
          color: var(--mc-dim);
          padding: 8px 2px 4px;
        }
        .node-row {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
          padding: 7px 6px;
          border-radius: 8px;
          margin-bottom: 2px;
          transition: background 0.15s;
        }
        .node-row:hover { background: var(--mc-surface); }
        .node-offline { opacity: 0.5; }
        .node-left {
          display: flex;
          align-items: center;
          gap: 7px;
        }
        .node-info { display: flex; align-items: center; gap: 6px; }
        .node-name { font-weight: 500; font-size: 0.875rem; text-transform: capitalize; }
        .node-type {
          font-size: 0.62rem;
          color: var(--mc-purple);
          background: rgba(191,90,242,0.12);
          padding: 1px 6px;
          border-radius: 5px;
          font-weight: 600;
        }
        .node-right {
          display: flex;
          align-items: center;
          gap: 4px;
          flex-wrap: wrap;
        }
        .badge {
          font-size: 0.7rem;
          padding: 2px 7px;
          border-radius: 5px;
          background: var(--mc-surface);
          color: var(--mc-dim);
          font-weight: 500;
        }
        .badge.green  { background: rgba(48,209,88,0.12);  color: var(--mc-green); }
        .badge.yellow { background: rgba(255,214,10,0.12); color: var(--mc-yellow); }
        .badge.red    { background: rgba(255,69,58,0.12);  color: var(--mc-red); }
        .node-route {
          width: 100%;
          font-size: 0.68rem;
          color: var(--mc-dim);
          padding-left: 15px;
          font-family: monospace;
          margin-top: 2px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .empty {
          text-align: center;
          color: var(--mc-dim);
          font-size: 0.85rem;
          padding: 24px 16px;
          line-height: 1.7;
        }

        /* ── Multi-hub divider ─────────────────────── */
        .hub-block + .hub-block {
          border-top: 1px solid var(--mc-border);
          padding-top: 16px;
        }
      </style>
      <ha-card>${body}</ha-card>`;
  }

  getCardSize() { return 5; }
  static getConfigElement() { return document.createElement("meshcore-card-editor"); }
  static getStubConfig() { return {}; }
}

class MeshcoreCardEditor extends HTMLElement {
  setConfig(config) { this._config = config; }
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
