import en from "../locales/en/translation.json";
import ru from "../locales/ru/translation.json";

type Language = "en" | "ru";
type Vars = Record<string, string | number | null | undefined>;

const resources: Record<Language, Record<string, string>> = { en, ru };

function currentLanguage(): Language {
  const stored = window.localStorage.getItem("ppi.language");
  if (stored === "en" || stored === "ru") {
    return stored;
  }
  return "ru";
}

export function t(key: string, fallback: string, vars: Vars = {}): string {
  const template = resources[currentLanguage()][key] ?? resources.en[key] ?? fallback;
  return template.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(vars[name] ?? ""));
}
