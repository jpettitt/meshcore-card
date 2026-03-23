import type {
  HomeAssistant,
  MeshcoreCardConfig,
  HubConfig,
  NodeConfig,
  HubInfo,
  NodeInfo,
  TrafficCell,
  TelemetryCell,
} from "./types.js";
import {
  isOnlineState,
  formatLastSeen,
  batteryColor,
  batteryClass,
  formatUptime,
  rssiClass,
} from "./helpers.js";
import { STYLES } from "./styles.js";
import { discoverHubs, discoverNodes } from "./discovery.js";

export class MeshcoreCard extends HTMLElement {
  private _hass?: HomeAssistant;
  private _config?: MeshcoreCardConfig;
  private _fp: string | null = null;
  private _lastRender = 0;
  private _renderTimer: ReturnType<typeof setTimeout> | null = null;
  private _trimTimer: ReturnType<typeof requestAnimationFrame> | null = null;

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.shadowRoot!.addEventListener("click", (e: Event) => {
      const el = (e.target as Element).closest("[data-entity]") as HTMLElement | null;
      if (el?.dataset["entity"]) {
        const event = new Event("hass-more-info", { bubbles: true, composed: true });
        (event as Event & { detail: { entityId: string } }).detail = {
          entityId: el.dataset["entity"],
        };
        this.dispatchEvent(event);
      }
    });
  }

  setConfig(config: MeshcoreCardConfig): void {
    this._config = config;
    this._fp = null; // force re-render on config change
    this._render();
  }

  set hass(hass: HomeAssistant) {
    this._hass = hass;
    const fp = Object.entries(hass.states)
      .filter(([id]) => id.includes("meshcore"))
      .map(([id, s]) => `${id}=${s.state}@${s.last_changed}`)
      .join("|");
    if (fp === this._fp) return;
    this._fp = fp;
    const now = Date.now();
    if (now - this._lastRender >= 10000) {
      this._lastRender = now;
      this._render();
    } else if (!this._renderTimer) {
      const delay = 10000 - (now - this._lastRender);
      this._renderTimer = setTimeout(() => {
        this._renderTimer = null;
        this._lastRender = Date.now();
        this._render();
      }, delay);
    }
  }

  // ── Entity accessors ───────────────────────────────────────────────────────

  private _val(id: string | null): string | null {
    if (!id) return null;
    const s = this._hass?.states[id];
    return s ? s.state : null;
  }

  private _attr(id: string | null, attr: string): unknown {
    if (!id) return null;
    return this._hass?.states[id]?.attributes[attr] ?? null;
  }

  private _exists(id: string | null | undefined): boolean {
    return !!id && !!this._hass?.states[id];
  }

  private _find(prefix: string): string | null {
    if (!this._hass) return null;
    if (this._hass.states[prefix]) return prefix;
    for (const id of Object.keys(this._hass.states)) {
      if (id.startsWith(prefix + "_")) return id;
    }
    return null;
  }

  private _findEntityByDevice(
    deviceId: string,
    metric: string,
    ePrefix: string,
    eSuffix: string
  ): string | null {
    if (!deviceId || !this._hass?.entities) return null;
    const pLen = (ePrefix || "").length;
    const sLen = (eSuffix || "").length;
    for (const [entityId, info] of Object.entries(this._hass.entities)) {
      if (info.device_id !== deviceId) continue;
      const core = entityId.slice(pLen, sLen ? -sLen : undefined);
      if (core === metric || core.endsWith(`_${metric}`)) return entityId;
    }
    return null;
  }

  // ── Discovery ─────────────────────────────────────────────────────────────

  private _discoverHubs(): HubInfo[] {
    if (!this._hass) return [];
    return discoverHubs(this._hass);
  }

  private _discoverNodes(): NodeInfo[] {
    if (!this._hass) return [];
    return discoverNodes(this._hass);
  }

  private _hubEntity(pubkey: string, hubName: string, metric: string): string | null {
    if (!this._hass) return null;
    const exact = `sensor.meshcore_${pubkey}_${metric}_${hubName}`;
    if (this._hass.states[exact]) return exact;
    return this._find(`sensor.meshcore_${pubkey}_${metric}`);
  }

  // ── Config helpers ─────────────────────────────────────────────────────────

  private _hubCfg(pubkey: string): HubConfig {
    const v = (this._config?.hubs ?? {})[pubkey];
    if (v && typeof v === "object") return v as HubConfig;
    return { enabled: v !== false };
  }

  private _nodeCfg(name: string): NodeConfig {
    const v = (this._config?.nodes ?? {})[name];
    if (v && typeof v === "object") return v as NodeConfig;
    return { enabled: v !== false };
  }

  // ── Rendering helpers ──────────────────────────────────────────────────────

  private _progressBar(pct: string | number | null, color: string): string {
    const w = Math.min(100, Math.max(0, Number(pct) || 0));
    return `<div class="bar-track"><div class="bar-fill" style="width:${w}%;background:${color}"></div></div>`;
  }

  private _chip(
    id: string | null,
    label: string,
    value: string | null,
    cls = ""
  ): string {
    if (!id || value === null) return "";
    const blank = value === "unknown" || value === "unavailable";
    return `<span class="chip ${cls} clickable" data-entity="${id}">${
      label ? `<span class="chip-label">${label}</span>` : ""
    }${blank ? "—" : value}</span>`;
  }

  private _locLink(lat: unknown, lon: unknown, entityId: string | null): string {
    if (!entityId) return "";
    const latF = parseFloat(String(lat)).toFixed(5);
    const lonF = parseFloat(String(lon)).toFixed(5);
    const url = `https://analyzer.letsmesh.net/map?lat=${latF}&long=${lonF}&zoom=10`;
    return `<div class="loc-row">
      <span class="chip clickable" data-entity="${entityId}">📍 ${latF}, ${lonF}</span>
      <a class="map-link" href="${url}" target="_blank" rel="noopener">Map ↗</a>
    </div>`;
  }

  // ── Hub rendering ──────────────────────────────────────────────────────────

  private _renderHub(hub: HubInfo): string {
    const { pubkey, name } = hub;
    const e = (m: string) => this._hubEntity(pubkey, name, m);
    const hubCfg = this._hubCfg(pubkey);

    const statusId  = e("node_status");
    const countId   = hub.nodeCountEntity;
    const battPctId = hubCfg.battery_entity ?? e("battery_percentage");
    const battVId   = hubCfg.voltage_entity  ?? e("battery_voltage");
    const freqId    = e("frequency");
    const bwId      = e("bandwidth");
    const sfId      = e("spreading_factor");
    const txPowId   = e("tx_power");
    const latId     = e("latitude");
    const lonId     = e("longitude");
    const rateLimId = e("request_rate_limiter");
    const ch1VId    = e("ch1_voltage");

    const mqttIds = Object.keys(this._hass?.states ?? {})
      .filter((id) => /meshcore_[a-f0-9]+_mqtt/.test(id) && id.includes(pubkey))
      .sort();

    const status    = this._val(statusId) ?? "unknown";
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

    const online  = isOnlineState(status);
    const battCol = batteryColor(battPct);
    const showRf  = freq || bw || sf || txPow;

    return `
      <div class="node-block ${online ? "" : "node-offline"}">
        <div class="node-header">
          <div class="node-left">
            <span class="status-dot ${online ? "dot-online" : "dot-offline"}"></span>
            <span class="node-name">Hub: ${name.replace(/_/g, " ")}</span>
            <span class="node-key dim clickable" data-entity="${statusId ?? countId}">(${pubkey})</span>
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
          ${this._exists(ch1VId) ? this._chip(ch1VId, "Ch1 ", (this._val(ch1VId) ?? "—") + "V") : ""}
          ${this._exists(rateLimId) ? this._chip(rateLimId, "Rate ", (this._val(rateLimId) ?? "—") + " tok") : ""}
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
            ${mqttIds.map((id) => {
              const v   = this._val(id);
              const lbl = (this._attr(id, "server") as string | null) ||
                ((this._attr(id, "friendly_name") as string | null) || id)
                  .replace(/meshcore\s+\w+\s*/i, "")
                  .replace(/_/g, " ")
                  .trim();
              return `<span class="mqtt-pill ${v ? "ok" : "err"} clickable" data-entity="${id}">${lbl}</span>`;
            }).join("")}
          </div>` : ""}
      </div>
    `;
  }

  // ── Node rendering ─────────────────────────────────────────────────────────

  private _renderNode(node: NodeInfo): string {
    const { name, deviceId, ePrefix, eSuffix } = node;
    const p = (m: string) => this._findEntityByDevice(deviceId, m, ePrefix, eSuffix);
    const nodeCfg = this._nodeCfg(name);

    // Common entities (all types)
    const statusId  = p("status");
    const successId = p("request_successes");
    const rssiId    = p("last_rssi");
    const snrId     = p("last_snr");
    const pathId    = p("path_length");
    const routeId   = p("routing_path");
    const advertId  = p("last_advert");
    const battPctId = nodeCfg.battery_entity ?? p("battery_percentage") ?? p("battery_level") ?? p("battery");
    const battVId   = nodeCfg.voltage_entity  ?? p("battery_voltage");
    const locEntityId = nodeCfg.location_entity ?? null;
    const latId     = locEntityId ? null : p("latitude");
    const lonId     = locEntityId ? null : p("longitude");

    // Repeater / Room Server extras (type 2 & 3)
    const sentId      = p("nb_sent");
    const receivedId  = p("nb_recv");
    const relayedId   = p("relayed");
    const canceledId  = p("canceled");
    const dupId       = p("duplicate");
    const airtimeId   = p("airtime_utilization");
    const rxAirtimeId = p("rx_airtime_utilization");
    const noiseId     = p("noise_floor");
    const queueId     = p("queue_length");
    const uptimeId    = p("uptime");
    const txRateId    = [p("tx_per_minute"), p("tx_rate"), p("messages_per_minute")].find((id) => this._exists(id)) ?? null;
    const rxRateId    = [p("rx_per_minute"), p("rx_rate")].find((id) => this._exists(id)) ?? null;

    // Sensor extras (type 4)
    const tempId  = p("temperature");
    const humidId = p("humidity");
    const illumId = p("illuminance");
    const pressId = p("pressure");

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
    const locId   = locEntityId ?? latId;

    const successes = this._val(successId);
    const online    = successes !== null ? Number(successes) > 0 : isOnlineState(status);
    const lastSeen  = formatLastSeen(lastAdv);

    // Detect node role by entity presence
    const isRepeater = !!(airtimeId || rxAirtimeId || noiseId);
    const isSensor   = !isRepeater && !!(p("temperature") || p("humidity") || p("illuminance"));

    const trafficCells: TrafficCell[] = [
      { label: "Sent",      id: sentId,    cls: "" },
      { label: "Received",  id: receivedId, cls: "" },
      { label: "Relayed",   id: relayedId, cls: "blue" },
      { label: "Canceled",  id: canceledId, cls: "red" },
      { label: "Duplicate", id: dupId,     cls: "yellow" },
    ].filter((c) => this._exists(c.id));

    const airtime   = this._val(airtimeId);
    const rxAirtime = this._val(rxAirtimeId);
    const noise     = this._val(noiseId);
    const queue     = this._val(queueId);
    const uptimeRaw = this._val(uptimeId);
    const uptime    = formatUptime(uptimeRaw);
    const txRate    = txRateId ? this._val(txRateId) : null;
    const rxRate    = rxRateId ? this._val(rxRateId) : null;

    const telemetryCells: TelemetryCell[] = [
      { label: "Temp",     id: tempId,  unit: "°C" },
      { label: "Humidity", id: humidId, unit: "%" },
      { label: "Lux",      id: illumId, unit: " lx" },
      { label: "Pressure", id: pressId, unit: " hPa" },
    ].filter((c) => this._exists(c.id));

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

        ${route && !["unknown", "unavailable"].includes(route) ? `
          <div class="node-route">↝ ${route}</div>` : ""}

        ${battPct !== null && Number(battPct) !== 0 ? `
          <div class="bar-row">
            <span class="bar-label">🔋 Battery</span>
            <span class="bar-label-right">
              ${battV !== null && parseFloat(String(battV)) >= 0.001 ? `<span class="clickable" data-entity="${battVId}">⚡ ${parseFloat(String(battV)).toFixed(3)}V</span>` : ""}
              <span class="bar-val clickable" data-entity="${battPctId}" style="color:${batteryColor(battPct)}">${battPct}%</span>
            </span>
          </div>
          ${this._progressBar(battPct, batteryColor(battPct))}` : ""}

        ${battV !== null && parseFloat(String(battV)) >= 0.001 && (battPct === null || Number(battPct) === 0) ? `
          <div class="node-chip-row">
            ${this._chip(battVId, "⚡ ", parseFloat(String(battV)).toFixed(3) + "V")}
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
              ${uptime  !== null ? this._chip(uptimeId, "Up ", uptime) : ""}
              ${txRate  !== null ? this._chip(txRateId, "TX/min ", txRate) : ""}
              ${rxRate  !== null ? this._chip(rxRateId, "RX/min ", rxRate) : ""}
              ${queue   !== null ? this._chip(queueId,  "Queue ", queue) : ""}
            </div>` : ""}

          ${trafficCells.length ? `
            <div class="node-traffic">
              ${trafficCells.map((c) => {
                const v = this._val(c.id);
                const blank = v === null || v === "unknown" || v === "unavailable";
                const display = blank ? "—" : (isNaN(Number(v)) ? v : String(Math.round(Number(v))));
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
            ${telemetryCells.map((c) => {
              const v = this._val(c.id);
              return this._chip(c.id, c.label + " ", v !== null ? v + c.unit : "—");
            }).join("")}
          </div>` : ""}

      </div>`;
  }

  // ── Main render ────────────────────────────────────────────────────────────

  private _render(): void {
    if (!this._hass || !this._config) return;

    const allHubs = this._discoverHubs();
    if (!allHubs.length) {
      this._setBody(`<div class="empty">No MeshCore hubs found.<br>Check the meshcore integration is installed.</div>`);
      return;
    }

    const visibleHubs = allHubs.filter((h) => this._hubCfg(h.pubkey).enabled !== false);
    const nodes = this._discoverNodes().filter(
      (n) => this._nodeCfg(n.name).enabled !== false
    );

    const hubsHtml = visibleHubs.length
      ? `<div class="section-label">HUBS</div>` +
        visibleHubs.map((hub) => this._renderHub(hub)).join("")
      : "";

    const nodesHtml = nodes.length
      ? `<div class="nodes-section">
          <div class="section-label">REMOTE NODES</div>
          ${nodes.map((n) => this._renderNode(n)).join("")}
         </div>`
      : "";

    this._setBody(
      hubsHtml + nodesHtml ||
        `<div class="empty">All hubs and nodes are hidden.</div>`
    );
  }

  private _setBody(body: string): void {
    const constrained = !!this._config?.grid_options?.rows;
    const cls = constrained ? " class=\"grid-rows\"" : "";
    this.shadowRoot!.innerHTML = `<style>${STYLES}</style><ha-card${cls}>${body}</ha-card>`;
    if (constrained) this._scheduleTrim(".node-block");
  }

  private _scheduleTrim(rowSelector: string): void {
    if (this._trimTimer !== null) cancelAnimationFrame(this._trimTimer);
    this.style.opacity = "0";
    this._trimTimer = requestAnimationFrame(() => {
      this._trimTimer = null;
      const card = this.shadowRoot!.querySelector("ha-card") as HTMLElement | null;
      const h = card?.clientHeight ?? 0;
      if (card && h) {
        for (const el of Array.from(card.querySelectorAll<HTMLElement>(rowSelector))) {
          el.style.visibility = el.offsetTop + el.offsetHeight > h ? "hidden" : "";
        }
      }
      this.style.opacity = "";
    });
  }

  getCardSize(): number {
    return 5;
  }

  static getConfigElement(): HTMLElement {
    return document.createElement("meshcore-card-editor");
  }

  static getStubConfig(): MeshcoreCardConfig {
    return {};
  }
}
