import type { HomeAssistant, MeshcoreChannelCardConfig } from "./types.js";
import { STYLES } from "./styles.js";
import { makeLocalize, type LocalizeFunc } from "./localize.js";

const CHANNEL_STYLES: string = `
  .channel-list { display: flex; flex-direction: column; gap: 2px; }

  .channel-row {
    display: flex; align-items: center; gap: 10px;
    padding: 8px 12px; border-radius: var(--ha-card-border-radius, 12px);
    border: 1px solid var(--divider-color);
    background: var(--secondary-background-color);
    cursor: pointer; transition: opacity 0.15s;
  }
  .channel-row:hover { opacity: 0.75; }

  .channel-dot {
    width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0;
  }
  .channel-dot.active  { background: var(--success-color, #4caf50); }
  .channel-dot.inactive { background: var(--disabled-text-color, #9e9e9e); }

  .channel-hub {
    font-weight: 500;
    color: var(--secondary-text-color);
    white-space: nowrap;
    flex-shrink: 0;
  }

  .channel-name {
    font-weight: 600;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
`;

interface ChannelEntry {
  entityId: string;
  hubName: string;
  channelName: string;
  channelIndex: number;
  active: boolean;
}

/**
 * Parse hub name and channel name from a channel entity.
 *
 * Entity ID pattern:  binary_sensor.meshcore_<hubprefix>_ch_<index>_messages
 * Friendly name pattern: MeshCore <HubName> (<hubprefix>) <ChannelName> Messages
 *
 * We prefer the friendly_name parser because it carries the human-readable hub
 * name and channel name. Fall back to the entity ID when the name is absent.
 */
function parseChannel(entityId: string, attrs: Record<string, unknown>): { hubName: string; channelName: string; channelIndex: number } {
  const channelIndex = typeof attrs["channel_index"] === "number" ? attrs["channel_index"] : 0;

  const friendly = String(attrs["friendly_name"] ?? "");
  // "MeshCore YubaWifi (55733c) Public Messages"
  const m = friendly.match(/^MeshCore\s+(.+?)\s+\([0-9a-f]+\)\s+(.+?)\s+Messages/i);
  if (m) {
    return { hubName: m[1]!, channelName: m[2]!, channelIndex };
  }

  // Fallback: parse from entity ID
  // binary_sensor.meshcore_55733c_ch_2_messages → hubPrefix=55733c, channelIndex=2
  const idm = entityId.match(/^binary_sensor\.meshcore_([^_]+(?:_[^_]+)*)_ch_(\d+)_messages$/);
  const hubName    = idm ? idm[1]! : entityId;
  const chIdx      = idm ? parseInt(idm[2]!, 10) : channelIndex;
  return { hubName, channelName: `Ch ${chIdx}`, channelIndex: chIdx };
}

export class MeshcoreChannelCard extends HTMLElement {
  private _hass?: HomeAssistant;
  private _config?: MeshcoreChannelCardConfig;
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

  setConfig(config: MeshcoreChannelCardConfig): void {
    this._config = config;
    this._fp = null;
    this._render();
  }

  set hass(hass: HomeAssistant) {
    this._hass = hass;
    const fp = Object.entries(hass.states)
      .filter(([id]) => /^binary_sensor\.meshcore_.*_ch_\d+_messages$/.test(id))
      .map(([id, s]) => `${id}=${s.state}`)
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

  private _discoverChannels(): ChannelEntry[] {
    if (!this._hass) return [];
    return Object.entries(this._hass.states)
      .filter(([id]) => /^binary_sensor\.meshcore_.*_ch_\d+_messages$/.test(id))
      .map(([entityId, state]): ChannelEntry => {
        const attrs = state.attributes as Record<string, unknown>;
        const { hubName, channelName, channelIndex } = parseChannel(entityId, attrs);
        return {
          entityId,
          hubName,
          channelName,
          channelIndex,
          active: state.state === "Active",
        };
      })
      .sort((a, b) => {
        const ch = a.channelIndex - b.channelIndex;
        return ch !== 0 ? ch : a.hubName.localeCompare(b.hubName);
      });
  }

  private _renderRow(ch: ChannelEntry): string {
    return `
      <div class="channel-row" data-entity="${ch.entityId}">
        <span class="channel-dot ${ch.active ? "active" : "inactive"}"></span>
        <span class="channel-hub">${ch.hubName}</span>
        <span class="channel-name">${ch.channelName}</span>
      </div>`;
  }

  private _render(): void {
    if (!this._hass || !this._config) return;
    const t = makeLocalize(this._hass.language ?? this._hass.locale?.language ?? "en");
    const channels = this._discoverChannels();
    if (!channels.length) {
      this._setBody(`<div class="empty">${t("card.empty_channels")}</div>`);
      return;
    }
    this._setBody(
      `<div class="section-label">${t("card.section_channels")}</div>` +
      `<div class="channel-list">${channels.map((ch) => this._renderRow(ch)).join("")}</div>`
    );
  }

  private _setBody(body: string): void {
    const constrained = !!this._config?.grid_options?.rows;
    const cls = constrained ? " class=\"grid-rows\"" : "";
    this.shadowRoot!.innerHTML = `<style>${STYLES}${CHANNEL_STYLES}</style><ha-card${cls}>${body}</ha-card>`;
    if (constrained) this._scheduleTrim(".channel-row");
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
    return 3;
  }

  static getConfigElement(): HTMLElement {
    return document.createElement("meshcore-channel-card-editor");
  }

  static getStubConfig(): MeshcoreChannelCardConfig {
    return {};
  }
}

export class MeshcoreChannelCardEditor extends HTMLElement {
  private _config?: MeshcoreChannelCardConfig;

  setConfig(config: MeshcoreChannelCardConfig): void {
    this._config = { ...config };
  }

  set hass(_hass: HomeAssistant) {
    // no entity pickers needed — channel card has no user-configurable entities
  }

  connectedCallback(): void {
    // Editor has no controls; all discovery is automatic.
    while (this.lastChild) this.removeChild(this.lastChild);
    const msg = document.createElement("p");
    msg.style.cssText = "margin: 16px; color: var(--secondary-text-color); font-size: 14px;";
    msg.textContent = "Channels are discovered automatically from the MeshCore integration.";
    this.appendChild(msg);
  }
}
