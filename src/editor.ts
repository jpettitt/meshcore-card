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
import { makeLocalize } from "./localize.js";

interface EditorHubInfo extends HubInfo {}
interface EditorNodeInfo extends NodeInfo {}

const NODE_EDITOR_STYLES = `
  .node-list { display: flex; flex-direction: column; gap: 4px; padding: 8px 0; }
  .node-list-label { font-size: 12px; font-weight: 500; color: var(--secondary-text-color);
    text-transform: uppercase; letter-spacing: 0.05em; padding: 4px 16px 0; }
  .node-row { display: flex; align-items: flex-start; gap: 4px;
    background: var(--card-background-color, var(--ha-card-background));
    border: 1px solid var(--divider-color); border-radius: 8px; overflow: hidden; }
  .node-row.drag-over { outline: 2px solid var(--primary-color); }
  .drag-handle { flex-shrink: 0; padding: 14px 4px 0 8px;
    color: var(--secondary-text-color); cursor: grab; touch-action: none; }
  .drag-handle:active { cursor: grabbing; }
  .node-panel { flex: 1; min-width: 0; }
`;

export class MeshcoreCardEditor extends HTMLElement {
  private _hass?: HomeAssistant;
  private _config?: MeshcoreCardConfig;
  private _discoveryFp = "";
  private _hubForm: HaFormElement | null = null;
  private _nodeList: HTMLElement | null = null;
  private _nodeForms = new Map<string, HaFormElement>();
  private _expandedNodes = new Set<string>();

  setConfig(config: MeshcoreCardConfig): void {
    this._config = { ...config };
    this._renderEditor();
  }

  set hass(hass: HomeAssistant) {
    this._hass = hass;
    if (this._hubForm) this._hubForm.hass = hass;
    for (const form of this._nodeForms.values()) form.hass = hass;
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
    return discoverHubs(this._hass).map((h) => ({ ...h, name: h.name.replace(/_/g, " ") }));
  }

  private _discoverNodes(): EditorNodeInfo[] {
    if (!this._hass) return [];
    return discoverNodes(this._hass);
  }

  // ── Config helpers ─────────────────────────────────────────────────────────

  private _getCfgObj(kind: "hub" | "node", key: string): HubConfig | NodeConfig {
    const map = kind === "hub" ? (this._config?.hubs ?? {}) : (this._config?.nodes ?? {});
    const v = map[key];
    if (v && typeof v === "object") return { ...v } as HubConfig | NodeConfig;
    return { enabled: v !== false };
  }

  private _dispatchConfig(cfg: MeshcoreCardConfig): void {
    this._config = cfg;
    this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: cfg } }));
  }

  // ── Hub schema / data ──────────────────────────────────────────────────────

  private _hubSchema(hubs: EditorHubInfo[]): HaFormSchema[] {
    const t = makeLocalize(this._hass?.language ?? this._hass?.locale?.language ?? "en");
    const dcSel = (ids: string[], dc: string) =>
      (ids.length
        ? { entity: { include_entities: ids, device_class: dc } }
        : { entity: { domain: "sensor", device_class: dc } }) as never;

    return hubs.map((h) => {
      const ids = Object.keys(this._hass?.states ?? {}).filter((id) => id.includes(h.pubkey));
      return {
        type: "expandable",
        name: `hub__${h.pubkey}`,
        title: t("editor.hub_section_title", { name: h.name, key: h.pubkey }),
        schema: [
          { name: "enabled",        label: t("editor.show_this_hub"),  selector: { boolean: {} } },
          { name: "battery_entity", label: t("editor.battery_entity"), selector: dcSel(ids, "battery") },
          { name: "voltage_entity", label: t("editor.voltage_entity"), selector: dcSel(ids, "voltage") },
        ],
      } as HaFormExpandableSchema;
    });
  }

  private _hubData(hubs: EditorHubInfo[]): Record<string, unknown> {
    const data: Record<string, unknown> = {};
    for (const hub of hubs) {
      const cfg = this._getCfgObj("hub", hub.pubkey) as HubConfig;
      data[`hub__${hub.pubkey}`] = {
        enabled:        cfg.enabled !== false,
        battery_entity: cfg.battery_entity ?? null,
        voltage_entity: cfg.voltage_entity ?? null,
      };
    }
    return data;
  }

  // ── Node schema / data ─────────────────────────────────────────────────────

  private _nodeSchema(n: EditorNodeInfo): HaFormSchema[] {
    const t  = makeLocalize(this._hass?.language ?? this._hass?.locale?.language ?? "en");
    const meshcoreIds = this._hass?.entities
      ? Object.entries(this._hass.entities)
          .filter(([, info]) => info.platform === "meshcore")
          .map(([id]) => id)
      : [];
    const ids = this._hass?.entities
      ? Object.entries(this._hass.entities)
          .filter(([, info]) => info.device_id === n.deviceId)
          .map(([id]) => id)
      : [];
    // Strict device_class filter for well-standardised entities
    const dcSel = (dc: string) =>
      (ids.length
        ? { entity: { include_entities: ids, device_class: dc } }
        : { entity: { domain: "sensor", device_class: dc } }) as never;
    // Device-scoped selector without device_class — for sensors that may only have state_class: measurement
    const devSel = ids.length
      ? { entity: { include_entities: ids } }
      : { entity: { domain: "sensor" } };
    const locSel = meshcoreIds.length
      ? { entity: { include_entities: meshcoreIds } }
      : { entity: { domain: "sensor" } };

    return [
      { name: "enabled",            label: t("editor.show_this_node"),     selector: { boolean: {} } },
      { name: "battery_entity",     label: t("editor.battery_entity"),     selector: dcSel("battery") },
      { name: "voltage_entity",     label: t("editor.voltage_entity"),     selector: dcSel("voltage") },
      { name: "location_entity",    label: t("editor.location_entity"),    selector: locSel },
      { name: "temperature_entity", label: t("editor.temperature_entity"), selector: devSel },
      { name: "humidity_entity",    label: t("editor.humidity_entity"),    selector: devSel },
      { name: "illuminance_entity", label: t("editor.illuminance_entity"), selector: devSel },
      { name: "pressure_entity",    label: t("editor.pressure_entity"),    selector: devSel },
    ];
  }

  private _nodeData(n: EditorNodeInfo): Record<string, unknown> {
    const cfg = this._getCfgObj("node", n.name) as NodeConfig;
    return {
      enabled:            cfg.enabled !== false,
      battery_entity:     cfg.battery_entity     ?? null,
      voltage_entity:     cfg.voltage_entity     ?? null,
      location_entity:    cfg.location_entity    ?? null,
      temperature_entity: cfg.temperature_entity ?? null,
      humidity_entity:    cfg.humidity_entity    ?? null,
      illuminance_entity: cfg.illuminance_entity ?? null,
      pressure_entity:    cfg.pressure_entity    ?? null,
    };
  }

  private _nodeFormDataToConfig(name: string, d: Record<string, unknown>): void {
    const obj: NodeConfig = { enabled: d["enabled"] !== false };
    if (d["battery_entity"])     obj.battery_entity     = d["battery_entity"]     as string;
    if (d["voltage_entity"])     obj.voltage_entity     = d["voltage_entity"]     as string;
    if (d["location_entity"])    obj.location_entity    = d["location_entity"]    as string;
    if (d["temperature_entity"]) obj.temperature_entity = d["temperature_entity"] as string;
    if (d["humidity_entity"])    obj.humidity_entity    = d["humidity_entity"]    as string;
    if (d["illuminance_entity"]) obj.illuminance_entity = d["illuminance_entity"] as string;
    if (d["pressure_entity"])    obj.pressure_entity    = d["pressure_entity"]    as string;
    this._dispatchConfig({
      ...this._config,
      nodes: { ...(this._config?.nodes ?? {}), [name]: obj },
    });
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  private _renderEditor(): void {
    if (!this._config) return;

    const hubs  = this._discoverHubs();
    const nodes = this._discoverNodes();

    if (!hubs.length) {
      this._hubForm?.remove();   this._hubForm = null;
      this._nodeList?.remove();  this._nodeList = null;
      this._nodeForms.clear();
      if (!this.querySelector("ha-alert")) {
        while (this.lastChild) this.removeChild(this.lastChild);
        const t = makeLocalize(this._hass?.language ?? this._hass?.locale?.language ?? "en");
        const alert = document.createElement("ha-alert") as HaAlertElement;
        alert.alertType = "info";
        alert.textContent = t("editor.no_hubs_detected");
        this.appendChild(alert);
      }
      return;
    }

    this.querySelector("ha-alert")?.remove();

    // ── Hub form ───────────────────────────────────────────────────────────
    if (!this._hubForm) {
      this._hubForm = document.createElement("ha-form") as HaFormElement;
      this._hubForm.computeLabel = (s: HaFormSchema) =>
        ("label" in s ? s.label : undefined) ?? ("title" in s ? s.title : undefined) ?? s.name;
      this._hubForm.addEventListener("value-changed", (e: Event) => {
        const value = (e as CustomEvent<{ value: Record<string, unknown> }>).detail.value;
        const h = this._discoverHubs();
        const cfg: MeshcoreCardConfig = { ...this._config };
        for (const hub of h) {
          const d = (value[`hub__${hub.pubkey}`] ?? {}) as Record<string, unknown>;
          const obj: HubConfig = { enabled: d["enabled"] !== false };
          if (d["battery_entity"]) obj.battery_entity = d["battery_entity"] as string;
          if (d["voltage_entity"]) obj.voltage_entity = d["voltage_entity"] as string;
          cfg.hubs = { ...(cfg.hubs ?? {}), [hub.pubkey]: obj };
        }
        this._dispatchConfig(cfg);
      });
      this.appendChild(this._hubForm);
    }
    this._hubForm.hass   = this._hass!;
    this._hubForm.schema = this._hubSchema(hubs);
    this._hubForm.data   = this._hubData(hubs);

    // ── Node list ──────────────────────────────────────────────────────────
    if (!this.querySelector("style.node-editor-styles")) {
      const style = document.createElement("style");
      style.className = "node-editor-styles";
      style.textContent = NODE_EDITOR_STYLES;
      this.appendChild(style);
    }

    if (!this._nodeList) {
      this._nodeList = document.createElement("div");
      this._nodeList.className = "node-list";
      const t = makeLocalize(this._hass?.language ?? this._hass?.locale?.language ?? "en");
      if (nodes.length > 1) {
        const label = document.createElement("div");
        label.className = "node-list-label";
        label.textContent = t("editor.node_order_label");
        this._nodeList.prepend(label);
      }
      this.appendChild(this._nodeList);
    }

    const order = this._config?.nodes_order ?? [];
    const sortedNodes = [...nodes].sort((a, b) => {
      const ia = order.indexOf(a.name);
      const ib = order.indexOf(b.name);
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    });

    // Remove rows for nodes that no longer exist
    for (const name of [...this._nodeForms.keys()]) {
      if (!nodes.find((n) => n.name === name)) {
        this._nodeList.querySelector(`[data-name="${CSS.escape(name)}"]`)?.remove();
        this._nodeForms.delete(name);
      }
    }

    // Build/update rows in sorted order
    for (const node of sortedNodes) {
      let row = this._nodeList.querySelector<HTMLElement>(`.node-row[data-name="${CSS.escape(node.name)}"]`);

      if (!row) {
        row = this._createNodeRow(node);
      }

      // Ensure expansion panel reflects tracked expanded state
      const panel = row.querySelector("ha-expansion-panel") as (HTMLElement & { expanded?: boolean }) | null;
      if (panel) panel.expanded = this._expandedNodes.has(node.name);

      // Update form schema/data
      const form = this._nodeForms.get(node.name)!;
      form.hass   = this._hass!;
      form.schema = this._nodeSchema(node);
      form.data   = this._nodeData(node);

      // Move to end to match sorted order (no-op if already in order)
      this._nodeList.appendChild(row);
    }
  }

  private _createNodeRow(node: EditorNodeInfo): HTMLElement {
    const row = document.createElement("div");
    row.className = "node-row";
    row.dataset["name"] = node.name;

    // Drag handle
    const handle = document.createElement("ha-icon") as HTMLElement;
    handle.className = "drag-handle";
    (handle as HTMLElement & { icon?: string }).icon = "mdi:drag-vertical";
    row.appendChild(handle);

    // Expansion panel
    const panel = document.createElement("ha-expansion-panel") as HTMLElement & {
      expanded?: boolean;
      header?: string;
    };
    panel.className = "node-panel";
    panel.setAttribute("header", node.name.replace(/_/g, " "));
    panel.expanded = this._expandedNodes.has(node.name);
    panel.addEventListener("expanded-changed", (e: Event) => {
      const expanded = (e as CustomEvent<{ value: boolean }>).detail.value;
      if (expanded) this._expandedNodes.add(node.name);
      else          this._expandedNodes.delete(node.name);
    });

    // Per-node ha-form inside the panel
    const form = document.createElement("ha-form") as HaFormElement;
    form.hass         = this._hass!;
    form.schema       = this._nodeSchema(node);
    form.data         = this._nodeData(node);
    form.computeLabel = (s: HaFormSchema) =>
      ("label" in s ? s.label : undefined) ?? s.name;
    form.addEventListener("value-changed", (e: Event) => {
      e.stopPropagation(); // prevent bubbling into hub form
      const value = (e as CustomEvent<{ value: Record<string, unknown> }>).detail.value;
      this._nodeFormDataToConfig(node.name, value);
    });
    this._nodeForms.set(node.name, form);
    panel.appendChild(form);
    row.appendChild(panel);

    // Drag-and-drop on the row (only initiated from handle)
    row.setAttribute("draggable", "true");
    row.addEventListener("dragstart", (e: DragEvent) => {
      if (!(e.target as Element).closest(".drag-handle")) { e.preventDefault(); return; }
      row!.style.opacity = "0.4";
      e.dataTransfer?.setData("text/plain", node.name);
    });
    row.addEventListener("dragend",  () => { row!.style.opacity = ""; this._clearDragOver(); });
    row.addEventListener("dragover", (e) => { e.preventDefault(); row!.classList.add("drag-over"); });
    row.addEventListener("dragleave", () => row!.classList.remove("drag-over"));
    row.addEventListener("drop", (e) => {
      e.preventDefault();
      const fromName = e.dataTransfer?.getData("text/plain") ?? "";
      if (!fromName || fromName === node.name) return;
      this._reorder(fromName, node.name);
    });

    return row;
  }

  private _clearDragOver(): void {
    this._nodeList?.querySelectorAll(".drag-over").forEach((el) => el.classList.remove("drag-over"));
  }

  private _reorder(fromName: string, toName: string): void {
    const nodes = this._discoverNodes();
    const order = this._config?.nodes_order ?? nodes.map((n) => n.name);
    const filled = nodes.map((n) => n.name).map((name) => order.includes(name) ? name : name);
    // Build full order list ensuring all nodes are present
    const allNames = nodes.map((n) => n.name);
    const current = allNames.sort((a, b) => {
      const ia = order.indexOf(a); const ib = order.indexOf(b);
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    });
    void filled;
    const from = current.indexOf(fromName);
    const to   = current.indexOf(toName);
    if (from === -1 || to === -1) return;
    const newOrder = [...current];
    const [moved] = newOrder.splice(from, 1);
    newOrder.splice(to, 0, moved);
    this._dispatchConfig({ ...this._config, nodes_order: newOrder });
  }
}
