import en from "./translations/en.json";

type Dict = typeof en;
const languages: Record<string, Dict> = { en };

export type LocalizeFunc = (key: string, vars?: Record<string, string | number>) => string;

function lookup(obj: unknown, parts: string[]): string | undefined {
  let cur = obj;
  for (const p of parts) {
    if (cur !== null && typeof cur === "object") cur = (cur as Record<string, unknown>)[p];
    else return undefined;
  }
  return typeof cur === "string" ? cur : undefined;
}

export function makeLocalize(lang: string): LocalizeFunc {
  return (key: string, vars?: Record<string, string | number>): string => {
    const parts = key.split(".");
    const dict = languages[lang] ?? languages["en"];
    let val = lookup(dict, parts) ?? lookup(languages["en"], parts);
    if (val === undefined) return key;
    if (vars) val = val.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));
    return val;
  };
}
