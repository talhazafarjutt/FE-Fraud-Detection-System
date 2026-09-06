import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const CSS = readFileSync(path.resolve(__dirname, '../src/styles/theme.css'), 'utf8');

/** Pull the custom properties declared inside one selector block. */
function tokensIn(startMarker: string): Set<string> {
  const start = CSS.indexOf(startMarker);
  if (start === -1) throw new Error(`block not found: ${startMarker}`);
  const open = CSS.indexOf('{', start);
  let depth = 0;
  let end = open;
  for (let i = open; i < CSS.length; i++) {
    if (CSS[i] === '{') depth++;
    if (CSS[i] === '}') {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  const body = CSS.slice(open, end);
  return new Set([...body.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]!));
}

describe('theme palettes', () => {
  const light = tokensIn(':root {');
  const explicitDark = tokensIn(":root[data-theme='dark'] {");
  const systemDark = tokensIn(":root:not([data-theme='light'])");

  it('every colour token in light has a dark counterpart', () => {
    // The classic dark-mode bug: a token defined only in the light block keeps
    // its light value on a dark ground and becomes invisible.
    const colourish = [...light].filter(
      (t) =>
        !t.startsWith('--display') &&
        !t.startsWith('--body') &&
        !t.startsWith('--mono') &&
        t !== '--maxw' &&
        t !== '--pad',
    );
    const missing = colourish.filter((t) => !explicitDark.has(t));
    expect(missing).toEqual([]);
  });

  it('the explicit and system dark blocks define exactly the same tokens', () => {
    // They must not drift; a token in one and not the other means the OS-dark
    // user and the toggle-dark user see different pages.
    expect([...explicitDark].sort()).toEqual([...systemDark].sort());
  });

  it('the system-dark block is guarded so an explicit light choice wins', () => {
    expect(CSS).toContain("@media (prefers-color-scheme: dark)");
    expect(CSS).toMatch(/:root:not\(\[data-theme='light'\]\)/);
  });

  it('declares color-scheme in both palettes so form controls follow', () => {
    expect(CSS).toMatch(/color-scheme:\s*light/);
    expect(CSS).toMatch(/color-scheme:\s*dark/);
  });

  it('suppresses transitions across a theme switch', () => {
    // Without this Chromium keeps painting the previous palette when the var()
    // behind a transitioned property changes.
    expect(CSS).toMatch(/html\.theme-switching/);
    expect(CSS).toMatch(/transition:\s*none\s*!important/);
  });

  it('keeps the sharp-corner rule in both modes', () => {
    // Dark mode must not become an excuse to soften the design language.
    const radii = [...CSS.matchAll(/border-radius:\s*([^;]+);/g)].map((m) => m[1]!.trim());
    for (const radius of radii) {
      expect(['0', 'none', '50%', '9999px']).toContain(radius);
    }
  });

  it('light remains the default — no data-theme means light unless the OS says dark', () => {
    // The brief specifies a light console; dark is opt-in.
    const rootBlock = CSS.slice(CSS.indexOf(':root {'), CSS.indexOf('}', CSS.indexOf(':root {')));
    expect(rootBlock).toMatch(/--paper:\s*#e3e6e0/i);
    expect(rootBlock).toMatch(/--ultra:\s*#22318e/i);
  });
});
