// Validate copied audio without tracking a second copy in the deployment repo.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
const [source, target] = process.argv.slice(2);
assert.ok(source && target, 'Usage: node verify-sound-assets.mjs <source checkout> <site directory or https URL>');
const remote = /^https:\/\//.test(target);
const manifestFile = 'sound-manifest.json';
const maxBytes = 100_000_000;
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const sourceRead = file => fs.readFile(path.join(source, file));
const isSafe = file => typeof file === 'string' &&
  file.split('/').every(part => part && part !== '.' && part !== '..' && !Array.from(part).some(char => char === '\\' || char === '`' || char.charCodeAt(0) < 32));
const read = async file => {
  assert.ok(isSafe(file), `unsafe relative asset path: ${file}`);
  if (!remote) return fs.readFile(path.join(target, file));
  const response = await fetch(new URL(file.split('/').map(encodeURIComponent).join('/'), target.endsWith('/') ? target : target + '/'), {signal: AbortSignal.timeout(30000)});
  assert.equal(response.status, 200, `${file} HTTP status`);
  return Buffer.from(await response.arrayBuffer());
};
async function listAudio(root, dir = 'audio') {
  const entries = await fs.readdir(path.join(root, dir), {withFileTypes:true});
  const files = [];
  for (const entry of entries) {
    const file = dir + '/' + entry.name;
    assert.ok(isSafe(file), `unsafe relative asset path: ${file}`);
    if (entry.isDirectory()) files.push(...await listAudio(root, file));
    else {
      assert.ok(entry.isFile(), `not a regular audio file: ${file}`);
      files.push(file);
    }
  }
  return files.sort();
}
const manifestBytes = await sourceRead(manifestFile);
assert.deepEqual(await read(manifestFile), manifestBytes, 'published manifest matches validated source');
const manifest = JSON.parse(manifestBytes);
const references = new Set();
for (const kind of ['bgm', 'se']) {
  const entries = manifest[kind];
  assert.ok(entries && typeof entries === 'object' && !Array.isArray(entries) && Object.keys(entries).length, `manifest.${kind} must contain assets`);
  for (const [key, entry] of Object.entries(entries)) {
    const file = entry?.file;
    assert.ok(isSafe(file) && file.startsWith(`audio/${kind}/`), `manifest.${kind}.${key} has an invalid file path: ${file}`);
    references.add(file);
  }
}
const fixed = JSON.parse(await sourceRead('scripts/sound-pack-01-assets.json'));
assert.equal(fixed.length, 13, 'Pack 1 retains its 13 exact fixtures');
for (const item of fixed) {
  const entry = manifest.bgm[item.key] || manifest.se[item.key];
  assert.equal(entry?.file, item.file, `Pack 1 ${item.key} path`);
}
const fixedByPath = new Map(fixed.map(item => [item.file, item]));
const sourceFiles = await listAudio(source);
for (const file of references) assert.ok(sourceFiles.includes(file), `${file} missing from source audio/`);
if (!remote) assert.deepEqual(await listAudio(target), sourceFiles, 'staged audio/ inventory must match source, including all subdirectories');
// Verify every local copied file. The live host check covers every manifest reference.
const failures = [];
const reviewed = [];
let total = 0;
for (const file of (remote ? [...references].sort() : sourceFiles)) {
  const size = (await fs.stat(path.join(source, file))).size;
  assert.ok(size <= maxBytes, `${file} exceeds 100 MB (${size} bytes)`);
  const original = await sourceRead(file);
  const bytes = await read(file);
  const actualHash = hash(bytes);
  if (actualHash !== hash(original)) failures.push(`${file}: differs from pinned source`);
  const item = fixedByPath.get(file);
  if (item && (size !== item.bytes || actualHash !== item.sha256)) failures.push(`${file}: differs from fixed Pack 1 size/SHA-256`);
  total += size;
  reviewed.push(`${file}\t${size}\t${actualHash}`);
}
assert.deepEqual(failures, [], 'copied audio bytes must match source and fixed Pack 1');
const result = `Sound delivery verified: exact manifest, ${references.size} manifest references; ${reviewed.length} files / ${total} bytes verified, including all 13 fixed Pack 1 SHA-256 hashes.`;
console.log(result);
if (!remote && process.env.GITHUB_STEP_SUMMARY) {
  await fs.appendFile(process.env.GITHUB_STEP_SUMMARY,
    `### Copied audio in the Pages artifact\n\n${result}\n\nThis is the generated payload, not tracked files in the deployment repo.\n\n\`\`\`text\n${manifestFile}\t${manifestBytes.length}\t${hash(manifestBytes)}\n${reviewed.join('\n')}\n\`\`\`\n`);
}
