import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sound-release-validation-'));
const source = path.join(temp, 'source');
const site = path.join(temp, 'site');
const test = (status, output) => {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('./verify-sound-assets.mjs', import.meta.url)), source, site], {encoding:'utf8'});
  assert.equal(result.status, status, result.stderr);
  assert.match(result.stdout + result.stderr, output);
};
const write = (root, file, contents) => {
  const dest = path.join(root, file);
  fs.mkdirSync(path.dirname(dest), {recursive:true});
  fs.writeFileSync(dest, contents);
};
const fixtures = {bgm:{}, se:{}};
const old = Array.from({length:13}, (_, i) => {
  const kind = i < 3 ? 'bgm' : 'se';
  const key = 'fixture' + i;
  const file = 'audio/' + kind + '/' + key + '.mp3';
  const contents = 'original ' + i;
  write(source, file, contents);
  fixtures[kind][key] = {file};
  return {key,file,bytes:contents.length,sha256:crypto.createHash('sha256').update(contents).digest('hex')};
});
try {
  write(source, 'scripts/sound-pack-01-assets.json', JSON.stringify(old));
  write(source, 'sound-manifest.json', JSON.stringify(fixtures));
  fs.cpSync(source, site, {recursive:true});
  test(0, /13 manifest references; 13 files/);
  const future = 'audio/bgm/future/deep/新曲 song.m4a';
  fixtures.bgm.new_song = {file:future};
  for (const root of [source,site]) write(root, 'sound-manifest.json', JSON.stringify(fixtures));
  test(1, /song\.m4a missing from source audio/);
  write(source, future, 'new original');
  test(1, /staged audio\/ inventory must match source/);
  write(site, future, 'wrong bytes');
  test(1, /song\.m4a: differs from pinned source/);
  write(site, future, 'new original');
  test(0, /14 manifest references; 14 files/);
  for (const root of [source,site]) write(root, old[0].file, 'changed in both locations');
  test(1, /differs from fixed Pack 1 size\/SHA-256/);
  for (const root of [source,site]) write(root, old[0].file, 'original 0');
  write(site, 'sound-manifest.json', JSON.stringify({ ...fixtures, unrelated: true }));
  test(1, /published manifest matches validated source/);
  write(site, 'sound-manifest.json', JSON.stringify(fixtures));
  const oversized = 'audio/bgm/z-large.m4a';
  for (const root of [source,site]) write(root, oversized, '');
  fs.truncateSync(path.join(source, oversized), 100_000_001);
  test(1, /z-large\.m4a exceeds 100 MB/);
  console.log('Sound deployment guard: base, future recursive copy, missing, modified, fixed hashes, manifest and oversized input PASS');
} finally {
  fs.rmSync(temp, {recursive:true,force:true});
}
