import type {
  HomeAssistant,
  MeshcoreCardConfig,
  HubConfig,
  NodeConfig,
  HubInfo,
  NodeInfo,
  HaFormSchema,
  HaFormExpandableSchema,
  HaFormElement,
  HaAlertElement,
} from "./types.js";
import { discoverHubs, discoverNodes } from "./discovery.js";

interface EditorHubInfo extends HubInfo {
  // name already normalized (underscores replaced) for display
}

interface EditorNodeInfo extends NodeInfo {
  // same shape, used for clarity
}

export class MeshcoreCardEditor extends HTMLElement {
  private _hass?: HomeAssistant;
  private _config?: MeshcoreCardConfig;
  private _discoveryFp = "";

  setConfig(config: MeshcoreCardConfig): void {
    this._config = { ...config };
    this._renderEditor();
  }

  set hass(hass: HomeAssistant) {
    this._hass = hass;
    const form = this.querySelector("ha-form") as HaFormElement | null;
    if (form) form.hass = hass;
    const hubs  = this._discoverHubs();
    const nodes = this._discoverNodes();
    const fp = hubs.map((h) => h.pubkey).join(",") + "|" + nodes.map((n) => n.name).join(",");
    if (fp !== this._discoveryFp) {
      this._discoveryFp = fp;
      this._renderEditor();
    }
  }

  // ── Discovery ──────────────────────────────────────────────────────────────

  private _discoverHubs(): EditorHubInfo[] {
    if (!this._hass) return [];
    return discoverHubs(this._hass).map((h) => ({
      ...h,
      name: h.name.replace(/_/g, " "),
    }));
  }

  private _discoverNodes(): EditorNodeInfo[] {
    if (!this._hass) return [];
    return discoverNodes(this._hass);
  }

  // ── Config helpers ─────────────────────────────────────────────────────────

  private _getCfgObj(kind: "hub" | "node", key: string): HubConfig | NodeConfig {
    const map = kind === "hub"
      ? (this._config?.hubs ?? {})
      : (this._config?.nodes ?? {});
    const v = map[key];
    if (v && typeof v === "object") return { ...v } as HubConfig | NodeConfig;
    return { enabled: v !== false };
  }

  // ── Schema / data builders ─────────────────────────────────────────────────

  private _buildSchema(hubs: EditorHubInfo[], nodes: EditorNodeInfo[]): HaFormSchema[] {
    // All entities from the meshcore integration — used for location picker
    const meshcoreIds = this._hass?.entities
      ? Object.entries(this._hass.entities)
          .filter(([, info]) => info.platform === "meshcore")
          .map(([id]) => id)
      : [];
    const locationSel = meshcoreIds.length
      ? { entity: { include_entities: meshcoreIds } }
      : { entity: { domain: "sensor" } };

    const section = (
      name: string,
      title: string,
      kind: "hub" | "node",
      entityIds: string[]
    ): HaFormExpandableSchema => {
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
          ...(kind === "node"
            ? [{ name: "location_entity", label: "Location entity with latitude/longitude attributes (optional)", selector: locationSel }]
            : []),
        ],
      };
    };

    return [
      ...hubs.map((h) => {
        const ids = Object.keys(this._hass?.states ?? {}).filter((id) => id.includes(h.pubkey));
        return section(`hub__${h.pubkey}`, `Hub: ${h.name} (${h.pubkey})`, "hub", ids);
      }),
      ...nodes.map((n) => {
        const ids = this._hass?.entities
          ? Object.entries(this._hass.entities)
              .filter(([, info]) => info.device_id === n.deviceId)
              .map(([id]) => id)
          : [];
        return section(`node__${n.name}`, n.name.replace(/_/g, " "), "node", ids);
      }),
    ];
  }

  private _buildData(
    hubs: EditorHubInfo[],
    nodes: EditorNodeInfo[]
  ): Record<string, unknown> {
    const data: Record<string, unknown> = {};
    for (const hub of hubs) {
      const cfg = this._getCfgObj("hub", hub.pubkey) as HubConfig;
      data[`hub__${hub.pubkey}`] = {
        enabled:        cfg.enabled !== false,
        battery_entity: cfg.battery_entity ?? null,
        voltage_entity: cfg.voltage_entity ?? null,
      };
    }
    for (const node of nodes) {
      const cfg = this._getCfgObj("node", node.name) as NodeConfig;
      data[`node__${node.name}`] = {
        enabled:         cfg.enabled !== false,
        battery_entity:  cfg.battery_entity  ?? null,
        voltage_entity:  cfg.voltage_entity  ?? null,
        location_entity: cfg.location_entity ?? null,
      };
    }
    return data;
  }

  private _formDataToConfig(
    formData: Record<string, unknown>,
    hubs: EditorHubInfo[],
    nodes: EditorNodeInfo[]
  ): MeshcoreCardConfig {
    const cfg: MeshcoreCardConfig = { ...this._config };
    for (const hub of hubs) {
      const d = (formData[`hub__${hub.pubkey}`] ?? {}) as Record<string, unknown>;
      const obj: HubConfig = { enabled: d["enabled"] !== false };
      if (d["battery_entity"]) obj.battery_entity = d["battery_entity"] as string;
      if (d["voltage_entity"]) obj.voltage_entity = d["voltage_entity"] as string;
      cfg.hubs = { ...(cfg.hubs ?? {}), [hub.pubkey]: obj };
    }
    for (const node of nodes) {
      const d = (formData[`node__${node.name}`] ?? {}) as Record<string, unknown>;
      const obj: NodeConfig = { enabled: d["enabled"] !== false };
      if (d["battery_entity"])  obj.battery_entity  = d["battery_entity"]  as string;
      if (d["voltage_entity"])  obj.voltage_entity  = d["voltage_entity"]  as string;
      if (d["location_entity"]) obj.location_entity = d["location_entity"] as string;
      cfg.nodes = { ...(cfg.nodes ?? {}), [node.name]: obj };
    }
    return cfg;
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  private _renderEditor(): void {
    if (!this._config) return;

    while (this.lastChild) this.removeChild(this.lastChild);

    const hubs  = this._discoverHubs();
    const nodes = this._discoverNodes();

    if (!hubs.length) {
      const alert = document.createElement("ha-alert") as HaAlertElement;
      alert.alertType = "info";
      alert.textContent = "No MeshCore hubs detected yet. Add the card, then edit to configure.";
      this.appendChild(alert);
      return;
    }

    const form = document.createElement("ha-form") as HaFormElement;
    form.hass         = this._hass!;
    form.schema       = this._buildSchema(hubs, nodes);
    form.data         = this._buildData(hubs, nodes);
    form.computeLabel = (s: HaFormSchema) =>
      ("label" in s ? s.label : undefined) ??
      ("title" in s ? s.title : undefined) ??
      s.name;

    form.addEventListener("value-changed", (e: Event) => {
      const value = (e as CustomEvent<{ value: Record<string, unknown> }>).detail.value;
      const newConfig = this._formDataToConfig(value, hubs, nodes);
      this._config = newConfig;
      this.dispatchEvent(
        new CustomEvent("config-changed", { detail: { config: newConfig } })
      );
    });

    this.appendChild(form);
  }
}
