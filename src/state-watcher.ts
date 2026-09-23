import type { HomeAssistant } from "./types.js";

type HassState = HomeAssistant["states"][string];

// HA hands every card a new `hass` on each state change anywhere in the install
// (~20/s on a 5,000-entity system), so scanning every entity per update to decide
// whether to re-render costs more than the render it gates. This keeps the list of
// matching ids and only looks at those; HA replaces a state object whenever that
// entity changes, so an unchanged reference needs no comparison at all.
export class StateWatcher {
  private readonly match: (entityId: string) => boolean;
  private readonly key: (state: HassState) => string;
  private readonly rescanMs: number;
  private readonly now: () => number;
  private ids: string[] = [];
  private seen = new Map<string, { state: HassState | undefined; key: string }>();
  private prevStates?: HomeAssistant["states"];
  private prevEntities?: HomeAssistant["entities"];
  private lastScan = -Infinity;
  private first = true;

  constructor(
    match: (entityId: string) => boolean,
    key: (state: HassState) => string,
    rescanMs = 30_000,
    now: () => number = Date.now,
  ) {
    this.match = match;
    this.key = key;
    this.rescanMs = rescanMs;
    this.now = now;
  }

  /** Forget everything, so the next update reports a change (e.g. after setConfig). */
  reset(): void {
    this.ids = [];
    this.seen.clear();
    this.prevStates = undefined;
    this.prevEntities = undefined;
    this.lastScan = -Infinity;
    this.first = true;
  }

  /** True when a matching entity appeared, disappeared, or its key changed. */
  changed(hass: HomeAssistant): boolean {
    const states = hass.states;
    if (states === this.prevStates) return false;
    this.prevStates = states;
    let changed = this.first;
    this.first = false;

    // New entities are registered before they report state, so a registry change is
    // the prompt signal; the timer is a backstop for entities without a registry entry.
    const t = this.now();
    if (hass.entities !== this.prevEntities || t - this.lastScan >= this.rescanMs) {
      this.prevEntities = hass.entities;
      this.lastScan = t;
      const ids = Object.keys(states).filter(this.match);
      if (ids.length !== this.ids.length || ids.some((id, i) => id !== this.ids[i])) {
        changed = true;
        const keep = new Set(ids);
        for (const id of this.seen.keys()) if (!keep.has(id)) this.seen.delete(id);
      }
      this.ids = ids;
    }

    for (const id of this.ids) {
      const state = states[id];
      const prev = this.seen.get(id);
      if (prev && prev.state === state) continue;
      const key = state ? this.key(state) : "";
      if (!prev || prev.key !== key) changed = true;
      this.seen.set(id, { state, key });
    }
    return changed;
  }
}
