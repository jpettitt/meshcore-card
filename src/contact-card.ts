import type { HomeAssistant, MeshcoreContactCardConfig, HaFormElement } from "./types.js";
import { formatLastSeen, escapeHtml } from "./helpers.js";
import { STYLES } from "./styles.js";
import { makeLocalize, type LocalizeFunc } from "./localize.js";

const CONTACT_STYLES: string = `
  .contact-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .contact-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 14px;
    border-radius: 18px;
    background: rgba(128, 128, 128, 0.04);
    backdrop-filter: blur(4px);
    border: 1px solid rgba(128, 128, 128, 0.1);
    transition: transform 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
    cursor: pointer;
  }
  .contact-row:hover {
    transform: translateY(-1px);
    background: rgba(128, 128, 128, 0.07);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  }

  .contact-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    flex-shrink: 0;
    color: var(--secondary-text-color);
    background: rgba(128, 128, 128, 0.05);
    border-radius: 50%;
  }
  .contact-icon ha-icon {
    --mdc-icon-size: 20px;
  }
  .contact-icon img {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    object-fit: cover;
  }

  .contact-info {
    flex: 1;
    min-width: 0;
  }

  .contact-header {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .contact-name {
    font-weight: 600;
    font-size: 0.95rem;
    text-transform: capitalize;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--primary-text-color);
  }

  .contact-meta {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    margin-top: 4px;
    font-size: 11px;
    color: var(--secondary-text-color);
    opacity: 0.7;
  }

  .meta-loc {
    color: var(--mesh-blue);
    text-decoration: none;
    font-weight: 500;
    transition: opacity 0.2s;
  }
  .meta-loc:hover {
    opacity: 0.7;
  }

  .contact-right {
    display: flex;
    align-items: center;
    flex-shrink: 0;
  }

  /* Status dot – taka sama jak dla węzłów */
  .status-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    display: inline-block;
    transition: box-shadow 0.3s ease;
  }
  .dot-online {
    background: var(--mesh-green);
    box-shadow: 0 0 8px rgba(74, 222, 128, 0.6);
    animation: contact-pulse-glow 2s ease-in-out infinite;
  }
  .dot-offline {
    background: var(--secondary-text-color);
    opacity: 0.4;
  }

  @keyframes contact-pulse-glow {
    0%, 100% { box-shadow: 0 0 4px rgba(74, 222, 128, 0.4); }
    50% { box-shadow: 0 0 12px rgba(74, 222, 128, 0.8); }
  }

  /* Typ badge – taki sam jak dla węzłów */
  .type-badge {
    font-size: 10px;
    color: var(--mesh-orange);
    background: transparent;
    padding: 2px 8px;
    border-radius: 12px;
    font-weight: 600;
    border: 1px solid rgba(251, 146, 60, 0.3);
    transition: all 0.2s ease;
  }
  .type-badge:hover {
    transform: translateY(-1px);
  }

  .dim {
    color: var(--secondary-text-color);
    opacity: 0.5;
  }
`;

interface ContactEntry {
  entityId: string;
  advName: string;
  nodeType: string;
  lastAdvert: number;
  timeSince: string | null;
  icon: string;
  picture: string | null;
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

  private _discoverContacts(t: LocalizeFunc): ContactEntry[] {
    if (!this._hass) return [];
    const maxAgeDays = this._config?.max_contact_age_days ?? DEFAULT_MAX_AGE_DAYS;
    const cutoff = Date.now() / 1000 - maxAgeDays * 86400;
    return Object.entries(this._hass.states)
      .filter(([id]) => /^binary_sensor\.meshcore_.*_contact$/.test(id))
      .map(([entityId, state]): ContactEntry => {
        const a = state.attributes as Record<string, unknown>;
        const now = Date.now() / 1000;
        const rawAdvert = Number(a["last_advert"] ?? 0);
        const lastAdvert = rawAdvert > 0 && rawAdvert <= now
          ? rawAdvert
          : state.last_updated ? new Date(state.last_updated).getTime() / 1000 : 0;
        const rawLat = a["adv_lat"] ?? a["latitude"];
        const rawLon = a["adv_lon"] ?? a["longitude"];
        const lat = rawLat != null && rawLat !== "" ? parseFloat(String(rawLat)) : null;
        const lon = rawLon != null && rawLon !== "" ? parseFloat(String(rawLon)) : null;
        return {
          entityId,
          advName:   String(a["adv_name"] || entityId),
          nodeType:  String(a["node_type_str"] || ""),
          lastAdvert,
          timeSince: formatLastSeen(lastAdvert || null, t),
          icon:      String(a["icon"] || "mdi:account"),
          picture:   a["entity_picture"] ? String(a["entity_picture"]) : null,
          lat:             lat !== null && !isNaN(lat) && lat !== 0 ? lat : null,
          lon:             lon !== null && !isNaN(lon) && lon !== 0 ? lon : null,
          unknownLocation: rawLat != null && rawLon != null && (parseFloat(String(rawLat)) === 0 || parseFloat(String(rawLon)) === 0),
          online:    !["stale", "off", "unavailable", "unknown"].includes(state.state),
        };
      })
      .filter((c) => c.lastAdvert >= cutoff)
      .sort((a, b) => b.lastAdvert - a.lastAdvert);
  }

  private _renderRow(c: ContactEntry, t: LocalizeFunc): string {
    const mapUrl = c.lat !== null && c.lon !== null
      ? `https://analyzer.letsmesh.net/map?lat=${c.lat.toFixed(5)}&long=${c.lon!.toFixed(5)}&zoom=10`
      : null;

    // entity_picture URLs and icon names come from HA contact attributes,
    // which the meshcore integration sources unsanitized from the mesh.
    // Reject anything that isn't a same-origin / http(s) image URL or a
    // simple mdi-style icon name to avoid javascript:/data: schemes and
    // attribute breakout via quotes.
    const safePicture = c.picture && /^(?:https?:\/\/|\/)/i.test(c.picture) ? c.picture : null;
    const safeIcon = /^[a-z0-9_-]+:[a-z0-9_-]+$/i.test(c.icon) ? c.icon : "mdi:account";

    return `
      <div class="contact-row" data-entity="${escapeHtml(c.entityId)}">
        <div class="contact-icon">
          ${safePicture
            ? `<img src="${escapeHtml(safePicture)}" alt="">`
            : `<ha-icon icon="${escapeHtml(safeIcon)}"></ha-icon>`}
        </div>
        <div class="contact-info">
          <div class="contact-header">
            <span class="contact-name">${escapeHtml(c.advName)}</span>
            ${c.nodeType ? `<span class="type-badge">${escapeHtml(c.nodeType)}</span>` : ""}
          </div>
          <div class="contact-meta">
            ${c.timeSince ? `<span>${escapeHtml(c.timeSince)}</span>` : ""}
            ${mapUrl ? `<a class="meta-loc" href="${mapUrl}" target="_blank" rel="noopener">📍 ${c.lat!.toFixed(5)}, ${c.lon!.toFixed(5)}</a>` : c.unknownLocation ? `<span class="dim">${escapeHtml(t("card.unknown_location"))}</span>` : ""}
          </div>
        </div>
        <div class="contact-right">
          <span class="status-dot ${c.online ? "dot-online" : "dot-offline"}"></span>
        </div>
      </div>`;
  }

  private _render(): void {
    if (!this._hass || !this._config) return;
    const t = makeLocalize(this._hass.language ?? this._hass.locale?.language ?? "en");
    const contacts = this._discoverContacts(t);
    if (!contacts.length) {
      this._setBody(`<div class="empty">${t("card.empty_contacts")}</div>`);
      return;
    }
    this._setBody(
      `<div class="section-label">${t("card.section_contacts")}</div>` +
      `<div class="contact-list">${contacts.map((c) => this._renderRow(c, t)).join("")}</div>`
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
    const t = makeLocalize(this._hass?.language ?? this._hass?.locale?.language ?? "en");
    form.schema = [
      {
        name: "max_contact_age_days",
        label: t("editor.max_contact_age"),
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
