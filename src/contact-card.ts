import type { HomeAssistant, MeshcoreContactCardConfig, HaFormElement } from "./types.js";
import { formatLastSeen } from "./helpers.js";
import { STYLES } from "./styles.js";

const CONTACT_STYLES: string = `
  .contact-list { display: flex; flex-direction: column; gap: 2px; }

  .contact-row {
    display: flex; align-items: center; gap: 10px;
    padding: 8px 10px; border-radius: var(--ha-card-border-radius, 12px);
    border: 1px solid var(--divider-color);
    background: var(--secondary-background-color);
    cursor: pointer; transition: opacity 0.15s;
  }
  .contact-row:hover { opacity: 0.75; }

  .contact-icon {
    display: flex; align-items: center; justify-content: center;
    width: 32px; height: 32px; flex-shrink: 0;
    color: var(--secondary-text-color);
  }
  .contact-icon ha-icon { --mdc-icon-size: 22px; }

  .contact-info { flex: 1; min-width: 0; }

  .contact-header { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .contact-name { font-weight: 600; text-transform: capitalize; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  .contact-meta {
    display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
    margin-top: 2px;
    font-size: var(--paper-font-caption_-_font-size, 12px);
    color: var(--secondary-text-color);
  }

  .meta-loc { color: var(--primary-color); text-decoration: none; font-weight: 500; }
  .meta-loc:hover { opacity: 0.75; }

  .contact-right { display: flex; align-items: center; flex-shrink: 0; }
`;

interface ContactEntry {
  entityId: string;
  advName: string;
  nodeType: string;
  lastAdvert: number;
  timeSince: string | null;
  icon: string;
  lat: number | null;
  lon: number | null;
  unknownLocation: boolean;
  online: boolean;
}

const DEFAULT_MAX_AGE_DAYS = 7;

export class MeshcoreContactCard extends HTMLElement {
  private _hass?: HomeAssistant;
  private _config?: MeshcoreContactCardConfig;
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

  setConfig(config: MeshcoreContactCardConfig): void {
    this._config = config;
    this._fp = null;
    this._render();
  }

  set hass(hass: HomeAssistant) {
    this._hass = hass;
    const fp = Object.entries(hass.states)
      .filter(([id]) => /^binary_sensor\.meshcore_.*_contact$/.test(id))
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

  private _discoverContacts(): ContactEntry[] {
    if (!this._hass) return [];
    const maxAgeDays = this._config?.max_contact_age_days ?? DEFAULT_MAX_AGE_DAYS;
    const cutoff = Date.now() / 1000 - maxAgeDays * 86400;
    return Object.entries(this._hass.states)
      .filter(([id]) => /^binary_sensor\.meshcore_.*_contact$/.test(id))
      .map(([entityId, state]): ContactEntry => {
        const a = state.attributes as Record<string, unknown>;
        const lastAdvert = Number(a["last_advert"] ?? 0);
        const rawLat = a["adv_lat"] ?? a["latitude"];
        const rawLon = a["adv_lon"] ?? a["longitude"];
        const lat = rawLat != null && rawLat !== "" ? parseFloat(String(rawLat)) : null;
        const lon = rawLon != null && rawLon !== "" ? parseFloat(String(rawLon)) : null;
        return {
          entityId,
          advName:   String(a["adv_name"] || entityId),
          nodeType:  String(a["node_type_str"] || ""),
          lastAdvert,
          timeSince: formatLastSeen(lastAdvert || null),
          icon:      String(a["icon"] || "mdi:account"),
          lat:             lat !== null && !isNaN(lat) && lat !== 0 ? lat : null,
          lon:             lon !== null && !isNaN(lon) && lon !== 0 ? lon : null,
          unknownLocation: rawLat != null && rawLon != null && (parseFloat(String(rawLat)) === 0 || parseFloat(String(rawLon)) === 0),
          online:    !["stale", "off", "unavailable", "unknown"].includes(state.state),
        };
      })
      .filter((c) => c.lastAdvert >= cutoff)
      .sort((a, b) => b.lastAdvert - a.lastAdvert);
  }

  private _renderRow(c: ContactEntry): string {
    const mapUrl = c.lat !== null && c.lon !== null
      ? `https://analyzer.letsmesh.net/map?lat=${c.lat.toFixed(5)}&long=${c.lon!.toFixed(5)}&zoom=10`
      : null;

    return `
      <div class="contact-row" data-entity="${c.entityId}">
        <div class="contact-icon">
          <ha-icon icon="${c.icon}"></ha-icon>
        </div>
        <div class="contact-info">
          <div class="contact-header">
            <span class="contact-name">${c.advName}</span>
            ${c.nodeType ? `<span class="type-badge">${c.nodeType}</span>` : ""}
          </div>
          <div class="contact-meta">
            ${c.timeSince ? `<span>${c.timeSince}</span>` : ""}
            ${mapUrl ? `<a class="meta-loc" href="${mapUrl}" target="_blank" rel="noopener">📍 ${c.lat!.toFixed(5)}, ${c.lon!.toFixed(5)}</a>` : c.unknownLocation ? `<span class="dim">Unknown Location</span>` : ""}
          </div>
        </div>
        <div class="contact-right">
          <span class="status-dot ${c.online ? "dot-online" : "dot-offline"}"></span>
        </div>
      </div>`;
  }

  private _render(): void {
    if (!this._hass || !this._config) return;
    const contacts = this._discoverContacts();
    if (!contacts.length) {
      this._setBody(`<div class="empty">No MeshCore contact nodes found.<br>Check the meshcore integration is installed.</div>`);
      return;
    }
    this._setBody(
      `<div class="section-label">CONTACTS</div>` +
      `<div class="contact-list">${contacts.map((c) => this._renderRow(c)).join("")}</div>`
    );
  }

  private _setBody(body: string): void {
    const constrained = !!this._config?.grid_options?.rows;
    const cls = constrained ? " class=\"grid-rows\"" : "";
    this.shadowRoot!.innerHTML = `<style>${STYLES}${CONTACT_STYLES}</style><ha-card${cls}>${body}</ha-card>`;
    if (constrained) this._scheduleTrim(".contact-row");
  }

  private _scheduleTrim(rowSelector: string): void {
    if (this._trimTimer !== null) cancelAnimationFrame(this._trimTimer);
    this.style.visibility = "hidden";
    const attempt = () => {
      const h = this.clientHeight;
      if (!h) { this._trimTimer = requestAnimationFrame(attempt); return; }
      this._trimTimer = null;
      const card = this.shadowRoot!.querySelector("ha-card") as HTMLElement | null;
      if (!card) return;
      for (const el of Array.from(card.querySelectorAll<HTMLElement>(rowSelector))) {
        el.style.visibility = el.offsetTop + el.offsetHeight > h ? "hidden" : "";
      }
      this.style.visibility = "";
    };
    this._trimTimer = requestAnimationFrame(attempt);
  }

  getCardSize(): number {
    return 4;
  }

  static getConfigElement(): HTMLElement {
    return document.createElement("meshcore-contact-card-editor");
  }

  static getStubConfig(): MeshcoreContactCardConfig {
    return { max_contact_age_days: DEFAULT_MAX_AGE_DAYS };
  }
}

export class MeshcoreContactCardEditor extends HTMLElement {
  private _config?: MeshcoreContactCardConfig;
  private _hass?: HomeAssistant;

  setConfig(config: MeshcoreContactCardConfig): void {
    this._config = { ...config };
    this._renderEditor();
  }

  set hass(hass: HomeAssistant) {
    this._hass = hass;
    const form = this.querySelector("ha-form") as HaFormElement | null;
    if (form) form.hass = hass;
  }

  private _renderEditor(): void {
    if (!this._config) return;
    while (this.lastChild) this.removeChild(this.lastChild);

    const form = document.createElement("ha-form") as HaFormElement;
    form.hass = this._hass!;
    form.schema = [
      {
        name: "max_contact_age_days",
        label: "Maximum contact age (days)",
        selector: { number: { min: 1, max: 365, step: 1, unit_of_measurement: "days", mode: "box" } } as never,
      },
    ];
    form.data = {
      max_contact_age_days: this._config.max_contact_age_days ?? DEFAULT_MAX_AGE_DAYS,
    };
    form.computeLabel = (s) => ("label" in s ? s.label : undefined) ?? s.name;

    form.addEventListener("value-changed", (e: Event) => {
      const value = (e as CustomEvent<{ value: Record<string, unknown> }>).detail.value;
      this._config = { ...this._config, max_contact_age_days: Number(value["max_contact_age_days"]) };
      this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: this._config } }));
    });

    this.appendChild(form);
  }
}
