#!/usr/bin/env node
/**
 * Fail when the committed OpenAPI types no longer match the running backend.
 *
 * The contract is the thing that broke this console twice: a brief listed
 * endpoints that were never deployed, and a response shape changed under a
 * strict parser. Neither was visible until a screen went blank.
 *
 * Committing `src/api/schema.d.ts` and diffing it against a live
 * `/openapi.json` turns both into a reviewable diff — the contract change shows
 * up in a pull request, before it can blank anything.
 *
 * Skipped (exit 0) when no backend is reachable, so a laptop with nothing
 * running and a PR from a fork do not fail for the wrong reason. Point it at a
 * backend with API_URL=... to make it authoritative.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const API_URL = process.env.API_URL ?? 'http://localhost:8000';
const COMMITTED = 'src/api/schema.d.ts';
const scratch = join(tmpdir(), `civitas-schema-${process.pid}.d.ts`);

async function reachable() {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(`${API_URL}/openapi.json`, { signal: controller.signal });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

if (!(await reachable())) {
  console.log(`[schema] no backend at ${API_URL} — skipping drift check.`);
  process.exit(0);
}

try {
  execFileSync('npx', ['--yes', 'openapi-typescript@7', `${API_URL}/openapi.json`, '-o', scratch], {
    stdio: ['ignore', 'ignore', 'inherit'],
  });

  const live = readFileSync(scratch, 'utf8');
  const committed = readFileSync(COMMITTED, 'utf8');

  if (live === committed) {
    console.log(`[schema] ${COMMITTED} matches ${API_URL}.`);
    process.exit(0);
  }

  console.error(
    `\n[schema] DRIFT: ${COMMITTED} does not match ${API_URL}.\n` +
      `The backend contract changed. Regenerate and READ THE DIFF — that diff is the\n` +
      `contract change, and it is the only warning you get before a screen breaks:\n\n` +
      `  npm run schema:gen\n`,
  );
  process.exit(1);
} finally {
  rmSync(scratch, { force: true });
}
