import type { HassEntities } from "home-assistant-js-websocket";

// ── Home Assistant registry types ────────────────────────────────────────────

export interface HassEntityRegistryEntry {
  entity_id: string;
  device_id: string | null;
  platform: string;
  name: string | null;
  icon: string | null;
  disabled_by: string | null;
}

export interface HassDeviceRegistryEntry {
  id: string;
  name: string | null;
  name_by_user: string | null;
  manufacturer: string | null;
  model: string | null;
}

/** The `hass` object passed to Lovelace custom cards by the HA frontend. */
export interface HomeAssistant {
  states: HassEntities;
  entities: Record<string, HassEntityRegistryEntry>;
  devices: Record<string, HassDeviceRegistryEntry>;
  themes: Record<string, unknown>;
  language: string;
  locale: { language: string };
}

// ── Card config types ─────────────────────────────────────────────────────────

export interface HubConfig {
  enabled?: boolean;
  battery_entity?: string;
  voltage_entity?: string;
}

export interface NodeConfig {
  enabled?: boolean;
  battery_entity?: string;
  voltage_entity?: string;
  location_entity?: string;
}

export interface GridOptions {
  rows?: number;
  columns?: number;
  min_rows?: number;
  max_rows?: number;
}

export interface MeshcoreCardConfig {
  type?: string;
  hubs?: Record<string, HubConfig | boolean>;
  nodes?: Record<string, NodeConfig | boolean>;
  grid_options?: GridOptions;
}

export interface MeshcoreContactCardConfig {
  type?: string;
  max_contact_age_days?: number;
  grid_options?: GridOptions;
}

// ── Discovery result types ────────────────────────────────────────────────────

export interface HubInfo {
  pubkey: string;
  name: string;
  nodeCountEntity: string;
}

export interface NodeInfo {
  name: string;
  deviceId: string;
  ePrefix: string;
  eSuffix: string;
}

// ── Render helper types ───────────────────────────────────────────────────────

export interface TrafficCell {
  label: string;
  id: string | null;
  cls: string;
}

export interface TelemetryCell {
  label: string;
  id: string | null;
  unit: string;
}

// ── ha-form element types ─────────────────────────────────────────────────────

export interface HaFormSelector {
  boolean?: Record<string, never>;
  entity?: {
    domain?: string;
    include_entities?: string[];
  };
}

export interface HaFormFieldSchema {
  name: string;
  label?: string;
  selector: HaFormSelector;
}

export interface HaFormExpandableSchema {
  type: "expandable";
  name: string;
  title: string;
  schema: HaFormFieldSchema[];
}

export type HaFormSchema = HaFormFieldSchema | HaFormExpandableSchema;

export interface HaFormElement extends HTMLElement {
  hass: HomeAssistant;
  schema: HaFormSchema[];
  data: Record<string, unknown>;
  computeLabel: (schema: HaFormSchema) => string;
}

export interface HaAlertElement extends HTMLElement {
  alertType: "info" | "warning" | "error" | "success";
}

// ── Window augmentation ───────────────────────────────────────────────────────

export interface CustomCardEntry {
  type: string;
  name: string;
  description: string;
  preview: boolean;
  documentationURL?: string;
}

declare global {
  interface Window {
    customCards: CustomCardEntry[];
  }
}
