import { test } from "node:test";
import assert from "node:assert/strict";
import { StateWatcher } from "../src/state-watcher.ts";
import type { HomeAssistant } from "../src/types.ts";

type States = HomeAssistant["states"];

const st = (state: string, attributes: Record<string, unknown> = {}, last_changed = "t0") =>
  ({ entity_id: "", state, attributes, last_changed, last_updated: last_changed, context: {} }) as unknown as States[string];

const hass = (states: States, entities: HomeAssistant["entities"] = {}) =>
  ({ states, entities, devices: {} }) as unknown as HomeAssistant;

function setup(rescanMs = 30_000) {
  let clock = 0;
  let matchCalls = 0;
  const w = new StateWatcher(
    (id) => {
      matchCalls++;
      return id.includes("meshcore");
    },
    (s) => `${s.state}@${s.last_changed}`,
    rescanMs,
    () => clock,
  );
  return {
    w,
    tick: (ms: number) => { clock += ms; },
    matchCalls: () => matchCalls,
  };
}

test("first update reports a change even with nothing to watch", () => {
  const { w } = setup();
  assert.equal(w.changed(hass({ "sensor.other": st("1") })), true);
});

test("the same states object is not a change", () => {
  const { w } = setup();
  const h = hass({ "sensor.meshcore_a": st("1") });
  w.changed(h);
  assert.equal(w.changed(h), false);
});

test("an unrelated entity changing is not a change, and triggers no scan", () => {
  const { w, matchCalls } = setup();
  const entities = {};
  const a = st("1");
  w.changed(hass({ "sensor.meshcore_a": a, "sensor.other": st("x") }, entities));
  const before = matchCalls();
  assert.equal(w.changed(hass({ "sensor.meshcore_a": a, "sensor.other": st("y") }, entities)), false);
  assert.equal(matchCalls(), before, "no per-update scan of every entity");
});

test("a watched entity with a new object but the same key is not a change", () => {
  const { w } = setup();
  const entities = {};
  w.changed(hass({ "sensor.meshcore_a": st("1", { rssi: -80 }) }, entities));
  assert.equal(w.changed(hass({ "sensor.meshcore_a": st("1", { rssi: -70 }) }, entities)), false);
});

test("a watched entity whose key changes is a change", () => {
  const { w } = setup();
  const entities = {};
  w.changed(hass({ "sensor.meshcore_a": st("1") }, entities));
  assert.equal(w.changed(hass({ "sensor.meshcore_a": st("2", {}, "t1") }, entities)), true);
});

test("a new entity is picked up at once when the registry changes", () => {
  const { w } = setup();
  w.changed(hass({ "sensor.meshcore_a": st("1") }, {}));
  const next = hass({ "sensor.meshcore_a": st("1"), "sensor.meshcore_b": st("5") }, {});
  assert.equal(w.changed(next), true);
});

test("a new entity outside the registry is picked up by the rescan timer", () => {
  const { w, tick } = setup(30_000);
  const entities = {};
  const a = st("1");
  w.changed(hass({ "sensor.meshcore_a": a }, entities));
  const withB = { "sensor.meshcore_a": a, "sensor.meshcore_b": st("5") };
  assert.equal(w.changed(hass({ ...withB }, entities)), false, "not seen before the rescan");
  tick(30_000);
  assert.equal(w.changed(hass({ ...withB }, entities)), true);
});

test("a watched entity disappearing is a change without waiting for a rescan", () => {
  const { w } = setup();
  const entities = {};
  const a = st("1");
  w.changed(hass({ "sensor.meshcore_a": a, "sensor.meshcore_b": st("2") }, entities));
  assert.equal(w.changed(hass({ "sensor.meshcore_a": a }, entities)), true);
});

test("reset makes the next update a change", () => {
  const { w } = setup();
  const h = hass({ "sensor.meshcore_a": st("1") });
  w.changed(h);
  w.reset();
  assert.equal(w.changed(h), true);
});

test("attribute-based keys see attribute-only updates", () => {
  const w = new StateWatcher(
    (id) => id.endsWith("_contact"),
    (s) => `${s.state}:${s.attributes["out_path"] ?? ""}`,
  );
  const entities = {};
  w.changed(hass({ "binary_sensor.meshcore_x_contact": st("on", { out_path: "a1" }) }, entities));
  assert.equal(w.changed(hass({ "binary_sensor.meshcore_x_contact": st("on", { out_path: "b2" }) }, entities)), true);
});
