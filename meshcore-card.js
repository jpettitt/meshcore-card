/**
 * MeshCore Card for Home Assistant
 * Displays hub and node statistics from the meshcore integration
 */

const NODE_TYPES = { 1: "Client", 2: "Repeater", 3: "Room Server", 4: "Sensor" };

// ─── Helpers ────────────────────────────────────────────────────────────────

function isOnlineState(v) {
  return ["online", "connected", "1", "true"].includes(String(v).toLowerCase());
}

function formatLastSeen(ts) {
  if (!ts || ts === "unknown" || ts === "unavailable") return null;
  const diff = Math.floor(Date.now() / 1000 - Number(ts));
  if (isNaN(diff) || diff < 0) return null;
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function batteryColor(pct) {
  const v = Number(pct);
  if (isNaN(v)) return "var(--mc-dim)";
  if (v >= 50) return "var(--mc-green)";
  if (v >= 20) return "var(--mc-yellow)";
  return "var(--mc-red)";
}

function batteryClass(pct) {
  const v = Number(pct);
  if (isNaN(v)) return "dim";
  if (v >= 50) return "green";
  if (v >= 20) return "yellow";
  return "red";
}

function rssiClass(rssi) {
  const v = Number(rssi);
  if (isNaN(v)) return "dim";
  if (v >= -70) return "green";
  if (v >= -90) return "yellow";
  return "red";
}

// ─── Card ───────────────────────────────────────────────────────────────────

class MeshcoreCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.shadowRoot.addEventListener("click", (e) => {
      const el = e.target.closest("[data-entity]");
      if (el) {
        const event = new Event("hass-more-info", { bubbles: true, composed: true });
        event.detail = { entityId: el.dataset.entity };
        this.dispatchEvent(event);
      }
    });
  }

  setConfig(config) {
    this._config = config;
    this._fp = null; // force re-render on config change
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    const fp = Object.entries(hass.states)
      .filter(([id]) => id.includes("meshcore"))
      .map(([id, s]) => `${id}=${s.state}@${s.last_changed}`)
      .join("|");
    if (fp !== this._fp) {
      this._fp = fp;
      this._render();
    }
  }

  // ── Entity accessors ─────────────────────────────────────────────────────

  _val(id) {
    if (!id) return null;
    const s = this._hass?.states[id];
    return s ? s.state : null;
  }

  _attr(id, attr) {
    if (!id) return null;
    return this._hass?.states[id]?.attributes[attr] ?? null;
  }

  _exists(id) {
    return id && !!this._hass?.states[id];
  }

  // Find entity by exact id or by prefix (handles optional _name suffix)
  _find(prefix) {
    if (this._hass.states[prefix]) return prefix;
    for (const id of Object.keys(this._hass.states)) {
      if (id.startsWith(prefix + "_")) return id;
    }
    return null;
  }

  // Find an entity belonging to a specific device that contains the metric name
  _findEntityByDevice(deviceId, metric) {
    if (!deviceId || !this._hass.entities) return null;
    for (const [entityId, info] of Object.entries(this._hass.entities)) {
      if (info.device_id === deviceId && entityId.includes(`_${metric}`)) return entityId;
    }
    return null;
  }

  // ── Discovery ────────────────────────────────────────────────────────────

  _discoverHubs() {
    const hubs = {};
    const re = /^sensor\.meshcore_([a-f0-9]+)_node_count(?:_(.+))?$/;
    for (const id of Object.keys(this._hass.states)) {
      const m = id.match(re);
      if (m && !hubs[m[1]]) {
        hubs[m[1]] = { pubkey: m[1], name: m[2] || m[1], nodeCountEntity: id };
      }
    }
    return Object.values(hubs);
  }

  _discoverNodes(pubkey) {
    // Use device registry (HA 2022.4+)
    if (this._hass.entities && this._hass.devices) {
      return this._discoverNodesFromDevices(pubkey);
    }
    return [];
  }

  _discoverNodesFromDevices(pubkey) {
    // Find the hub's config_entry_id and device_id via its node_count entity
    let hubConfigEntryId = null;
    let hubDeviceId = null;
    for (const [entityId, info] of Object.entries(this._hass.entities)) {
      if (entityId.includes(`meshcore_${pubkey}`) && /node_count/.test(entityId)) {
        hubConfigEntryId = info.config_entry_id;
        hubDeviceId = info.device_id;
        break;
      }
    }
    if (!hubConfigEntryId) return [];

    // Find all devices that share this config entry (same hub), excluding the hub device itself
    const nodes = [];
    for (const [deviceId, device] of Object.entries(this._hass.devices)) {
      if (deviceId === hubDeviceId) continue;
      if (!device.config_entries?.includes(hubConfigEntryId)) continue;

      // Get node type from entity attributes
      let type = 0;
      for (const [entityId, info] of Object.entries(this._hass.entities)) {
        if (info.device_id !== deviceId) continue;
        const attrs = this._hass.states[entityId]?.attributes;
        if (attrs?.type) { type = Number(attrs.type); break; }
        if (attrs?.node_type) { type = Number(attrs.node_type); break; }
      }

      nodes.push({
        name: device.name_by_user || device.name || deviceId,
        type,
        deviceId,
      });
    }
    return nodes;
  }

  _hubEntity(pubkey, hubName, metric) {
    const exact = `sensor.meshcore_${pubkey}_${metric}_${hubName}`;
    if (this._hass.states[exact]) return exact;
    return this._find(`sensor.meshcore_${pubkey}_${metric}`);
  }

  // ── Rendering helpers ────────────────────────────────────────────────────

  _progressBar(pct, color) {
    const w = Math.min(100, Math.max(0, Number(pct) || 0));
    return `<div class="bar-track"><div class="bar-fill" style="width:${w}%;background:${color}"></div></div>`;
  }

  _chip(id, label, value, cls = "") {
    if (!id || value === null) return "";
    const blank = value === "unknown" || value === "unavailable";
    return `<span class="chip ${cls} clickable" data-entity="${id}">${label ? `<span class="chip-label">${label}</span>` : ""}${blank ? "—" : value}</span>`;
  }

  _badge(id, text, cls = "") {
    if (!id) return `<span class="badge dim">${text}</span>`;
    return `<span class="badge ${cls} clickable" data-entity="${id}">${text}</span>`;
  }

  // ── Hub rendering ────────────────────────────────────────────────────────

  _renderHub(hub) {
    const { pubkey, name } = hub;
    const e = (m) => this._hubEntity(pubkey, name, m);

    const statusId    = e("node_status");
    const countId     = hub.nodeCountEntity;
    const battPctId   = e("battery_percentage");
    const battVId     = e("battery_voltage");
    const freqId      = e("frequency");
    const bwId        = e("bandwidth");
    const sfId        = e("spreading_factor");
    const txPowId     = e("tx_power");
    const latId       = e("latitude");
    const lonId       = e("longitude");
    const rateLimId   = e("request_rate_limiter");
    const ch1VId      = e("ch1_voltage");

    const mqttIds = Object.keys(this._hass.states)
      .filter(id => /meshcore_[a-f0-9]+_mqtt/.test(id) && id.includes(pubkey))
      .sort();

    const status    = this._val(statusId) || "unknown";
    const battPct   = this._val(battPctId);
    const battV     = this._val(battVId);
    const nodeCount = this._val(countId);
    const freq      = this._val(freqId);
    const bw        = this._val(bwId);
    const sf        = this._val(sfId);
    const txPow     = this._val(txPowId);
    const lat       = this._val(latId);
    const lon       = this._val(lonId);

    const hwModel  = this._attr(statusId, "hw_model") || this._attr(countId, "hw_model");
    const firmware = this._attr(statusId, "firmware_version") || this._attr(countId, "firmware_version");

    const online   = isOnlineState(status);
    const battCol  = batteryColor(battPct);
    const showRf   = freq || bw || sf || txPow;

    return `
      <div class="hub-block">
        <div class="hub-header-row">
          <div class="hub-title-group">
            <span class="hub-pubkey dim clickable" data-entity="${statusId || countId}">${pubkey}</span>
            <span class="hub-sep">|</span>
            <span class="hub-name">${name.replace(/_/g, " ")}</span>
            <span class="status-dot ${online ? "dot-online" : "dot-offline"}"></span>
          </div>
          ${nodeCount !== null ? `<span class="count-badge clickable" data-entity="${countId}">◈ ${nodeCount} Nodes</span>` : ""}
        </div>

        ${hwModel || firmware ? `<div class="hw-info">${[hwModel, firmware].filter(Boolean).join(" • ")}</div>` : ""}

        ${battPct !== null ? `
          <div class="bar-row">
            <span class="bar-label">🔋 Battery</span>
            <span class="bar-val clickable" data-entity="${battPctId}" style="color:${battCol}">${battPct}%</span>
          </div>
          ${this._progressBar(battPct, battCol)}` : ""}

        <div class="chip-row">
          ${battV !== null ? this._chip(battVId, "⚡", parseFloat(battV).toFixed(3) + "V") : ""}
          ${this._exists(ch1VId) ? this._chip(ch1VId, "Ch1 ", (this._val(ch1VId) || "—") + "V") : ""}
          ${this._exists(rateLimId) ? this._chip(rateLimId, "Rate ", (this._val(rateLimId) || "—") + " tok") : ""}
          ${lat !== null && lon !== null ? this._chip(latId, "📍 ", `${parseFloat(lat).toFixed(4)}, ${parseFloat(lon).toFixed(4)}`) : ""}
        </div>

        ${showRf ? `
          <div class="rf-row">
            ${freq ? `<span class="rf-chip clickable" data-entity="${freqId}">${parseFloat(freq).toFixed(3)} MHz</span>` : ""}
            ${bw   ? `<span class="rf-chip clickable" data-entity="${bwId}">${bw} kHz</span>` : ""}
            ${sf   ? `<span class="rf-chip clickable" data-entity="${sfId}">SF${sf}</span>` : ""}
            ${txPow ? `<span class="rf-chip clickable" data-entity="${txPowId}">${txPow} dBm</span>` : ""}
          </div>` : ""}

        ${mqttIds.length ? `
          <div class="mqtt-row">
            ${mqttIds.map(id => {
              const v   = this._val(id);
              const lbl = (this._attr(id, "friendly_name") || id).replace(/meshcore\s+\w+\s*/i, "").replace(/_/g, " ").trim();
              const ok  = isOnlineState(v);
              return `<span class="mqtt-pill ${ok ? "ok" : "err"} clickable" data-entity="${id}">${lbl}</span>`;
            }).join("")}
          </div>` : ""}
      </div>`;
  }

  // ── Node rendering ───────────────────────────────────────────────────────

  _renderNode(pubkey, node) {
    const { name, type, deviceId } = node;
    const p = (m) => deviceId
      ? this._findEntityByDevice(deviceId, m)
      : `sensor.meshcore_${pubkey}_${m}_${name}`;

    // Common entities (all types)
    const statusId  = p("status");
    const rssiId    = p("last_rssi");
    const snrId     = p("last_snr");
    const pathId    = p("path_length");
    const routeId   = p("routing_path");
    const advertId  = p("last_advert");
    const battPctId = p("battery_percentage");
    const battVId   = p("battery_voltage");
    const latId     = p("latitude");
    const lonId     = p("longitude");

    // Repeater / Room Server extras (type 2 & 3)
    const sentId     = [p("tx"), p("messages_sent"), p("sent")].find(id => this._exists(id)) || p("tx");
    const receivedId = [p("rx"), p("messages_received"), p("received")].find(id => this._exists(id)) || p("rx");
    const relayedId  = p("relayed");
    const canceledId = p("canceled");
    const dupId      = p("duplicate");
    const airtimeId  = p("airtime");
    const channelId  = p("channel_utilization");
    const noiseId    = p("noise_floor");
    const queueId    = p("queue_length");

    // Sensor extras (type 4)
    const tempId     = p("temperature");
    const humidId    = p("humidity");
    const illumId    = p("illuminance");
    const pressId    = p("pressure");

    const status  = this._val(statusId);
    const rssi    = this._val(rssiId);
    const snr     = this._val(snrId);
    const pathLen = this._val(pathId);
    const route   = this._val(routeId);
    const lastAdv = this._val(advertId);
    const battPct = this._val(battPctId);
    const battV   = this._val(battVId);
    const lat     = this._val(latId);
    const lon     = this._val(lonId);

    const online   = isOnlineState(status);
    const lastSeen = formatLastSeen(lastAdv);
    const typeLabel = NODE_TYPES[type] || (type ? `Type ${type}` : "");

    const isRepeater   = type === 2 || type === 3;
    const isSensor     = type === 4;

    // Repeater traffic — only show entities that exist
    const trafficCells = [
      { label: "Sent",      id: sentId,     cls: "" },
      { label: "Received",  id: receivedId, cls: "" },
      { label: "Relayed",   id: relayedId,  cls: "blue" },
      { label: "Canceled",  id: canceledId, cls: "red" },
      { label: "Duplicate", id: dupId,      cls: "yellow" },
    ].filter(c => this._exists(c.id));

    const airtime = this._val(airtimeId);
    const channel = this._val(channelId);
    const noise   = this._val(noiseId);
    const queue   = this._val(queueId);

    // Sensor telemetry
    const telemetryCells = [
      { label: "Temp",     id: tempId,  unit: "°C" },
      { label: "Humidity", id: humidId, unit: "%" },
      { label: "Lux",      id: illumId, unit: " lx" },
      { label: "Pressure", id: pressId, unit: " hPa" },
    ].filter(c => this._exists(c.id));

    return `
      <div class="node-block ${online ? "" : "node-offline"}">

        <div class="node-header">
          <div class="node-left">
            <span class="status-dot ${online ? "dot-online" : "dot-offline"}"></span>
            <span class="node-name clickable" data-entity="${statusId}">${name.replace(/_/g, " ")}</span>
            ${typeLabel ? `<span class="type-badge">${typeLabel}</span>` : ""}
          </div>
          <div class="node-right">
            ${rssi !== null ? `<span class="badge ${rssiClass(rssi)} clickable" data-entity="${rssiId}">${rssi} dBm</span>` : ""}
            ${snr  !== null ? `<span class="badge clickable" data-entity="${snrId}">${snr} dB</span>` : ""}
            ${battPct !== null ? `<span class="badge ${batteryClass(battPct)} clickable" data-entity="${battPctId}">${battPct}%</span>` : ""}
            ${pathLen !== null ? `<span class="badge clickable" data-entity="${pathId}">${pathLen}↑</span>` : ""}
            ${lastSeen ? `<span class="badge dim">${lastSeen}</span>` : ""}
          </div>
        </div>

        ${route && !["unknown","unavailable"].includes(route) ? `
          <div class="node-route">↝ ${route}</div>` : ""}

        ${battV !== null || (lat !== null && lon !== null) ? `
          <div class="node-chip-row">
            ${battV !== null ? this._chip(battVId, "⚡ ", parseFloat(battV).toFixed(3) + "V") : ""}
            ${lat !== null && lon !== null ? this._chip(latId, "📍 ", `${parseFloat(lat).toFixed(4)}, ${parseFloat(lon).toFixed(4)}`) : ""}
          </div>` : ""}

        ${isRepeater && (airtime !== null || channel !== null || noise !== null || queue !== null) ? `
          <div class="node-chip-row">
            ${airtime  !== null ? this._chip(airtimeId, "Airtime ", parseFloat(airtime).toFixed(2) + "%") : ""}
            ${channel  !== null ? this._chip(channelId, "Channel ", parseFloat(channel).toFixed(2) + "%") : ""}
            ${noise    !== null ? this._chip(noiseId,   "Noise ",   noise + " dBm") : ""}
            ${queue    !== null ? this._chip(queueId,   "Queue ",   queue) : ""}
          </div>` : ""}

        ${isRepeater && trafficCells.length ? `
          <div class="node-traffic">
            ${trafficCells.map(c => {
              const v = this._val(c.id);
              const blank = v === null || v === "unknown" || v === "unavailable";
              return `<div class="tc"><div class="tc-label">${c.label}</div>
                <div class="tc-val ${blank ? "dim" : c.cls} clickable" data-entity="${c.id}">${blank ? "—" : v}</div></div>`;
            }).join("")}
          </div>` : ""}

        ${isSensor && telemetryCells.length ? `
          <div class="node-chip-row">
            ${telemetryCells.map(c => {
              const v = this._val(c.id);
              return this._chip(c.id, c.label + " ", v !== null ? v + c.unit : "—");
            }).join("")}
          </div>` : ""}

      </div>`;
  }

  // ── Main render ──────────────────────────────────────────────────────────

  _render() {
    if (!this._hass || !this._config) return;

    const cfg       = this._config;
    const hubsCfg   = cfg.hubs  || {};
    const nodesCfg  = cfg.nodes || {};

    let hubs = this._discoverHubs()
      .filter(h => hubsCfg[h.pubkey] !== false);

    if (!hubs.length) {
      this._setBody(`<div class="empty">No MeshCore hubs found (or all disabled).<br>Check the meshcore integration is installed.</div>`);
      return;
    }

    const body = hubs.map(hub => {
      const nodes = this._discoverNodes(hub.pubkey)
        .filter(n => nodesCfg[n.name] !== false);

      const nodesHtml = nodes.length
        ? `<div class="nodes-section">
            <div class="section-label">REMOTE NODES</div>
            ${nodes.map(n => this._renderNode(hub.pubkey, n)).join("")}
           </div>`
        : "";
      return this._renderHub(hub) + nodesHtml;
    }).join("");

    this._setBody(body);
  }

  _setBody(body) {
    this.shadowRoot.innerHTML = `<style>${STYLES}</style><ha-card>${body}</ha-card>`;
  }

  getCardSize() { return 5; }
  static getConfigElement() { return document.createElement("meshcore-card-editor"); }
  static getStubConfig() { return {}; }
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const STYLES = `
  :host {
    --mc-green:  #30d158; --mc-yellow: #ffd60a; --mc-red: #ff453a;
    --mc-blue:   #0a84ff; --mc-purple: #bf5af2;
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
    color: var(--mc-text); font-size: 14px;
  }

  /* Hub */
  .hub-block { margin-bottom: 4px; }
  .hub-block + .hub-block { border-top: 1px solid var(--mc-border); padding-top: 14px; margin-top: 10px; }
  .hub-header-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 2px; }
  .hub-title-group { display: flex; align-items: center; gap: 6px; font-size: 1rem; font-weight: 600; }
  .hub-sep { color: var(--mc-dim); }
  .hub-name { font-weight: 700; text-transform: capitalize; }
  .hub-pubkey { font-family: monospace; font-size: 0.75rem; }
  .hw-info { font-size: 0.72rem; color: var(--mc-dim); margin-bottom: 8px; }
  .count-badge { font-size: 0.75rem; font-weight: 600; background: var(--mc-surface); padding: 3px 10px; border-radius: 20px; }

  /* Status dots */
  .status-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; display: inline-block; }
  .dot-online  { background: var(--mc-green); box-shadow: 0 0 5px var(--mc-green); }
  .dot-offline { background: var(--mc-dim); }

  /* Battery bar */
  .bar-row { display: flex; align-items: center; justify-content: space-between; margin: 10px 0 3px; font-size: 0.82rem; }
  .bar-label { display: flex; align-items: center; gap: 5px; }
  .bar-val { font-weight: 600; }
  .bar-track { height: 5px; border-radius: 3px; background: var(--mc-surface); overflow: hidden; margin-bottom: 8px; }
  .bar-fill { height: 100%; border-radius: 3px; transition: width 0.4s; }

  /* Chips */
  .chip-row, .node-chip-row { display: flex; flex-wrap: wrap; gap: 5px; margin: 5px 0; }
  .chip {
    display: inline-flex; align-items: center; gap: 3px;
    font-size: 0.78rem; font-weight: 600;
    background: var(--mc-surface); padding: 4px 10px; border-radius: 8px;
  }
  .chip-label { color: var(--mc-dim); font-weight: 400; font-size: 0.7rem; }

  /* RF chips */
  .rf-row { display: flex; flex-wrap: wrap; gap: 5px; margin: 4px 0 6px; }
  .rf-chip { font-size: 0.7rem; padding: 2px 8px; border-radius: 6px; background: rgba(10,132,255,0.1); color: var(--mc-blue); font-weight: 500; }

  /* MQTT pills */
  .mqtt-row { display: flex; flex-wrap: wrap; gap: 5px; margin: 4px 0 6px; }
  .mqtt-pill { font-size: 0.7rem; padding: 3px 10px; border-radius: 20px; font-weight: 500; text-transform: capitalize; }
  .mqtt-pill.ok  { background: rgba(48,209,88,0.12); color: var(--mc-green); }
  .mqtt-pill.err { background: rgba(255,69,58,0.12); color: var(--mc-red); }

  /* Color helpers */
  .green  { color: var(--mc-green); } .yellow { color: var(--mc-yellow); }
  .red    { color: var(--mc-red); }   .blue   { color: var(--mc-blue); }
  .dim    { color: var(--mc-dim); }

  /* Clickable */
  .clickable { cursor: pointer; transition: opacity 0.15s; }
  .clickable:hover { opacity: 0.65; }

  /* Nodes section */
  .nodes-section { margin-top: 8px; }
  .section-label { font-size: 0.62rem; font-weight: 700; letter-spacing: 0.1em; color: var(--mc-dim); padding: 6px 2px 4px; }

  .node-block { padding: 8px 8px 6px; border-radius: 10px; margin-bottom: 4px; transition: background 0.15s; }
  .node-block:hover { background: var(--mc-surface); }
  .node-offline { opacity: 0.5; }

  .node-header { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 4px; }
  .node-left { display: flex; align-items: center; gap: 6px; }
  .node-right { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
  .node-name { font-weight: 600; font-size: 0.875rem; text-transform: capitalize; }
  .type-badge { font-size: 0.62rem; color: var(--mc-purple); background: rgba(191,90,242,0.12); padding: 1px 6px; border-radius: 5px; font-weight: 600; }

  .badge { font-size: 0.7rem; padding: 2px 7px; border-radius: 5px; background: var(--mc-surface); color: var(--mc-dim); font-weight: 500; }
  .badge.green  { background: rgba(48,209,88,0.12);  color: var(--mc-green); }
  .badge.yellow { background: rgba(255,214,10,0.12); color: var(--mc-yellow); }
  .badge.red    { background: rgba(255,69,58,0.12);  color: var(--mc-red); }

  .node-route { font-size: 0.68rem; color: var(--mc-dim); padding-left: 14px; font-family: monospace; margin: 2px 0 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  /* Node traffic grid */
  .node-traffic { display: grid; grid-template-columns: repeat(auto-fill, minmax(70px, 1fr)); gap: 6px 4px; margin: 6px 0 2px; background: rgba(0,0,0,0.15); border-radius: 8px; padding: 8px 10px; }
  .tc { display: flex; flex-direction: column; gap: 2px; }
  .tc-label { font-size: 0.65rem; color: var(--mc-dim); }
  .tc-val { font-size: 0.95rem; font-weight: 700; }

  .empty { text-align: center; color: var(--mc-dim); font-size: 0.85rem; padding: 24px 16px; line-height: 1.7; }
`;

// ─── Editor ──────────────────────────────────────────────────────────────────

class MeshcoreCardEditor extends HTMLElement {
  setConfig(config) {
    this._config = { ...config };
    this._renderEditor();
  }

  set hass(hass) {
    this._hass = hass;
    this._renderEditor();
  }

  _discoverHubs() {
    if (!this._hass) return [];
    const hubs = {};
    const re = /^sensor\.meshcore_([a-f0-9]+)_node_count(?:_(.+))?$/;
    for (const id of Object.keys(this._hass.states)) {
      const m = id.match(re);
      if (m && !hubs[m[1]]) hubs[m[1]] = { pubkey: m[1], name: (m[2] || m[1]).replace(/_/g, " ") };
    }
    return Object.values(hubs);
  }

  _discoverNodes(pubkey) {
    if (!this._hass?.entities || !this._hass?.devices) return [];

    let hubConfigEntryId = null;
    let hubDeviceId = null;
    for (const [entityId, info] of Object.entries(this._hass.entities)) {
      if (entityId.includes(`meshcore_${pubkey}`) && /node_count/.test(entityId)) {
        hubConfigEntryId = info.config_entry_id;
        hubDeviceId = info.device_id;
        break;
      }
    }
    if (!hubConfigEntryId) return [];

    const nodes = [];
    for (const [deviceId, device] of Object.entries(this._hass.devices)) {
      if (deviceId === hubDeviceId) continue;
      if (!device.config_entries?.includes(hubConfigEntryId)) continue;

      let type = 0;
      for (const [entityId, info] of Object.entries(this._hass.entities)) {
        if (info.device_id !== deviceId) continue;
        const attrs = this._hass.states[entityId]?.attributes;
        if (attrs?.type) { type = Number(attrs.type); break; }
        if (attrs?.node_type) { type = Number(attrs.node_type); break; }
      }
      nodes.push({ name: device.name_by_user || device.name || deviceId, type, deviceId });
    }
    return nodes;
  }

  _renderEditor() {
    if (!this._config) return;
    const hubs     = this._discoverHubs();
    const hubsCfg  = this._config.hubs  || {};
    const nodesCfg = this._config.nodes || {};

    const rows = hubs.flatMap(hub => {
      const hubEnabled = hubsCfg[hub.pubkey] !== false;
      const nodes = this._discoverNodes(hub.pubkey);
      const nodeRows = nodes.map(n => {
        const nodeEnabled = nodesCfg[n.name] !== false;
        const typeLabel = NODE_TYPES[n.type] || "";
        return `
          <div class="toggle-row node-row" data-key="${n.name}" data-kind="node">
            <div class="row-info">
              <span class="row-name">${n.name.replace(/_/g, " ")}</span>
              ${typeLabel ? `<span class="row-type">${typeLabel}</span>` : ""}
            </div>
            <label class="toggle-switch">
              <input type="checkbox" ${nodeEnabled ? "checked" : ""} data-key="${n.name}" data-kind="node">
              <span class="slider"></span>
            </label>
          </div>`;
      }).join("");

      return [`
        <div class="toggle-row hub-row" data-key="${hub.pubkey}" data-kind="hub">
          <div class="row-info">
            <span class="hub-dot"></span>
            <span class="row-name">${hub.name}</span>
            <span class="row-pubkey">${hub.pubkey}</span>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" ${hubEnabled ? "checked" : ""} data-key="${hub.pubkey}" data-kind="hub">
            <span class="slider"></span>
          </label>
        </div>`,
        nodes.length ? `<div class="node-group">${nodeRows}</div>` : ""
      ];
    }).join("");

    this.innerHTML = `
      <style>
        .editor { padding: 8px 0; font-family: var(--paper-font-body1_-_font-family, system-ui, sans-serif); font-size: 14px; }
        .section-title { font-size: 0.65rem; font-weight: 700; letter-spacing: 0.1em; color: var(--secondary-text-color); padding: 12px 16px 4px; }
        .toggle-row {
          display: flex; align-items: center; justify-content: space-between;
          padding: 8px 16px; border-radius: 8px; margin: 2px 8px;
        }
        .hub-row { background: var(--secondary-background-color, rgba(0,0,0,0.06)); margin-top: 4px; }
        .node-row { padding: 6px 16px 6px 32px; }
        .node-group { border-left: 2px solid var(--divider-color, rgba(0,0,0,0.1)); margin: 0 16px 4px 32px; padding-left: 0; border-radius: 0 0 0 4px; }
        .row-info { display: flex; align-items: center; gap: 8px; }
        .row-name { font-weight: 500; text-transform: capitalize; }
        .row-pubkey { font-family: monospace; font-size: 0.72rem; color: var(--secondary-text-color); }
        .row-type { font-size: 0.65rem; color: var(--accent-color, #0a84ff); background: rgba(10,132,255,0.1); padding: 1px 6px; border-radius: 5px; font-weight: 600; }
        .hub-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--accent-color, #0a84ff); flex-shrink: 0; }
        .hint { font-size: 0.75rem; color: var(--secondary-text-color); padding: 8px 16px; }

        /* Toggle switch */
        .toggle-switch { position: relative; display: inline-block; width: 36px; height: 20px; flex-shrink: 0; }
        .toggle-switch input { opacity: 0; width: 0; height: 0; }
        .slider { position: absolute; inset: 0; background: var(--divider-color, #ccc); border-radius: 20px; transition: background 0.2s; cursor: pointer; }
        .slider::before { content: ""; position: absolute; width: 14px; height: 14px; left: 3px; bottom: 3px; background: white; border-radius: 50%; transition: transform 0.2s; }
        input:checked + .slider { background: var(--accent-color, #0a84ff); }
        input:checked + .slider::before { transform: translateX(16px); }
      </style>
      <div class="editor">
        ${hubs.length === 0
          ? `<div class="hint">No MeshCore hubs detected yet. Add the card, then edit to configure.</div>`
          : `<div class="section-title">HUBS &amp; NODES</div>${rows}`}
      </div>`;

    this.querySelectorAll("input[type=checkbox]").forEach(input => {
      input.addEventListener("change", () => {
        const { key, kind } = input.dataset;
        const cfg = { ...this._config };
        if (kind === "hub") {
          cfg.hubs = { ...hubsCfg, [key]: input.checked };
        } else {
          cfg.nodes = { ...nodesCfg, [key]: input.checked };
        }
        this._config = cfg;
        this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: cfg } }));
      });
    });
  }
}

// ─── Registration ─────────────────────────────────────────────────────────────

if (!customElements.get("meshcore-card")) customElements.define("meshcore-card", MeshcoreCard);
if (!customElements.get("meshcore-card-editor")) customElements.define("meshcore-card-editor", MeshcoreCardEditor);

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
