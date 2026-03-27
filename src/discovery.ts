import type { HomeAssistant, HubInfo, NodeInfo } from "./types.js";
import { longestCommonPrefix, longestCommonSuffix } from "./helpers.js";

export function discoverHubs(hass: HomeAssistant): HubInfo[] {
  const hubs: Record<string, HubInfo> = {};
  const re = /^sensor\.meshcore_([a-f0-9]+)_node_count(?:_(.+))?$/;
  for (const id of Object.keys(hass.states)) {
    const m = id.match(re);
    if (m && !hubs[m[1]]) {
      hubs[m[1]] = { pubkey: m[1], name: m[2] || m[1], nodeCountEntity: id };
    }
  }
  return Object.values(hubs);
}

export function discoverNodes(hass: HomeAssistant): NodeInfo[] {
  if (!hass.entities || !hass.devices) return [];

  // Map hub device_id → hub pubkey
  const hubDeviceIds = new Set<string>();
  const hubDeviceToPubkey = new Map<string, string>();
  for (const [entityId, info] of Object.entries(hass.entities)) {
    const m = entityId.match(/^sensor\.meshcore_([a-f0-9]+)_node_count/);
    if (m && info.device_id) {
      hubDeviceIds.add(info.device_id);
      hubDeviceToPubkey.set(info.device_id, m[1]);
    }
  }

  // All meshcore devices that are not hub devices
  const meshcoreDeviceIds = new Set<string>();
  for (const [, info] of Object.entries(hass.entities)) {
    if (
      info.platform === "meshcore" &&
      info.device_id &&
      !hubDeviceIds.has(info.device_id)
    ) {
      meshcoreDeviceIds.add(info.device_id);
    }
  }

  const nodes: NodeInfo[] = [];
  for (const deviceId of meshcoreDeviceIds) {
    const device = hass.devices[deviceId];
    if (!device) continue;

    // Resolve parent hub via via_device_id
    const hubPubkey = hubDeviceToPubkey.get(device.via_device_id ?? "") ?? null;

    const deviceEntityIds = Object.entries(hass.entities)
      .filter(([, info]) => info.device_id === deviceId)
      .map(([id]) => id);
    const ePrefix = longestCommonPrefix(deviceEntityIds);
    const eSuffix = longestCommonSuffix(deviceEntityIds);
    nodes.push({
      name: device.name_by_user || device.name || deviceId,
      deviceId,
      hubPubkey,
      ePrefix,
      eSuffix,
    });
  }
  return nodes;
}
