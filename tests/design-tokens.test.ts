import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === "generated") return [];
    const path = join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : /\.(css|tsx?)$/.test(path) ? [path] : [];
  });
}

const official = readFileSync("src/styles/metadeals4u-color-system.css", "utf8");
const theme = readFileSync("src/styles/tailwind-theme.css", "utf8");

test("official brand stylesheet is the only source of literal application colors", () => {
  for (const file of sourceFiles("src")) {
    if (file.endsWith("metadeals4u-color-system.css")) continue;
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /#[\da-f]{3,8}\b|\b(?:rgba?|hsla?|oklch)\(\s*[\d.]/i, relative(".", file));
    assert.doesNotMatch(source, /\b(?:text|bg|border|ring|fill|stroke)-(?:white|black|(?:red|green|orange|purple|violet|gray|slate|zinc|neutral|yellow|amber|emerald|blue)-\d+)/, relative(".", file));
  }
});

test("every consumed official token is defined by the supplied stylesheet", () => {
  const definitions = new Set([...official.matchAll(/(--md-[\w-]+)\s*:/g)].map((match) => match[1]));
  for (const file of sourceFiles("src")) {
    for (const match of readFileSync(file, "utf8").matchAll(/var\((--md-[\w-]+)/g)) {
      assert.ok(definitions.has(match[1]), `${file} references unknown ${match[1]}`);
    }
  }
});

test("Tailwind and future shared UI aliases use the official semantic palette", () => {
  assert.match(theme, /--color-primary:\s*var\(--md-color-primary\)/);
  assert.match(theme, /--color-accent:\s*var\(--md-color-accent\)/);
  assert.match(theme, /--color-chart-1:\s*var\(--md-color-primary\)/);
  assert.match(theme, /--color-sidebar:\s*var\(--md-color-surface\)/);
  assert.match(readFileSync("src/app/globals.css", "utf8"), /@import "\.\.\/styles\/metadeals4u-color-system.css"/);
});

test("dark palette is opt-in, with no system-preference activation", () => {
  assert.match(official, /\[data-theme="dark"\]/);
  assert.match(official, /color-scheme: light/);
  for (const file of sourceFiles("src")) {
    assert.doesNotMatch(readFileSync(file, "utf8"), /prefers-color-scheme:\s*dark|data-theme="dark"\s*>/);
  }
});

test("light homepage tokens use the approved lavender glass direction", () => {
  assert.match(official, /--md-color-primary:\s*var\(--md-purple-600\)/);
  assert.match(official, /--md-color-page:\s*var\(--md-purple-50\)/);
  assert.match(official, /--md-hero-text:\s*var\(--md-purple-950\)/);
  assert.match(official, /--md-hero-highlight:\s*var\(--md-orange-600\)/);
  assert.match(official, /--md-header-bg:\s*rgba\(255,\s*255,\s*255,\s*0\.78\)/);
});
