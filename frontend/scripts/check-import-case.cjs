/**
 * Finds relative imports whose letter case doesn't match the file on disk.
 * Windows and macOS ignore the difference; Linux builds fail on it.
 *
 *   node scripts/check-import-case.cjs
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src');
const EXTS = ['', '.jsx', '.js', '.tsx', '.ts', '.json', '/index.jsx', '/index.js'];
const IMPORT_RE = /(?:import[^'"]*from\s*|import\s*\(\s*|require\s*\(\s*)['"](\.{1,2}\/[^'"]+)['"]/g;

const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const full = path.join(dir, e.name);
  if (e.isDirectory()) return e.name === 'node_modules' ? [] : walk(full);
  return /\.(jsx?|tsx?)$/.test(e.name) && !e.name.includes(' - Copy') ? [full] : [];
});

/** Exact-case existence check, segment by segment. */
const existsExact = (target) => {
  const parts = path.relative(SRC, target).split(path.sep);
  let dir = SRC;
  for (const part of parts) {
    if (part === '..') { dir = path.dirname(dir); continue; }
    let entries;
    try { entries = fs.readdirSync(dir); } catch { return false; }
    if (!entries.includes(part)) return false;
    dir = path.join(dir, part);
  }
  return true;
};

let problems = 0;
for (const file of walk(SRC)) {
  const code = fs.readFileSync(file, 'utf8');
  for (const m of code.matchAll(IMPORT_RE)) {
    const spec = m[1];
    const base = path.resolve(path.dirname(file), spec);
    const candidates = EXTS.map((e) => base + e);
    const anyCase = candidates.find((c) => fs.existsSync(c));
    if (!anyCase) continue; // not a file import we can resolve (e.g. css handled elsewhere)
    if (!candidates.some((c) => fs.existsSync(c) && existsExact(c))) {
      problems += 1;
      console.log(`${path.relative(SRC, file)}: "${spec}" — case does not match the file on disk`);
    }
  }
}
console.log(problems ? `\n${problems} import(s) with wrong case.` : 'All relative imports match the file name case.');
process.exitCode = problems ? 1 : 0;
