/**
 * MeshCore Card for Home Assistant
 * Displays hub and node statistics from the meshcore integration
 */

// ─── Helpers ────────────────────────────────────────────────────────────────

function longestCommonPrefix(strs) {
  if (!strs.length) return "";
  let i = 0;
  while (i < strs[0].length && strs.every(s => s[i] === strs[0][i])) i++;
  return strs[0].slice(0, i);
}

function longestCommonSuffix(strs) {
  const rev = strs.map(s => [...s].reverse().join(""));
  return [...longestCommonPrefix(rev)].reverse().join("");
}

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
  if (isNaN(v)) return "var(--secondary-text-color)";
  if (v >= 50) return "var(--success-color, #4caf50)";
  if (v >= 20) return "var(--warning-color, #ff9800)";
  return "var(--error-color, #f44336)";
}

function batteryClass(pct) {
  const v = Number(pct);
  if (isNaN(v)) return "dim";
  if (v >= 50) return "green";
  if (v >= 20) return "yellow";
  return "red";
}

function formatUptime(days) {
  const v = parseFloat(days);
  if (isNaN(v) || v < 0) return null;
  const d = Math.floor(v);
  const h = Math.floor((v - d) * 24);
  if (d > 0) return `${d}d ${h}h`;
  return `${h}h`;
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
    if (fp === this._fp) return;
    this._fp = fp;
    const now = Date.now();
    if (now - (this._lastRender || 0) >= 10000) {
      this._lastRender = now;
      this._render();
    } else if (!this._renderTimer) {
      const delay = 10000 - (now - (this._lastRender || 0));
      this._renderTimer = setTimeout(() => {
        this._renderTimer = null;
        this._lastRender = Date.now();
        this._render();
      }, delay);
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

  // Find an entity for a device by matching the metric against the "core" of entity IDs —
  // the part that remains after stripping the common prefix and common suffix shared by all
  // entities on that device. Matches core === metric OR core.endsWith("_" + metric).
  _findEntityByDevice(deviceId, metric, ePrefix, eSuffix) {
    if (!deviceId || !this._hass.entities) return null;
    const pLen = (ePrefix || "").length;
    const sLen = (eSuffix || "").length;
    for (const [entityId, info] of Object.entries(this._hass.entities)) {
      if (info.device_id !== deviceId) continue;
      const core = entityId.slice(pLen, sLen ? -sLen : undefined);
      if (core === metric || core.endsWith(`_${metric}`)) return entityId;
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

  _discoverNodes() {
    if (!this._hass.entities || !this._hass.devices) return [];

    // Collect device_ids that belong to hub devices (have a node_count entity)
    const hubDeviceIds = new Set();
    for (const [entityId, info] of Object.entries(this._hass.entities)) {
      if (/node_count/.test(entityId) && info.device_id) hubDeviceIds.add(info.device_id);
    }

    // All meshcore devices that are not hub devices
    const meshcoreDeviceIds = new Set();
    for (const [, info] of Object.entries(this._hass.entities)) {
      if (info.platform === "meshcore" && info.device_id && !hubDeviceIds.has(info.device_id)) {
        meshcoreDeviceIds.add(info.device_id);
      }
    }

    const nodes = [];
    for (const deviceId of meshcoreDeviceIds) {
      const device = this._hass.devices[deviceId];
      if (!device) continue;

      const deviceEntityIds = Object.entries(this._hass.entities)
        .filter(([, info]) => info.device_id === deviceId)
        .map(([id]) => id);
      const ePrefix = longestCommonPrefix(deviceEntityIds);
      const eSuffix = longestCommonSuffix(deviceEntityIds);
      nodes.push({ name: device.name_by_user || device.name || deviceId, deviceId, ePrefix, eSuffix });
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

  _locLink(lat, lon, entityId) {
    const latF = parseFloat(lat).toFixed(5);
    const lonF = parseFloat(lon).toFixed(5);
    const url = `https://analyzer.letsmesh.net/map?lat=${latF}&long=${lonF}&zoom=10`;
    return `<div class="loc-row">
      <span class="chip clickable" data-entity="${entityId}">📍 ${latF}, ${lonF}</span>
      <a class="map-link" href="${url}" target="_blank" rel="noopener">Map ↗</a>
    </div>`;
  }

  _badge(id, text, cls = "") {
    if (!id) return `<span class="badge dim">${text}</span>`;
    return `<span class="badge ${cls} clickable" data-entity="${id}">${text}</span>`;
  }

  // ── Hub rendering ────────────────────────────────────────────────────────

  _renderHub(hub) {
    const { pubkey, name } = hub;
    const e = (m) => this._hubEntity(pubkey, name, m);
    const hubCfg = this._hubCfg(pubkey);

    const statusId    = e("node_status");
    const countId     = hub.nodeCountEntity;
    const battPctId   = hubCfg.battery_entity || e("battery_percentage");
    const battVId     = hubCfg.voltage_entity  || e("battery_voltage");
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
      <div class="node-block ${online ? "" : "node-offline"}">
        <div class="node-header">
          <div class="node-left">
            <span class="status-dot ${online ? "dot-online" : "dot-offline"}"></span>
            <span class="node-name">Hub: ${name.replace(/_/g, " ")}</span>
            <span class="node-key dim clickable" data-entity="${statusId || countId}">(${pubkey})</span>
          </div>
          <div class="node-right">
            ${nodeCount !== null ? `<span class="count-badge clickable" data-entity="${countId}">◈ ${nodeCount} Nodes</span>` : ""}
          </div>
        </div>

        ${hwModel || firmware ? `<div class="hw-info">${[hwModel, firmware].filter(Boolean).join(" • ")}</div>` : ""}

        ${battPct !== null && Number(battPct) !== 0 ? `
          <div class="bar-row">
            <span class="bar-label">🔋 Battery</span>
            <span class="bar-val clickable" data-entity="${battPctId}" style="color:${battCol}">${battPct}%</span>
          </div>
          ${this._progressBar(battPct, battCol)}` : ""}

        <div class="chip-row">
          ${battV !== null && parseFloat(battV) >= 0.001 ? this._chip(battVId, "⚡", parseFloat(battV).toFixed(3) + "V") : ""}
          ${this._exists(ch1VId) ? this._chip(ch1VId, "Ch1 ", (this._val(ch1VId) || "—") + "V") : ""}
          ${this._exists(rateLimId) ? this._chip(rateLimId, "Rate ", (this._val(rateLimId) || "—") + " tok") : ""}
        </div>
        ${lat !== null && lon !== null ? this._locLink(lat, lon, latId) : ""}

        ${showRf ? `
          <div class="rf-row">
            ${freq ? `<span class="rf-chip clickable" data-entity="${freqId}">${parseFloat(freq).toFixed(3)} MHz</span>` : ""}
            ${bw   ? `<span class="rf-chip clickable" data-entity="${bwId}">${bw} kHz</span>` : ""}
            ${sf   ? `<span class="rf-chip clickable" data-entity="${sfId}">SF${sf}</span>` : ""}
            ${txPow ? `<span class="rf-chip clickable" data-entity="${txPowId}">${txPow} dBm</span>` : ""}
          </div>` : ""}

        ${mqttIds.length ? `
          <div class="mqtt-row">
            <span class="mqtt-label">MQTT</span>
            ${mqttIds.map(id => {
              const v   = this._val(id);
              const lbl = this._attr(id, "server") || (this._attr(id, "friendly_name") || id).replace(/meshcore\s+\w+\s*/i, "").replace(/_/g, " ").trim();
              
              return `<span class="mqtt-pill ${v ? "ok" : "err"} clickable" data-entity="${id}">${lbl}</span>`;
            }).join("")}
          </div>` : ""}
      </div>
    `;
  }

  // ── Node rendering ───────────────────────────────────────────────────────

  _renderNode(node) {
    const { name, deviceId, ePrefix, eSuffix } = node;
    const p = (m) => this._findEntityByDevice(deviceId, m, ePrefix, eSuffix);
    const nodeCfg = this._nodeCfg(name);

    // Common entities (all types)
    const statusId  = p("status");
    const successId = p("request_successes");
    const rssiId    = p("last_rssi");
    const snrId     = p("last_snr");
    const pathId    = p("path_length");
    const routeId   = p("routing_path");
    const advertId  = p("last_advert");
    const battPctId = nodeCfg.battery_entity || p("battery_percentage") || p("battery_level") || p("battery");
    const battVId   = nodeCfg.voltage_entity  || p("battery_voltage");
    const locEntityId = nodeCfg.location_entity || null;
    const latId     = locEntityId ? null : p("latitude");
    const lonId     = locEntityId ? null : p("longitude");

    // Repeater / Room Server extras (type 2 & 3)
    const sentId     = p("nb_sent");
    const receivedId = p("nb_recv");
    const relayedId  = p("relayed");
    const canceledId = p("canceled");
    const dupId      = p("duplicate");
    const airtimeId   = p("airtime_utilization");
    const rxAirtimeId = p("rx_airtime_utilization");
    const channelId  = p("channel_utilization");
    const noiseId    = p("noise_floor");
    const queueId    = p("queue_length");
    const uptimeId   = p("uptime");
    const txRateId   = [p("tx_per_minute"), p("tx_rate"), p("messages_per_minute")].find(id => this._exists(id));
    const rxRateId   = [p("rx_per_minute"), p("rx_rate")].find(id => this._exists(id));

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
    const lat     = locEntityId ? this._attr(locEntityId, "latitude")  : this._val(latId);
    const lon     = locEntityId ? this._attr(locEntityId, "longitude") : this._val(lonId);
    const locId   = locEntityId || latId;

    const successes = this._val(successId);
    const online   = successes !== null ? Number(successes) > 0 : isOnlineState(status);
    const lastSeen = formatLastSeen(lastAdv);

    // Detect node role by entity presence — no type attribute needed
    const isRepeater = !!(airtimeId || rxAirtimeId || noiseId);
    const isSensor   = !isRepeater && !!(p("temperature") || p("humidity") || p("illuminance"));

    // Repeater traffic — only show entities that exist
    const trafficCells = [
      { label: "Sent",      id: sentId,     cls: "" },
      { label: "Received",  id: receivedId, cls: "" },
      { label: "Relayed",   id: relayedId,  cls: "blue" },
      { label: "Canceled",  id: canceledId, cls: "red" },
      { label: "Duplicate", id: dupId,      cls: "yellow" },
    ].filter(c => this._exists(c.id));

    const airtime   = this._val(airtimeId);
    const rxAirtime = this._val(rxAirtimeId);
    const channel   = this._val(channelId);
    const noise     = this._val(noiseId);
    const queue     = this._val(queueId);
    const uptimeRaw = this._val(uptimeId);
    const uptime    = formatUptime(uptimeRaw);
    const txRate    = txRateId ? this._val(txRateId) : null;
    const rxRate    = rxRateId ? this._val(rxRateId) : null;

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
            <span class="node-name">${name.replace(/_/g, " ")}</span>
            ${isRepeater ? `<span class="type-badge">Repeater</span>` : isSensor ? `<span class="type-badge">Sensor</span>` : ""}
          </div>
          <div class="node-right">
            ${rssi !== null ? `<span class="badge ${rssiClass(rssi)} clickable" data-entity="${rssiId}">RSSI ${rssi} dBm</span>` : ""}
            ${snr  !== null ? `<span class="badge clickable" data-entity="${snrId}">SNR ${snr} dB</span>` : ""}
            ${pathLen !== null ? `<span class="badge clickable" data-entity="${pathId}">${pathLen}↑</span>` : ""}
            ${lastSeen ? `<span class="badge dim">${lastSeen}</span>` : ""}
          </div>
        </div>

        ${route && !["unknown","unavailable"].includes(route) ? `
          <div class="node-route">↝ ${route}</div>` : ""}

        ${battPct !== null && Number(battPct) !== 0 ? `
          <div class="bar-row">
            <span class="bar-label">🔋 Battery</span>
            <span class="bar-label-right">
              ${battV !== null && parseFloat(battV) >= 0.001 ? `<span class="clickable" data-entity="${battVId}">⚡ ${parseFloat(battV).toFixed(3)}V</span>` : ""}
              <span class="bar-val clickable" data-entity="${battPctId}" style="color:${batteryColor(battPct)}">${battPct}%</span>
            </span>
          </div>
          ${this._progressBar(battPct, batteryColor(battPct))}` : ""}

        ${battV !== null && parseFloat(battV) >= 0.001 && (battPct === null || Number(battPct) === 0) ? `
          <div class="node-chip-row">
            ${this._chip(battVId, "⚡ ", parseFloat(battV).toFixed(3) + "V")}
          </div>` : ""}

        ${isRepeater ? `

          ${airtime !== null ? `
            <div class="bar-row">
              <span class="bar-label">📡 TX Airtime</span>
              <span class="bar-val clickable" data-entity="${airtimeId}">${parseFloat(airtime).toFixed(1)}%</span>
            </div>
            ${this._progressBar(airtime, "var(--primary-color)")}` : ""}

          ${rxAirtime !== null ? `
            <div class="bar-row">
              <span class="bar-label">📡 RX Airtime</span>
              <span class="bar-val clickable" data-entity="${rxAirtimeId}">${parseFloat(rxAirtime).toFixed(1)}%</span>
            </div>
            ${this._progressBar(rxAirtime, "var(--accent-color)")}` : ""}

          ${noise !== null || uptime !== null || txRate !== null || rxRate !== null || queue !== null ? `
            <div class="node-chip-row">
              ${noise   !== null ? this._chip(noiseId,  "Noise Floor ", noise + " dBm") : ""}
              ${uptime  !== null ? this._chip(uptimeId, "Up ",    uptime) : ""}
              ${txRate  !== null ? this._chip(txRateId, "TX/min ", txRate) : ""}
              ${rxRate  !== null ? this._chip(rxRateId, "RX/min ", rxRate) : ""}
              ${queue   !== null ? this._chip(queueId,  "Queue ",  queue) : ""}
            </div>` : ""}

          ${trafficCells.length ? `
            <div class="node-traffic">
              ${trafficCells.map(c => {
                const v = this._val(c.id);
                const blank = v === null || v === "unknown" || v === "unavailable";
                const display = blank ? "—" : (isNaN(Number(v)) ? v : Math.round(Number(v)));
              return `<div class="tc"><div class="tc-label">${c.label}</div>
                  <div class="tc-val ${blank ? "dim" : c.cls} clickable" data-entity="${c.id}">${display}</div></div>`;
              }).join("")}
            </div>` : ""}

          ${lat !== null && lon !== null ? this._locLink(lat, lon, locId) : ""}
        ` : `
          ${lat !== null && lon !== null ? this._locLink(lat, lon, locId) : ""}
        `}

        ${isSensor && telemetryCells.length ? `
          <div class="node-chip-row">
            ${telemetryCells.map(c => {
              const v = this._val(c.id);
              return this._chip(c.id, c.label + " ", v !== null ? v + c.unit : "—");
            }).join("")}
          </div>` : ""}

      </div>`;
  }

  // ── Config helpers ───────────────────────────────────────────────────────

  // Returns normalised config object for a hub, handling legacy boolean values.
  _hubCfg(pubkey) {
    const v = (this._config.hubs || {})[pubkey];
    if (v && typeof v === "object") return v;
    return { enabled: v !== false };
  }

  // Returns normalised config object for a node, handling legacy boolean values.
  _nodeCfg(name) {
    const v = (this._config.nodes || {})[name];
    if (v && typeof v === "object") return v;
    return { enabled: v !== false };
  }

  // ── Main render ──────────────────────────────────────────────────────────

  _render() {
    if (!this._hass || !this._config) return;

    const allHubs = this._discoverHubs();
    if (!allHubs.length) {
      this._setBody(`<div class="empty">No MeshCore hubs found.<br>Check the meshcore integration is installed.</div>`);
      return;
    }

    const visibleHubs = allHubs.filter(h => this._hubCfg(h.pubkey).enabled !== false);
    const nodes = this._discoverNodes()
      .filter(n => this._nodeCfg(n.name).enabled !== false);

    const hubsHtml = visibleHubs.length
      ? `<div class="section-label">HUBS</div>` + visibleHubs.map(hub => this._renderHub(hub)).join("")
      : "";

    const nodesHtml = nodes.length
      ? `<div class="nodes-section">
          <div class="section-label">REMOTE NODES</div>
          ${nodes.map(n => this._renderNode(n)).join("")}
         </div>`
      : "";

    this._setBody(hubsHtml + nodesHtml || `<div class="empty">All hubs and nodes are hidden.</div>`);
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
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  ha-card {
    padding: 16px;
    font-family: var(--paper-font-body1_-_font-family, var(--primary-font-family, system-ui, sans-serif));
    font-size: var(--paper-font-body1_-_font-size, 14px);
    color: var(--primary-text-color);
  }

  /* Hub / Node shared */
  .hw-info { font-size: var(--paper-font-caption_-_font-size, 12px); color: var(--secondary-text-color); margin: 4px 0 6px; }
  .count-badge { font-size: var(--paper-font-caption_-_font-size, 12px); font-weight: 600; background: var(--secondary-background-color); padding: 3px 10px; border-radius: 20px; }
  .node-key { font-family: var(--paper-font-code1_-_font-family, monospace); font-size: var(--paper-font-caption_-_font-size, 12px); }

  /* Status dots */
  .status-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; display: inline-block; }
  .dot-online  { background: var(--success-color, #4caf50); box-shadow: 0 0 5px var(--success-color, #4caf50); }
  .dot-offline { background: var(--secondary-text-color); }

  /* Progress bars */
  .bar-row { display: flex; align-items: center; justify-content: space-between; margin: 10px 0 3px; font-size: var(--paper-font-caption_-_font-size, 12px); }
  .bar-label { display: flex; align-items: center; gap: 5px; color: var(--secondary-text-color); }
  .bar-label-right { display: flex; align-items: center; gap: 8px; }
  .bar-val { font-weight: 600; color: var(--primary-text-color); }
  .bar-track { height: 5px; border-radius: 3px; background: var(--secondary-background-color); overflow: hidden; margin-bottom: 8px; }
  .bar-fill { height: 100%; border-radius: 3px; transition: width 0.4s; }

  /* Chips */
  .chip-row, .node-chip-row { display: flex; flex-wrap: wrap; gap: 5px; margin: 5px 0; }
  .chip {
    display: inline-flex; align-items: center; gap: 3px;
    font-size: var(--paper-font-caption_-_font-size, 12px); font-weight: 500;
    background: var(--secondary-background-color); padding: 4px 10px; border-radius: 8px;
    color: var(--primary-text-color);
  }
  .chip-label { color: var(--secondary-text-color); font-weight: 400; }

  /* RF chips */
  .rf-row { display: flex; flex-wrap: wrap; gap: 5px; margin: 4px 0 6px; }
  .rf-chip { font-size: var(--paper-font-caption_-_font-size, 12px); padding: 2px 8px; border-radius: 6px; background: var(--secondary-background-color); color: var(--primary-color); font-weight: 500; }

  /* MQTT pills */
  .mqtt-row { display: flex; flex-wrap: wrap; align-items: center; gap: 5px; margin: 4px 0 6px; }
  .mqtt-label { font-size: var(--paper-font-caption_-_font-size, 12px); color: var(--secondary-text-color); font-weight: 500; margin-right: 2px; }
  .mqtt-pill { font-size: var(--paper-font-caption_-_font-size, 12px); padding: 3px 10px; border-radius: 20px; font-weight: 500; text-transform: capitalize; }
  .mqtt-pill.ok  { color: var(--success-color, #4caf50); background: rgba(76,175,80,0.12); }
  .mqtt-pill.err { color: var(--error-color, #f44336); background: rgba(244,67,54,0.12); }

  /* Color helpers */
  .green  { color: var(--success-color, #4caf50); }
  .yellow { color: var(--warning-color, #ff9800); }
  .red    { color: var(--error-color, #f44336); }
  .blue   { color: var(--primary-color); }
  .dim    { color: var(--secondary-text-color); }

  /* Clickable */
  .clickable { cursor: pointer; transition: opacity 0.15s; }
  .clickable:hover { opacity: 0.65; }

  /* Nodes section */
  .nodes-section { margin-top: 8px; }
  .section-label {
    font-size: var(--paper-font-caption_-_font-size, 12px); font-weight: 700;
    letter-spacing: 0.08em; color: var(--secondary-text-color); padding: 6px 2px 4px;
    text-transform: uppercase;
  }

  .node-block { padding: 10px 12px 8px; border-radius: var(--ha-card-border-radius, 12px); margin-bottom: 6px; border: 1px solid var(--divider-color); background: var(--secondary-background-color); }
  .node-offline { opacity: 0.5; }

  .node-header { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 4px; }
  .node-left { display: flex; align-items: center; gap: 6px; }
  .node-right { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
  .node-name { font-weight: 600; text-transform: capitalize; }
  .type-badge { font-size: var(--paper-font-caption_-_font-size, 12px); color: var(--accent-color); background: var(--secondary-background-color); padding: 1px 6px; border-radius: 5px; font-weight: 600; border: 1px solid var(--divider-color); }

  .badge { font-size: var(--paper-font-caption_-_font-size, 12px); padding: 2px 7px; border-radius: 5px; background: var(--secondary-background-color); color: var(--secondary-text-color); font-weight: 500; }
  .badge.green  { color: var(--success-color, #4caf50); }
  .badge.yellow { color: var(--warning-color, #ff9800); }
  .badge.red    { color: var(--error-color, #f44336); }

  .node-route { font-size: var(--paper-font-caption_-_font-size, 12px); color: var(--secondary-text-color); padding-left: 14px; font-family: var(--paper-font-code1_-_font-family, monospace); margin: 2px 0 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  /* Node traffic grid */
  .node-traffic { display: grid; grid-template-columns: repeat(auto-fill, minmax(70px, 1fr)); gap: 6px 4px; margin: 6px 0 2px; background: var(--secondary-background-color); border-radius: 8px; padding: 8px 10px; border: 1px solid var(--divider-color); }
  .tc { display: flex; flex-direction: column; gap: 2px; }
  .tc-label { font-size: var(--paper-font-caption_-_font-size, 12px); color: var(--secondary-text-color); }
  .tc-val { font-weight: 700; }

  .loc-row { display: flex; align-items: center; gap: 6px; margin: 5px 0; }
  .map-link { font-size: var(--paper-font-caption_-_font-size, 12px); font-weight: 500; color: var(--primary-color); text-decoration: none; padding: 4px 8px; border-radius: 8px; background: var(--secondary-background-color); white-space: nowrap; border: 1px solid var(--divider-color); }
  .map-link:hover { opacity: 0.75; }

  .empty { text-align: center; color: var(--secondary-text-color); font-size: var(--paper-font-caption_-_font-size, 12px); padding: 24px 16px; line-height: 1.7; }
`;

// ─── Editor ──────────────────────────────────────────────────────────────────

class MeshcoreCardEditor extends HTMLElement {
  setConfig(config) {
    this._config = { ...config };
    this._renderEditor();
  }

  set hass(hass) {
    this._hass = hass;
    const form = this.querySelector("ha-form");
    if (form) form.hass = hass;
    const hubs = this._discoverHubs();
    const nodes = this._discoverNodes();
    const fp = hubs.map(h => h.pubkey).join(",") + "|" + nodes.map(n => n.name).join(",");
    if (fp !== this._discoveryFp) {
      this._discoveryFp = fp;
      this._renderEditor();
    }
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

  _discoverNodes() {
    if (!this._hass?.entities || !this._hass?.devices) return [];
    const hubDeviceIds = new Set();
    for (const [entityId, info] of Object.entries(this._hass.entities)) {
      if (/node_count/.test(entityId) && info.device_id) hubDeviceIds.add(info.device_id);
    }
    const meshcoreDeviceIds = new Set();
    for (const [, info] of Object.entries(this._hass.entities)) {
      if (info.platform === "meshcore" && info.device_id && !hubDeviceIds.has(info.device_id))
        meshcoreDeviceIds.add(info.device_id);
    }
    const nodes = [];
    for (const deviceId of meshcoreDeviceIds) {
      const device = this._hass.devices[deviceId];
      if (!device) continue;
      nodes.push({ name: device.name_by_user || device.name || deviceId, deviceId });
    }
    return nodes;
  }

  _getCfgObj(kind, key) {
    const map = kind === "hub" ? (this._config.hubs || {}) : (this._config.nodes || {});
    const v = map[key];
    if (v && typeof v === "object") return { ...v };
    return { enabled: v !== false };
  }

  // Build ha-form schema: one expandable section per hub/node.
  // ha-form expandable nests inner field data under the section's own name key,
  // so inner fields use plain names (enabled, battery_entity, voltage_entity).
  _buildSchema(hubs, nodes) {
    const section = (name, title, kind, entityIds) => {
      const sel = entityIds.length
        ? { entity: { include_entities: entityIds } }
        : { entity: { domain: "sensor" } };
      return {
        type: "expandable",
        name,
        title,
        schema: [
          { name: "enabled",        label: `Show this ${kind}`,                      selector: { boolean: {} } },
          { name: "battery_entity", label: "Battery % entity (blank = auto-detect)",  selector: sel },
          { name: "voltage_entity", label: "Voltage entity (blank = auto-detect)",    selector: sel },
          ...(kind === "node" ? [{ name: "location_entity", label: "Location entity with latitude/longitude attributes (optional)", selector: sel }] : []),
        ],
      };
    };

    return [
      ...hubs.map(h => {
        const ids = Object.keys(this._hass.states).filter(id => id.includes(h.pubkey));
        return section(`hub__${h.pubkey}`, `Hub: ${h.name} (${h.pubkey})`, "hub", ids);
      }),
      ...nodes.map(n => {
        const ids = this._hass.entities
          ? Object.entries(this._hass.entities)
              .filter(([, info]) => info.device_id === n.deviceId)
              .map(([id]) => id)
          : [];
        return section(`node__${n.name}`, n.name.replace(/_/g, " "), "node", ids);
      }),
    ];
  }

  // Build data in the nested format ha-form expandable expects:
  // { "hub__<pubkey>": { enabled, battery_entity, voltage_entity }, ... }
  _buildData(hubs, nodes) {
    const data = {};
    for (const hub of hubs) {
      const cfg = this._getCfgObj("hub", hub.pubkey);
      data[`hub__${hub.pubkey}`] = {
        enabled:        cfg.enabled !== false,
        battery_entity: cfg.battery_entity || null,
        voltage_entity: cfg.voltage_entity || null,
      };
    }
    for (const node of nodes) {
      const cfg = this._getCfgObj("node", node.name);
      data[`node__${node.name}`] = {
        enabled:          cfg.enabled !== false,
        battery_entity:   cfg.battery_entity   || null,
        voltage_entity:   cfg.voltage_entity   || null,
        location_entity:  cfg.location_entity  || null,
      };
    }
    return data;
  }

  // Convert ha-form nested output back to the card config structure.
  _formDataToConfig(formData, hubs, nodes) {
    const cfg = { ...this._config };
    for (const hub of hubs) {
      const d = formData[`hub__${hub.pubkey}`] || {};
      const obj = { enabled: d.enabled !== false };
      if (d.battery_entity) obj.battery_entity = d.battery_entity;
      if (d.voltage_entity) obj.voltage_entity = d.voltage_entity;
      cfg.hubs = { ...(cfg.hubs || {}), [hub.pubkey]: obj };
    }
    for (const node of nodes) {
      const d = formData[`node__${node.name}`] || {};
      const obj = { enabled: d.enabled !== false };
      if (d.battery_entity)  obj.battery_entity  = d.battery_entity;
      if (d.voltage_entity)  obj.voltage_entity  = d.voltage_entity;
      if (d.location_entity) obj.location_entity = d.location_entity;
      cfg.nodes = { ...(cfg.nodes || {}), [node.name]: obj };
    }
    return cfg;
  }

  _renderEditor() {
    if (!this._config) return;

    while (this.lastChild) this.removeChild(this.lastChild);

    const hubs  = this._discoverHubs();
    const nodes = this._discoverNodes();

    if (!hubs.length) {
      const alert = document.createElement("ha-alert");
      alert.alertType = "info";
      alert.textContent = "No MeshCore hubs detected yet. Add the card, then edit to configure.";
      this.appendChild(alert);
      return;
    }

    const form = document.createElement("ha-form");
    form.hass   = this._hass;
    form.schema = this._buildSchema(hubs, nodes);
    form.data   = this._buildData(hubs, nodes);
    form.computeLabel = (s) => s.label || s.title || s.name;

    form.addEventListener("value-changed", (e) => {
      const newConfig = this._formDataToConfig(e.detail.value, hubs, nodes);
      this._config = newConfig;
      this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: newConfig } }));
    });

    this.appendChild(form);
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
