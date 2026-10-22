import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const prefix = 'images/monsters/motion/';
function motionPath(value) {
  if (typeof value !== 'string' || !/^images\/monsters\/motion\/[A-Za-z0-9_-]+\.(webm|webp)$/.test(value)) {
    throw new Error(`Unsupported motion path: ${String(value)}`);
  }
  return value;
}
function regularFile(file) {
  if (!fs.lstatSync(file).isFile()) throw new Error(`Expected regular file: ${file}`);
}

export function pruneUnreferencedMotion(siteArgument, gameArgument) {
  const site = fs.realpathSync(siteArgument), game = fs.realpathSync(gameArgument);
  const nested = (a, b) => a === b || a.startsWith(b + path.sep);
  if (nested(site, game) || nested(game, site)) throw new Error('Site and game must be separate directories');
  // Never execute source code. Accept only the existing literal media registrations.
  const source = fs.readFileSync(path.join(game, 'js/battle-idle-media.js'), 'utf8');
  const refs = { src: new Set(), poster: new Set() };
  // Tokenize strings/comments before locating property keys, so commented-out
  // registrations cannot disguise a missing or dynamically constructed path.
  const tokens = [...source.matchAll(/\/\*[\s\S]*?\*\/|\/\/[^\r\n]*|'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`|[A-Za-z_$][\w$]*|[^\s]/g)]
    .map(match => match[0]).filter(token => !token.startsWith('//') && !token.startsWith('/*'));
  for (let i = 0; i < tokens.length - 2; i++) {
    const key = tokens[i].replace(/^(['"])(.*)\1$/, '$2');
    if (!Object.hasOwn(refs, key) || tokens[i + 1] !== ':') continue;
    const literal = tokens[i + 2];
    if (!/^(['"])[^'"\\]+\1$/.test(literal) || ![',', '}'].includes(tokens[i + 3])) {
      throw new Error(`Expected a literal ${key} motion path`);
    }
    refs[key].add(motionPath(literal.slice(1, -1)));
  }
  if (refs.src.size < 50 || refs.poster.size < 50) throw new Error('Expected at least 50 src and 50 poster paths');
  const manifest = JSON.parse(fs.readFileSync(path.join(game, 'docs/motion-compression-20261011/manifest.json'), 'utf8'));
  if (!Array.isArray(manifest.entries) || !manifest.entries.length) throw new Error('Manifest entries are missing');
  const keep = new Set([...refs.src, ...refs.poster, ...manifest.entries.map(entry => motionPath(entry.src))]);
  const motion = path.join(site, prefix);
  if (fs.realpathSync(motion) !== motion.replace(/\/$/, '')) throw new Error('Motion directory must not be a symlink');
  // Validate every retained file and every candidate before removing any copied file.
  for (const ref of keep) regularFile(path.join(site, ref));
  const remove = [];
  for (const name of fs.readdirSync(motion)) {
    const file = path.join(motion, name);
    regularFile(file);
    if (!keep.has(prefix + name)) remove.push({ file, bytes: fs.statSync(file).size });
  }
  for (const { file } of remove) fs.unlinkSync(file);
  const result = { removed: remove.length, removedBytes: remove.reduce((sum, entry) => sum + entry.bytes, 0), retained: keep.size };
  console.log(`Removed files: ${result.removed}`);
  console.log(`Removed bytes: ${result.removedBytes}`);
  console.log(`Retained files: ${result.retained}`);
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    if (process.argv.length !== 4) throw new Error('Usage: node prune-unreferenced-motion.mjs site game');
    pruneUnreferencedMotion(process.argv[2], process.argv[3]);
  } catch (error) {
    console.error(`Motion pruning failed: ${error.message}`);
    process.exitCode = 1;
  }
}
