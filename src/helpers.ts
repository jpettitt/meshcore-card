// Escape any string that originates from outside the card (HA entity state,
// HA attributes, mesh radio adv_name, raw event payloads, etc.) before it is
// interpolated into an innerHTML template literal. Without this, a hostile
// node operator can inject arbitrary HTML/JS via fields like adv_name —
// the meshcore firmware does not validate or sanitize these strings, and
// neither the meshcore_py SDK nor the HA integration escape them.
export function escapeHtml(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function longestCommonPrefix(strs: string[]): string {
  if (!strs.length) return "";
  let i = 0;
  while (i < strs[0].length && strs.every((s) => s[i] === strs[0][i])) i++;
  return strs[0].slice(0, i);
}

export function longestCommonSuffix(strs: string[]): string {
  const rev = strs.map((s) => [...s].reverse().join(""));
  return [...longestCommonPrefix(rev)].reverse().join("");
}

export function isOnlineState(v: unknown): boolean {
  // "on" covers binary_sensor connectivity entities (e.g. *_online_*),
  // which the meshcore-ha integration uses for repeater status.
  return ["online", "connected", "on", "1", "true"].includes(
    String(v).toLowerCase()
  );
}

export function formatLastSeen(
  ts: string | number | null | undefined,
  t: (key: string, vars?: Record<string, string | number>) => string
): string | null {
  if (!ts || ts === "unknown" || ts === "unavailable") return null;
  const diff = Math.floor(Date.now() / 1000 - Number(ts));
  if (isNaN(diff) || diff < 0) return null;
  if (diff < 60) return t("time.s_ago", { n: diff });
  if (diff < 3600) return t("time.m_ago", { n: Math.floor(diff / 60) });
  if (diff < 86400) return t("time.h_ago", { n: Math.floor(diff / 3600) });
  return t("time.d_ago", { n: Math.floor(diff / 86400) });
}

export function batteryColor(pct: string | number | null): string {
  const v = Number(pct);
  if (isNaN(v)) return "var(--secondary-text-color)";
  if (v >= 50) return "var(--success-color, #4caf50)";
  if (v >= 20) return "var(--warning-color, #ff9800)";
  return "var(--error-color, #f44336)";
}

export type ColorClass = "green" | "yellow" | "red" | "dim";

export function batteryClass(pct: string | number | null): ColorClass {
  const v = Number(pct);
  if (isNaN(v)) return "dim";
  if (v >= 50) return "green";
  if (v >= 20) return "yellow";
  return "red";
}

export function formatUptime(
  days: string | number | null | undefined
): string | null {
  const v = parseFloat(String(days));
  if (isNaN(v) || v < 0) return null;
  const d = Math.floor(v);
  const h = Math.floor((v - d) * 24);
  if (d > 0) return `${d}d ${h}h`;
  return `${h}h`;
}

export function rssiClass(rssi: string | number | null): ColorClass {
  const v = Number(rssi);
  if (isNaN(v)) return "dim";
  if (v >= -70) return "green";
  if (v >= -90) return "yellow";
  return "red";
}
