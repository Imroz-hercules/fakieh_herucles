/**
 * Makes sure the dependencies are actually installed before the app runs.
 *
 *   node scripts/preflight.mjs
 *
 * Wired to `predev` and `prebuild`, so `npm run dev` and `npm run build` call
 * it on their own. Nothing has to be remembered.
 *
 * WHY THIS EXISTS
 * ---------------
 * The 3D plant view added five new dependencies (three, @react-three/fiber,
 * drei, @react-three/postprocessing, postprocessing). The first person to pull
 * that branch and run `npm run dev` without installing got:
 *
 *   Failed to fetch dynamically imported module:
 *   http://localhost:5173/src/pages/water-system/Plant3D.tsx
 *
 * which is a true statement about the symptom and says nothing at all about
 * the cause. The file was there. Vite simply could not TRANSFORM it, because
 * the packages it imports were missing, so the lazy import rejected. The real
 * message — "Failed to resolve import '@react-three/fiber'" — was in the
 * terminal, several screens up, and the browser showed none of it.
 *
 * A missing `npm install` is the most ordinary mistake there is. It should
 * cost a few seconds, not an afternoon of reading a misleading error.
 *
 * WHAT IT DOES AND DOES NOT DO
 * ----------------------------
 * It checks that every declared dependency has a directory in node_modules,
 * and runs `npm install` if any are absent. It does NOT verify versions — that
 * is what the lockfile is for, and re-resolving on every run would be slow and
 * would quietly change what is installed. So this catches "you did not
 * install" and "someone added a dependency since you last did", which are the
 * two cases that actually happen, and deliberately leaves version drift to a
 * deliberate `npm install`.
 *
 * It is a no-op in the normal case: a directory check per package, a few
 * milliseconds, no network.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PKG = join(ROOT, 'package.json');
const MODULES = join(ROOT, 'node_modules');

/*
 * A malformed package.json is reported as itself rather than as a missing
 * dependency. `main` carried a broken one for a while — the scripts block
 * closed with `}` and then a stray comma on its own line — and npm's own error
 * for that is not obvious either.
 */
let pkg;
try {
  pkg = JSON.parse(readFileSync(PKG, 'utf8'));
} catch (err) {
  console.error('\npreflight: package.json is not valid JSON, so nothing can be installed.');
  console.error(`  ${PKG}`);
  console.error(`  ${err.message}\n`);
  process.exit(1);
}

const declared = Object.keys({ ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) });
if (declared.length === 0) {
  console.error('preflight: package.json declares no dependencies — refusing to guess. Check the file.');
  process.exit(1);
}

const missing = declared.filter((name) => !existsSync(join(MODULES, ...name.split('/'))));

if (missing.length === 0) {
  /* Silent on the happy path. A preflight that prints on every run trains
     people to stop reading it, and this one has something worth saying only
     when it acts. */
  process.exit(0);
}

const shown = missing.slice(0, 6).join(', ') + (missing.length > 6 ? `, +${missing.length - 6} more` : '');
console.log(`\npreflight: ${missing.length} package(s) are declared but not installed — ${shown}`);
console.log('preflight: running npm install (this happens once, after a pull that adds dependencies)\n');

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const run = spawnSync(npm, ['install'], { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' });

if (run.status !== 0) {
  console.error('\npreflight: npm install failed. The app will not start until that is fixed.');
  console.error('preflight: the error above is the real one — do not go by whatever the browser says next.\n');
  process.exit(run.status ?? 1);
}

/*
 * Verified, not assumed. npm can exit 0 having installed nothing useful — a
 * stale cache, a partial network failure, an install into the wrong prefix —
 * and letting the app start anyway would put us straight back to a browser
 * error that blames the wrong thing.
 */
const stillMissing = missing.filter((name) => !existsSync(join(MODULES, ...name.split('/'))));
if (stillMissing.length > 0) {
  console.error(`\npreflight: npm install reported success but these are still absent: ${stillMissing.join(', ')}`);
  console.error('preflight: try `npm install --force`, or delete node_modules and install again.\n');
  process.exit(1);
}

console.log('\npreflight: dependencies installed. Continuing.\n');
