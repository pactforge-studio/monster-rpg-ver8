import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkRuntimeLinks } from './check-runtime-links.mjs';

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'monster-runtime-links-'));
const site = path.join(temporary, 'site');
const fixture = {
  'index.html': `<link href="css/main.css?v=1"><script src="js/main.js"></script>
    <button onclick="location.href='english/'">English</button>
    <a href="#home">Home</a><a href="https://example.com/absent">External</a>
    <a href="//example.com/absent">External</a><link href="data:,">`,
  'css/main.css': '',
  'js/main.js': '',
  'english/index.html': '<link href="style.css?v=1"><script src="app.js?v=1"></script><a href="../">Game</a>',
  'english/app.js': "import { KEY } from './core.js'; fetch('./curriculum.json', {cache:'no-store'});",
  'english/core.js': 'export const KEY = "mb_english_v1";',
  'english/style.css': '',
  'english/curriculum.json': JSON.stringify({ lessons: [{ date: '2026-09-14' }, { date: '2026-09-15' }] }),
  'english/lessons/2026-09-14.json': '{}',
  'english/lessons/2026-09-15.json': '{}',
};
function write(file, content) {
  fs.mkdirSync(path.dirname(path.join(site, file)), { recursive: true });
  fs.writeFileSync(path.join(site, file), content);
}
try {
  for (const [file, content] of Object.entries(fixture)) write(file, content);
  assert.equal(checkRuntimeLinks(site).length, Object.keys(fixture).length);

  // Reproduce the original publishing omission and then restore it.
  fs.renameSync(path.join(site, 'english'), path.join(temporary, 'english'));
  assert.throws(() => checkRuntimeLinks(site), /index\.html: missing english\//);
  fs.renameSync(path.join(temporary, 'english'), path.join(site, 'english'));
  assert.doesNotThrow(() => checkRuntimeLinks(site));
  console.log('PASS: omitting english/ fails; restoring english/ passes');

  for (const file of Object.keys(fixture)) {
    fs.unlinkSync(path.join(site, file));
    assert.throws(() => checkRuntimeLinks(site), /missing/, file);
    write(file, fixture[file]);
  }
  const brokenReferences = [
    '<a href="missing.html?x=1#fragment">', '<script src=missing.js>',
    "<button onclick=\"window.location.href='missing/'\">",
    "<script>location.assign('missing.html');</script>",
    "<script>location.replace('missing.html');</script>",
    "<script>window.location='missing.html';</script>",
    '<a href="../outside.html">',
  ];
  for (const reference of brokenReferences) {
    write('index.html', fixture['index.html'] + reference);
    assert.throws(() => checkRuntimeLinks(site), /missing|leaves site/, reference);
  }
  write('index.html', fixture['index.html'] + '<a href="english?x=1#home">English</a><a href="/">Root</a>');
  assert.doesNotThrow(() => checkRuntimeLinks(site));
  write('index.html', fixture['index.html']);
  write('english/app.js', fixture['english/app.js'] + "\nimport './missing.js';");
  assert.throws(() => checkRuntimeLinks(site), /missing\.js/);
  write('english/app.js', fixture['english/app.js']);
  write('english/curriculum.json', '{broken');
  assert.throws(() => checkRuntimeLinks(site), /english\/curriculum\.json/);
  write('english/curriculum.json', fixture['english/curriculum.json']);
  fs.writeFileSync(path.join(temporary, 'outside.html'), 'outside');
  fs.symlinkSync(path.join(temporary, 'outside.html'), path.join(site, 'outside.html'));
  write('index.html', fixture['index.html'] + '<a href="outside.html">Outside</a>');
  assert.throws(() => checkRuntimeLinks(site), /leaves site/);
  console.log('PASS: main links, navigation, English dependencies and every lesson are checked');
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
