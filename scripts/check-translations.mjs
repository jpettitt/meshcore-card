#!/usr/bin/env node
/**
 * Checks that fr.json, nl.json, de.json contain all keys present in en.json.
 * Exits with code 1 if any keys are missing — suitable for CI.
 *
 * Usage:
 *   node scripts/check-translations.mjs
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const SRC   = resolve(__dir, "..", "src/translations");
const LANGS = ["fr", "nl", "de"];

function collectLeaves(obj, prefix = "") {
  const out = new Set();
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === "object") {
      for (const p of collectLeaves(v, path)) out.add(p);
    } else if (typeof v === "string") {
      out.add(path);
    }
  }
  return out;
}

const en     = JSON.parse(readFileSync(resolve(SRC, "en.json"), "utf-8"));
const enKeys = collectLeaves(en);

let failed = false;

for (const lang of LANGS) {
  const path = resolve(SRC, `${lang}.json`);
  if (!existsSync(path)) {
    console.error(`[${lang}] MISSING — file not found: ${path}`);
    failed = true;
    continue;
  }
  const obj     = JSON.parse(readFileSync(path, "utf-8"));
  const present = collectLeaves(obj);
  const missing = [...enKeys].filter((k) => !present.has(k));
  if (missing.length) {
    console.error(`[${lang}] MISSING ${missing.length} key(s):`);
    for (const k of missing) console.error(`  - ${k}`);
    failed = true;
  } else {
    console.log(`[${lang}] OK — all ${enKeys.size} keys present`);
  }
}

process.exit(failed ? 1 : 0);
