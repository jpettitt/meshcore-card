#!/usr/bin/env node
/**
 * Translate src/translations/en.json into fr, nl, de using Claude API (default)
 * or DeepL (TRANSLATE_BACKEND=deepl).
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-... node scripts/translate.mjs
 *   ANTHROPIC_API_KEY=sk-... node scripts/translate.mjs --dry-run
 *   TRANSLATE_BACKEND=deepl DEEPL_API_KEY=... node scripts/translate.mjs
 *
 * Only missing keys are translated — existing translations are preserved.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT   = resolve(__dir, "..");
const SRC    = resolve(ROOT, "src/translations");

const TARGETS = [
  { code: "fr", name: "French" },
  { code: "nl", name: "Dutch" },
  { code: "de", name: "German" },
];

const DRY_RUN = process.argv.includes("--dry-run");
const BACKEND = process.env.TRANSLATE_BACKEND ?? "claude";

// ── Utilities ───────────────────────────────────────────────────────────────

/** Recursively collect all leaf string paths as a flat Map<dotPath, value>. */
function collectLeaves(obj, prefix = "") {
  const out = new Map();
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === "object") {
      for (const [p, s] of collectLeaves(v, path)) out.set(p, s);
    } else if (typeof v === "string") {
      out.set(path, v);
    }
  }
  return out;
}

/** Set a value at a dot-delimited path inside a nested object (mutates). */
function setAtPath(obj, dotPath, value) {
  const parts = dotPath.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!(parts[i] in cur) || typeof cur[parts[i]] !== "object") {
      cur[parts[i]] = {};
    }
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}

/**
 * Replace placeholders ({name}, {n}, <br>, HTML tags) with sentinels «P0» etc.
 * Returns { sanitized, restore }.
 */
function protectTokens(str) {
  const tokens = [];
  const sanitized = str
    .replace(/\{(\w+)\}/g,  (m) => { tokens.push(m); return `«P${tokens.length - 1}»`; })
    .replace(/<[^>]+>/g,    (m) => { tokens.push(m); return `«P${tokens.length - 1}»`; });
  const restore = (s) => s.replace(/«P(\d+)»/g, (_, i) => tokens[Number(i)] ?? `«P${i}»`);
  return { sanitized, restore };
}

/**
 * Ensure trailing whitespace is preserved (some models strip it).
 * If the source ends with spaces, pad the translation to match.
 */
function preserveTrailingSpace(source, translated) {
  const trail = source.match(/\s+$/)?.[0] ?? "";
  return trail ? translated.trimEnd() + trail : translated;
}

// ── Claude backend ───────────────────────────────────────────────────────────

async function translateViaClaude(toTranslate, langName) {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const inputJson = JSON.stringify(Object.fromEntries(toTranslate), null, 2);

  const prompt = `You are a professional translator for software UI strings.
Translate the JSON values below from English into ${langName}.

Rules:
1. Return ONLY a valid JSON object with the exact same keys — no markdown, no explanation.
2. Do NOT translate or modify sentinel tokens matching «P0», «P1», «P2», etc. — copy them verbatim.
3. ALL CAPS labels (e.g. "HUBS", "CONTACTS") must remain ALL CAPS.
4. Very short technical abbreviations (e.g. "MQTT", "Ch1", "SF") must stay unchanged.
5. Preserve leading/trailing whitespace exactly as in the source.
6. Use natural, concise UI language appropriate for a technical dashboard.

Input JSON:
${inputJson}`;

  let raw;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const msg = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2048,
      messages: [{ role: "user", content: prompt }],
    });
    raw = msg.content[0].type === "text" ? msg.content[0].text.trim() : "";
    // Strip optional markdown fences
    raw = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    try {
      JSON.parse(raw);
      break;
    } catch {
      if (attempt === 3) throw new Error(`Claude returned invalid JSON after 3 attempts:\n${raw}`);
      console.warn(`  attempt ${attempt} returned invalid JSON, retrying…`);
    }
  }

  return new Map(Object.entries(JSON.parse(raw)));
}

// ── DeepL backend ────────────────────────────────────────────────────────────

const DEEPL_LANG = { fr: "FR", nl: "NL", de: "DE" };

async function translateViaDeepL(toTranslate, langCode) {
  const { default: deepl } = await import("deepl-node");
  const translator = new deepl.Translator(process.env.DEEPL_API_KEY ?? "");
  const keys    = [...toTranslate.keys()];
  const texts   = [...toTranslate.values()];
  const results = await translator.translateText(texts, "en", DEEPL_LANG[langCode]);
  return new Map(keys.map((k, i) => [k, results[i].text]));
}

// ── Main ─────────────────────────────────────────────────────────────────────

const en = JSON.parse(readFileSync(resolve(SRC, "en.json"), "utf-8"));
const sourceLeaves = collectLeaves(en);

for (const { code, name } of TARGETS) {
  const outPath  = resolve(SRC, `${code}.json`);
  const existing = existsSync(outPath) ? JSON.parse(readFileSync(outPath, "utf-8")) : {};
  const existingLeaves = collectLeaves(existing);

  const missing = new Map(
    [...sourceLeaves].filter(([k]) => !existingLeaves.has(k))
  );

  if (missing.size === 0) {
    console.log(`[${code}] already up to date — skipping`);
    continue;
  }

  console.log(`[${code}] translating ${missing.size} missing keys into ${name}…`);

  // Protect placeholders/HTML
  const sanitized  = new Map();
  const restoreFns = new Map();
  for (const [k, v] of missing) {
    const { sanitized: s, restore } = protectTokens(v);
    sanitized.set(k, s);
    restoreFns.set(k, restore);
  }

  // Call API
  const translated = BACKEND === "deepl"
    ? await translateViaDeepL(sanitized, code)
    : await translateViaClaude(sanitized, name);

  // Restore sentinels + trailing space; merge into existing output
  const merged = structuredClone(existing);
  let count = 0;
  for (const [k, v] of translated) {
    const source   = missing.get(k) ?? "";
    const restored = preserveTrailingSpace(source, restoreFns.get(k)?.(v) ?? v);
    setAtPath(merged, k, restored);
    count++;
  }

  if (DRY_RUN) {
    console.log(`[${code}] DRY RUN (${count} keys):\n${JSON.stringify(merged, null, 2)}\n`);
  } else {
    writeFileSync(outPath, JSON.stringify(merged, null, 2) + "\n", "utf-8");
    console.log(`[${code}] wrote ${outPath}`);
  }
}

console.log("Done.");
