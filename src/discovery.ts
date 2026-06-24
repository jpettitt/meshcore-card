import type { HomeAssistant, HubInfo, NodeInfo } from "./types.js";
import { longestCommonPrefix, longestCommonSuffix } from "./helpers.js";

// Longest suffix shared by at least half of the strings.
//
// Why: a node device's entities mostly end with `_<adv_name_slug>`
// (e.g. `_yuba_crest_repeater`), but a few outliers — like
// `_neighbor_<hex>` and `_neighbor_<hex>_seen` — don't, which makes the
// strict longest-common-suffix collapse to "". A 50%-threshold suffix
// stays robust against those outliers while still being conservative
// enough to avoid false matches on small devices.
function majoritySuffix(strs: string[]): string {
  if (strs.length <= 1) return longestCommonSuffix(strs);
  const half = Math.ceil(strs.length / 2);
  let best = "";
  for (const candidate of strs) {
    // Walk down candidate's possible suffixes from longest. Only check
    // suffixes longer than `best` to avoid wasted work.
    for (let len = candidate.length; len > best.length; len--) {
      const suffix = candidate.slice(-len);
      let count = 0;
      for (const s of strs) if (s.endsWith(suffix)) count++;
      if (count >= half) {
        best = suffix;
        break;
      }
    }
  }
  return best;
}

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

    // Neighbor entities (`..._neighbor_<hex>`, `..._neighbor_<hex>_seen`,
    // `..._neighbor_count`) are keyed by the *neighbor's* pubkey, not the
    // node-name slug every other entity shares. A repeater with many
    // neighbors makes these the majority, which defeats majoritySuffix and
    // collapses eSuffix — so entity lookups fail and the node renders
    // offline. Exclude them when deriving the prefix/suffix; fall back to the
    // full list if a device somehow exposes nothing else.
    const slugEntityIds = deviceEntityIds.filter(
      (id) => !/_neighbor_(?:count$|[0-9a-f]+(?:_seen)?$)/.test(id)
    );
    const suffixSource = slugEntityIds.length ? slugEntityIds : deviceEntityIds;
    const ePrefix = longestCommonPrefix(suffixSource);
    const eSuffix = majoritySuffix(suffixSource);
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
