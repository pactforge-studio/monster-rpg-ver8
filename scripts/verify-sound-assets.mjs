// Validate the exact adopted audio bytes in an assembled site or the published host.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
const [source, target] = process.argv.slice(2);
assert.ok(source && target, 'Usage: node verify-sound-assets.mjs <source checkout> <site directory or https URL>');
const remote = /^https:\/\//.test(target);
const read = async file => {
  assert.ok(!file.includes('..') && !path.isAbsolute(file), 'safe relative asset path');
  if (!remote) return fs.readFile(path.join(target, file));
  const response = await fetch(new URL(file, target.endsWith('/') ? target : target + '/'), {signal: AbortSignal.timeout(30000)});
  assert.equal(response.status, 200, `${file} HTTP status`);
  return Buffer.from(await response.arrayBuffer());
};
const manifestBytes = await fs.readFile(path.join(source, 'sound-manifest.json'));
assert.deepEqual(await read('sound-manifest.json'), manifestBytes, 'published manifest matches validated source');
const manifest = JSON.parse(manifestBytes);
const assets = JSON.parse(await fs.readFile(path.join(source, 'scripts/sound-pack-01-assets.json'), 'utf8'));
assert.equal(assets.length, 13);
for (const item of assets) {
  const entry = manifest.bgm[item.key] || manifest.se[item.key];
  assert.equal(entry.file, item.file);
  const bytes = await read(item.file);
  assert.equal(bytes.length, item.bytes, `${item.file} size`);
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), item.sha256, `${item.file} SHA-256`);
}
console.log('Sound delivery verified: exact manifest, AAC-LC BGM3 and unchanged SE10.');
