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

  setConfig(config) { this._config = config; }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  _moreInfo(entityId) {
    this.dispatchEvent(new CustomEvent("hass-more-info", {
      bubbles: true, composed: true, detail: { entityId },
    }));
  }

  _val(entityId) {
    if (!entityId) return null;
    const s = this._hass?.states[entityId];
    return s ? s.state : null;
  }

  _attr(entityId, attr) {
    if (!entityId) return null;
    const s = this._hass?.states[entityId];
    return s?.attributes[attr] ?? null;
  }

  // Return entity ID if it exists exactly, or find first entity with this prefix
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
    const re = new RegExp(`^sensor\\.meshcore_${pubkey}_status_(.+)$`);
    for (const id of Object.keys(this._hass.states)) {
      const m = id.match(re);
      if (m) nodes[m[1]] = true;
    }
    return Object.keys(nodes);
  }

  // Find hub entity: try exact suffix first, then prefix fallback
  _hubEntity(pubkey, hubName, metric) {
    const exact = `sensor.meshcore_${pubkey}_${metric}_${hubName}`;
    if (this._hass.states[exact]) return exact;
    return this._find(`sensor.meshcore_${pubkey}_${metric}`);
  }

  _formatLastSeen(ts) {
    if (!ts || ts === "unknown" || ts === "unavailable") return null;
    const diff = Math.floor(Date.now() / 1000 - Number(ts));
    if (isNaN(diff)) return null;
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  }

  _batteryColor(pct) {
    const v = Number(pct);
    if (isNaN(v)) return "var(--mc-dim)";
    if (v >= 50) return "var(--mc-green)";
    if (v >= 20) return "var(--mc-yellow)";
    return "var(--mc-red)";
  }

  _batteryClass(pct) {
    const v = Number(pct);
    if (isNaN(v)) return "dim";
    if (v >= 50) return "green";
    if (v >= 20) return "yellow";
    return "red";
  }

  _rssiClass(rssi) {
    const v = Number(rssi);
    if (isNaN(v)) return "dim";
    if (v >= -70) return "green";
    if (v >= -90) return "yellow";
    return "red";
  }

  _progressBar(pct, color) {
    const w = Math.min(100, Math.max(0, Number(pct) || 0));
    return `<div class="bar-track"><div class="bar-fill" style="width:${w}%;background:${color}"></div></div>`;
  }

  // Render a clickable stat value (for traffic grid)
  _statVal(entityId, colorClass = "") {
    if (!entityId) return `<div class="stat-value dim">—</div>`;
    const v = this._val(entityId);
    const blank = v === null || v === "unknown" || v === "unavailable";
    return `<div class="stat-value ${blank ? "dim" : colorClass} clickable" data-entity="${entityId}">${blank ? "—" : v}</div>`;
  }

  _renderHub(hub) {
    const { pubkey, name } = hub;
    const e = (m) => this._hubEntity(pubkey, name, m);

    // Discover entities
    const statusEntity      = e("node_status");
    const nodeCountEntity   = hub.nodeCountEntity;
    const battPctEntity     = e("battery_percentage");
    const battVEntity       = e("battery_voltage");
    const freqEntity        = e("frequency");
    const bwEntity          = e("bandwidth");
    const sfEntity          = e("spreading_factor");
    const txPowerEntity     = e("tx_power");
    const latEntity         = e("latitude");
    const lonEntity         = e("longitude");
    const rateLimEntity     = e("request_rate_limiter");
    const ch1VEntity        = e("ch1_voltage");
    // Traffic (repeater nodes)
    const sentEntity        = e("tx") || e("messages_sent") || e("sent");
    const receivedEntity    = e("rx") || e("messages_received") || e("received");
    const relayedEntity     = e("relayed");
    const canceledEntity    = e("canceled");
    const duplicateEntity   = e("duplicate");
    const malformedEntity   = e("malformed");

    // Auto-discover MQTT broker entities
    const mqttEntities = Object.keys(this._hass.states)
      .filter(id => id.startsWith(`sensor.meshcore_${pubkey}_mqtt`) ||
                    id.startsWith(`binary_sensor.meshcore_${pubkey}_mqtt`))
      .sort();

    // Read values
    const status    = this._val(statusEntity) || "unknown";
    const battPct   = this._val(battPctEntity);
    const battV     = this._val(battVEntity);
    const nodeCount = this._val(nodeCountEntity);
    const freq      = this._val(freqEntity);
    const bw        = this._val(bwEntity);
    const sf        = this._val(sfEntity);
    const txPower   = this._val(txPowerEntity);
    const lat       = this._val(latEntity);
    const lon       = this._val(lonEntity);

    // Hardware info from attributes
    const hwModel  = this._attr(statusEntity, "hw_model") || this._attr(nodeCountEntity, "hw_model");
    const firmware = this._attr(statusEntity, "firmware_version") || this._attr(nodeCountEntity, "firmware_version");

    const isOnline = ["online", "connected", "1", "true"].includes(String(status).toLowerCase());
    const displayName = name.replace(/_/g, " ");
    const battColor = this._batteryColor(battPct);
    const showRf = freq || bw || sf || txPower;
    const showTraffic = sentEntity || receivedEntity || relayedEntity || canceledEntity || duplicateEntity || malformedEntity;

    return `
      <div class="hub-block">

        <div class="hub-header-row">
          <div class="hub-title-group">
            <span class="hub-pubkey dim clickable" data-entity="${statusEntity || nodeCountEntity}">${pubkey}</span>
            <span class="hub-sep">|</span>
            <span class="hub-name">${displayName}</span>
            <span class="status-dot ${isOnline ? "dot-online" : "dot-offline"}"></span>
          </div>
          ${nodeCount !== null ? `
          <span class="node-count-badge clickable" data-entity="${nodeCountEntity}">
            &#9632;&#9642;&#9632; ${nodeCount} Nodes
          </span>` : ""}
        </div>

        ${hwModel || firmware ? `
        <div class="hw-info">${[hwModel, firmware].filter(Boolean).join(" • ")}</div>` : ""}

        ${battPct !== null ? `
        <div class="bar-row">
          <div class="bar-label"><span class="bar-icon">🔋</span> Battery</div>
          <span class="bar-value clickable" data-entity="${battPctEntity}" style="color:${battColor}">${battPct}%</span>
        </div>
        ${this._progressBar(battPct, battColor)}` : ""}

        <div class="metrics-row">
          ${battV !== null ? `
          <div class="metric-chip clickable" data-entity="${battVEntity}">
            <span class="mc-label">⚡</span>${parseFloat(battV).toFixed(3)}V
          </div>` : ""}
          ${ch1VEntity ? `
          <div class="metric-chip clickable" data-entity="${ch1VEntity}">
            <span class="mc-label">Ch1</span>${this._val(ch1VEntity) || "—"}V
          </div>` : ""}
          ${rateLimEntity ? `
          <div class="metric-chip clickable" data-entity="${rateLimEntity}">
            <span class="mc-label">Rate</span>${this._val(rateLimEntity) || "—"} tok
          </div>` : ""}
          ${lat !== null && lon !== null ? `
          <div class="metric-chip clickable" data-entity="${latEntity}">
            <span class="mc-label">📍</span>${parseFloat(lat).toFixed(4)}, ${parseFloat(lon).toFixed(4)}
          </div>` : ""}
        </div>

        ${showRf ? `
        <div class="rf-row">
          ${freq ? `<span class="rf-chip clickable" data-entity="${freqEntity}">${parseFloat(freq).toFixed(3)} MHz</span>` : ""}
          ${bw ? `<span class="rf-chip clickable" data-entity="${bwEntity}">${bw} kHz</span>` : ""}
          ${sf ? `<span class="rf-chip clickable" data-entity="${sfEntity}">SF${sf}</span>` : ""}
          ${txPower ? `<span class="rf-chip clickable" data-entity="${txPowerEntity}">${txPower} dBm</span>` : ""}
        </div>` : ""}

        ${mqttEntities.length > 0 ? `
        <div class="mqtt-row">
          ${mqttEntities.map(id => {
            const v = this._val(id);
            const label = (this._attr(id, "friendly_name") || id)
              .replace(/meshcore\s+\w+\s+/i, "").replace(/_/g, " ");
            const ok = ["connected", "online", "true", "1"].includes(String(v).toLowerCase());
            return `<span class="mqtt-pill ${ok ? "mqtt-ok" : "mqtt-err"} clickable" data-entity="${id}">${label}</span>`;
          }).join("")}
        </div>` : ""}

        ${showTraffic ? `
        <div class="traffic-section">
          <div class="traffic-header">NETWORK TRAFFIC</div>
          <div class="traffic-grid">
            <div class="traffic-cell"><div class="traffic-label">Sent</div>${this._statVal(sentEntity)}</div>
            <div class="traffic-cell"><div class="traffic-label">Received</div>${this._statVal(receivedEntity)}</div>
            <div class="traffic-cell"><div class="traffic-label">Relayed</div>${this._statVal(relayedEntity, "blue")}</div>
            <div class="traffic-cell"><div class="traffic-label">Canceled</div>${this._statVal(canceledEntity, "red")}</div>
            <div class="traffic-cell"><div class="traffic-label">Duplicate</div>${this._statVal(duplicateEntity, "yellow")}</div>
            <div class="traffic-cell"><div class="traffic-label">Malformed</div>${this._statVal(malformedEntity, "red")}</div>
          </div>
        </div>` : ""}

      </div>`;
  }

  _renderNode(pubkey, nodeName) {
    const p = (m) => `sensor.meshcore_${pubkey}_${m}_${nodeName}`;

    const statusEntity = p("status");
    const battEntity   = p("battery_percentage");
    const rssiEntity   = p("last_rssi");
    const snrEntity    = p("last_snr");
    const pathEntity   = p("path_length");
    const routeEntity  = p("routing_path");
    const advertEntity = p("last_advert");

    const status  = this._val(statusEntity);
    const battery = this._val(battEntity);
    const rssi    = this._val(rssiEntity);
    const snr     = this._val(snrEntity);
    const pathLen = this._val(pathEntity);
    const route   = this._val(routeEntity);
    const lastAdv = this._val(advertEntity);
    const nodeType = this._attr(statusEntity, "type");

    const isOnline = ["online", "connected", "1", "true"].includes(String(status).toLowerCase());
    const lastSeen = this._formatLastSeen(lastAdv);

    return `
      <div class="node-row ${isOnline ? "" : "node-offline"}">
        <div class="node-left">
          <span class="status-dot ${isOnline ? "dot-online" : "dot-offline"}"></span>
          <span class="node-name clickable" data-entity="${statusEntity}">${nodeName.replace(/_/g, " ")}</span>
          ${nodeType ? `<span class="node-type">${NODE_TYPES[nodeType] || nodeType}</span>` : ""}
        </div>
        <div class="node-right">
          ${rssi !== null ? `<span class="badge ${this._rssiClass(rssi)} clickable" data-entity="${rssiEntity}">${rssi} dBm</span>` : ""}
          ${snr !== null ? `<span class="badge clickable" data-entity="${snrEntity}">${snr} dB</span>` : ""}
          ${battery !== null ? `<span class="badge ${this._batteryClass(battery)} clickable" data-entity="${battEntity}">${battery}%</span>` : ""}
          ${pathLen !== null ? `<span class="badge clickable" data-entity="${pathEntity}">${pathLen}↑</span>` : ""}
          ${lastSeen ? `<span class="badge dim">${lastSeen}</span>` : ""}
        </div>
        ${route && !["unknown", "unavailable"].includes(route) ? `
        <div class="node-route">↝ ${route}</div>` : ""}
      </div>`;
  }

  _render() {
    if (!this._hass || !this._config) return;

    const hubs = this._discoverHubs();
    let body = hubs.length === 0
      ? `<div class="empty">No MeshCore hubs found.<br>Check the meshcore integration is installed.</div>`
      : hubs.map(hub => {
          const nodes = this._discoverNodes(hub.pubkey);
          const nodesHtml = nodes.length
            ? `<div class="nodes-section">
                <div class="section-label">REMOTE NODES</div>
                ${nodes.map(n => this._renderNode(hub.pubkey, n)).join("")}
               </div>`
            : "";
          return this._renderHub(hub) + nodesHtml;
        }).join("");

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
        }
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        ha-card {
          background: var(--mc-bg);
          border-radius: var(--ha-card-border-radius, 12px);
          padding: 16px;
          font-family: var(--paper-font-body1_-_font-family, system-ui, sans-serif);
          color: var(--mc-text);
          font-size: 14px;
        }

        /* ── Hub block ─────────────────────── */
        .hub-block { margin-bottom: 8px; }
        .hub-block + .hub-block { border-top: 1px solid var(--mc-border); padding-top: 14px; margin-top: 6px; }

        .hub-header-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 2px;
        }
        .hub-title-group { display: flex; align-items: center; gap: 6px; font-size: 1rem; font-weight: 600; }
        .hub-sep { color: var(--mc-dim); }
        .hub-name { font-weight: 700; text-transform: capitalize; }
        .hub-pubkey { font-family: monospace; font-size: 0.75rem; }
        .hw-info { font-size: 0.72rem; color: var(--mc-dim); margin-bottom: 10px; }

        .node-count-badge {
          font-size: 0.75rem;
          font-weight: 600;
          background: var(--mc-surface);
          padding: 3px 10px;
          border-radius: 20px;
          color: var(--mc-text);
        }

        /* ── Status dot ─────────────────────── */
        .status-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; display: inline-block; }
        .dot-online  { background: var(--mc-green); box-shadow: 0 0 5px var(--mc-green); }
        .dot-offline { background: var(--mc-dim); }

        /* ── Battery bar ─────────────────────── */
        .bar-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin: 10px 0 3px;
          font-size: 0.82rem;
        }
        .bar-label { display: flex; align-items: center; gap: 5px; }
        .bar-icon { font-size: 0.9rem; }
        .bar-value { font-weight: 600; }
        .bar-track { height: 5px; border-radius: 3px; background: var(--mc-surface); overflow: hidden; margin-bottom: 8px; }
        .bar-fill { height: 100%; border-radius: 3px; transition: width 0.4s; }

        /* ── Metrics chips ───────────────────── */
        .metrics-row { display: flex; flex-wrap: wrap; gap: 6px; margin: 6px 0; }
        .metric-chip {
          display: flex;
          align-items: center;
          gap: 5px;
          font-size: 0.8rem;
          font-weight: 600;
          background: var(--mc-surface);
          padding: 4px 10px;
          border-radius: 8px;
        }
        .mc-label { color: var(--mc-dim); font-weight: 400; font-size: 0.72rem; }

        /* ── RF row ──────────────────────────── */
        .rf-row { display: flex; flex-wrap: wrap; gap: 5px; margin: 4px 0 8px; }
        .rf-chip {
          font-size: 0.7rem;
          padding: 2px 8px;
          border-radius: 6px;
          background: rgba(10,132,255,0.1);
          color: var(--mc-blue);
          font-weight: 500;
        }

        /* ── MQTT status ─────────────────────── */
        .mqtt-row { display: flex; flex-wrap: wrap; gap: 5px; margin: 4px 0 8px; }
        .mqtt-pill {
          font-size: 0.7rem;
          padding: 3px 10px;
          border-radius: 20px;
          font-weight: 500;
          text-transform: capitalize;
        }
        .mqtt-ok  { background: rgba(48,209,88,0.12); color: var(--mc-green); }
        .mqtt-err { background: rgba(255,69,58,0.12); color: var(--mc-red); }

        /* ── Traffic section ─────────────────── */
        .traffic-section {
          background: var(--mc-surface);
          border-radius: 10px;
          padding: 10px 14px;
          margin-top: 6px;
        }
        .traffic-header { font-size: 0.62rem; font-weight: 700; letter-spacing: 0.1em; color: var(--mc-dim); margin-bottom: 8px; }
        .traffic-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px 4px; }
        .traffic-cell { display: flex; flex-direction: column; gap: 2px; }
        .traffic-label { font-size: 0.68rem; color: var(--mc-dim); }
        .stat-value { font-size: 1rem; font-weight: 700; line-height: 1.2; }

        /* ── Color helpers ───────────────────── */
        .green  { color: var(--mc-green); }
        .yellow { color: var(--mc-yellow); }
        .red    { color: var(--mc-red); }
        .blue   { color: var(--mc-blue); }
        .dim    { color: var(--mc-dim); }

        /* ── Clickable ───────────────────────── */
        .clickable { cursor: pointer; transition: opacity 0.15s; }
        .clickable:hover { opacity: 0.65; }

        /* ── Remote nodes ────────────────────── */
        .nodes-section { margin-top: 6px; }
        .section-label { font-size: 0.62rem; font-weight: 700; letter-spacing: 0.1em; color: var(--mc-dim); padding: 6px 2px 4px; }
        .node-row {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
          padding: 6px 6px;
          border-radius: 8px;
          margin-bottom: 2px;
          transition: background 0.15s;
        }
        .node-row:hover { background: var(--mc-surface); }
        .node-offline { opacity: 0.5; }
        .node-left { display: flex; align-items: center; gap: 7px; }
        .node-name { font-weight: 500; font-size: 0.875rem; text-transform: capitalize; }
        .node-type {
          font-size: 0.62rem; color: var(--mc-purple);
          background: rgba(191,90,242,0.12);
          padding: 1px 6px; border-radius: 5px; font-weight: 600;
        }
        .node-right { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
        .badge {
          font-size: 0.7rem; padding: 2px 7px; border-radius: 5px;
          background: var(--mc-surface); color: var(--mc-dim); font-weight: 500;
        }
        .badge.green  { background: rgba(48,209,88,0.12);  color: var(--mc-green); }
        .badge.yellow { background: rgba(255,214,10,0.12); color: var(--mc-yellow); }
        .badge.red    { background: rgba(255,69,58,0.12);  color: var(--mc-red); }
        .node-route {
          width: 100%; font-size: 0.68rem; color: var(--mc-dim);
          padding-left: 15px; font-family: monospace;
          margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }

        .empty {
          text-align: center; color: var(--mc-dim);
          font-size: 0.85rem; padding: 24px 16px; line-height: 1.7;
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

// Guard against re-registration (prevents "already used" errors)
if (!customElements.get("meshcore-card")) {
  customElements.define("meshcore-card", MeshcoreCard);
}
if (!customElements.get("meshcore-card-editor")) {
  customElements.define("meshcore-card-editor", MeshcoreCardEditor);
}

window.customCards = window.customCards || [];
if (!window.customCards.find(c => c.type === "meshcore-card")) {
  window.customCards.push({
    type: "meshcore-card",
    name: "MeshCore Card",
    description: "Displays node statistics from the MeshCore integration",
    preview: true,
    documentationURL: "https://github.com/jpettitt/meshcore-card",
  });
}
