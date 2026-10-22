import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('./prune-unreferenced-motion.mjs', import.meta.url));
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'motion-prune-'));
const prefix = 'images/monsters/motion/';
let cases = 0;
function write(base, name, text) {
  fs.mkdirSync(path.dirname(path.join(base, name)), { recursive: true });
  fs.writeFileSync(path.join(base, name), text);
}
function fixture(count = 50) {
  const dir = fs.mkdtempSync(path.join(root, 'case-')), game = path.join(dir, 'game'), site = path.join(dir, 'site');
  const rows = Array.from({ length: count }, (_, i) => `m${i}:{src:'${prefix}m${i}.webm',poster:'${prefix}m${i}.webp'}`);
  write(game, 'js/battle-idle-media.js', `const BATTLE_IDLE_MEDIA=Object.freeze({${rows.join(',')}});`);
  write(game, 'docs/motion-compression-20261011/manifest.json', JSON.stringify({ entries: [
    { src: prefix + 'm0.webm' }, { src: prefix + 'check_a.webm' }, { src: prefix + 'check_b.webm' }
  ] }));
  for (let i = 0; i < count; i++) for (const ext of ['webm', 'webp']) write(game, `${prefix}m${i}.${ext}`, `original ${i} ${ext}`);
  for (const name of ['check_a.webm', 'check_b.webm', 'unused.webm']) write(game, prefix + name, 'retained original');
  write(game, 'images/elsewhere/untouched.webm', 'outside motion');
  fs.cpSync(game, site, { recursive: true });
  return { game, site };
}
function snapshot(base) {
  return fs.readdirSync(base, { recursive: true }).sort().filter(name => fs.lstatSync(path.join(base, name)).isFile()).map(name => [name, fs.readFileSync(path.join(base, name)).toString('base64')]);
}
function run(f, success) {
  const before = snapshot(f.game);
  const output = spawnSync(process.execPath, [script, f.site, f.game], { encoding: 'utf8' });
  assert.equal(output.status, success ? 0 : 1, output.stdout + output.stderr);
  assert.deepEqual(snapshot(f.game), before, 'game must remain byte-for-byte unchanged');
  cases++;
  return output;
}
function failsBeforePruning(f) {
  const before = snapshot(f.site);
  run(f, false);
  assert.deepEqual(snapshot(f.site), before, 'validation failure must not prune any site file');
}
try {
  for (const count of [50, 51]) {
    const f = fixture(count), out = run(f, true);
    assert.equal(fs.existsSync(path.join(f.site, prefix, 'unused.webm')), false);
    assert.equal(fs.readdirSync(path.join(f.site, prefix)).length, 2 * count + 2);
    for (const name of ['m0.webm', 'm0.webp', 'check_a.webm', 'check_b.webm']) assert.ok(fs.existsSync(path.join(f.site, prefix, name)));
    assert.equal(fs.readFileSync(path.join(f.site, 'images/elsewhere/untouched.webm'), 'utf8'), 'outside motion');
    assert.match(out.stdout, /Removed files: 1\nRemoved bytes: 17\n/);
    assert.match(run(f, true).stdout, /Removed files: 0\nRemoved bytes: 0\n/);
  }
  for (const missing of ['m0.webm', 'm0.webp', 'check_a.webm', 'check_b.webm']) {
    const f = fixture(); fs.unlinkSync(path.join(f.site, prefix, missing)); failsBeforePruning(f);
  }
  failsBeforePruning(fixture(49));
  for (const key of ['src', 'poster']) {
    const f = fixture(), file = path.join(f.game, 'js/battle-idle-media.js');
    fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace(`${key}:`, 'unexpected:'));
    failsBeforePruning(f);
  }
  for (const content of ['not JSON', '{}', '{"entries":[]}', '{"entries":[{}]}', '{"entries":[{"src":"../outside.webm"}]}']) {
    const f = fixture(); write(f.game, 'docs/motion-compression-20261011/manifest.json', content); failsBeforePruning(f);
  }
  for (const replacement of ["src:dynamicPath", "src:'images/monsters/motion/' + name", "src:`images/monsters/motion/m0.webm`", "src:'../outside.webm'"]) {
    const f = fixture(), file = path.join(f.game, 'js/battle-idle-media.js');
    fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace("src:'images/monsters/motion/m0.webm'", replacement));
    failsBeforePruning(f);
  }
  const commented = fixture(49);
  fs.appendFileSync(path.join(commented.game, 'js/battle-idle-media.js'), "\n/* src:'images/monsters/motion/m49.webm',poster:'images/monsters/motion/m49.webp' */");
  failsBeforePruning(commented);
  const identical = fixture(); run({ game: identical.game, site: identical.game }, false);
  const nested = fixture(); run({ game: nested.game, site: path.join(nested.game, 'images') }, false);
  const directory = fixture(); fs.mkdirSync(path.join(directory.site, prefix, 'unexpected')); failsBeforePruning(directory);
  const link = fixture(); fs.symlinkSync(link.game, path.join(link.site, prefix, 'linked')); failsBeforePruning(link);
  const linkedParent = fixture(); fs.renameSync(path.join(linkedParent.site, 'images'), path.join(linkedParent.site, 'original-images'));
  fs.symlinkSync(path.join(linkedParent.game, 'images'), path.join(linkedParent.site, 'images')); failsBeforePruning(linkedParent);
  console.log(`Motion pruning tests: ${cases} cases passed`);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
