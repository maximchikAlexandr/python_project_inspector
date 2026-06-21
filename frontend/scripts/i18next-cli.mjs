import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const projectRoot = dirname(root);
const sourceRoot = join(projectRoot, "src");
const localesRoot = join(sourceRoot, "locales");
const localeFile = (language) => join(localesRoot, language, "translation.json");

async function listSourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "locales") {
          return [];
        }
        return listSourceFiles(path);
      }
      return [".ts", ".tsx"].includes(extname(entry.name)) ? [path] : [];
    }),
  );
  return nested.flat();
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf-8"));
  } catch {
    return {};
  }
}

function collectKeys(source, path) {
  const keys = new Map();
  const matcher = /\bt\(\s*["']([^"']+)["']\s*,\s*["']([^"']*)["']/g;
  for (const match of source.matchAll(matcher)) {
    const [, key, fallback] = match;
    if (keys.has(key) && keys.get(key) !== fallback) {
      throw new Error(`Duplicate i18n key with different fallback: ${key} in ${relative(projectRoot, path)}`);
    }
    keys.set(key, fallback);
  }
  return keys;
}

function sortedObject(entries) {
  return Object.fromEntries([...entries].sort(([left], [right]) => left.localeCompare(right)));
}

async function extract() {
  const files = await listSourceFiles(sourceRoot);
  const extracted = new Map();
  for (const file of files) {
    const keys = collectKeys(await readFile(file, "utf-8"), file);
    for (const [key, fallback] of keys) {
      if (extracted.has(key) && extracted.get(key) !== fallback) {
        throw new Error(`Duplicate i18n key with different fallback: ${key}`);
      }
      extracted.set(key, fallback);
    }
  }

  const previousRu = await readJson(localeFile("ru"));
  const enEntries = [...extracted].map(([key, fallback]) => [key, fallback]);
  const ruEntries = [...extracted].map(([key, fallback]) => [key, previousRu[key] ?? fallback]);

  await mkdir(dirname(localeFile("en")), { recursive: true });
  await mkdir(dirname(localeFile("ru")), { recursive: true });
  await writeFile(localeFile("en"), `${JSON.stringify(sortedObject(enEntries), null, 2)}\n`);
  await writeFile(localeFile("ru"), `${JSON.stringify(sortedObject(ruEntries), null, 2)}\n`);
  console.log(`Extracted ${extracted.size} keys to src/locales/{en,ru}/translation.json`);
}

const command = process.argv[2];
if (command !== "extract") {
  console.error("Usage: i18next-cli extract");
  process.exit(1);
}

await extract();
