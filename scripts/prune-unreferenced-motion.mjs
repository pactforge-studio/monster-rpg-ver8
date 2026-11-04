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
  // Other display registries can have static/dynamic posters outside motion/.
  // Limit the strict literal-path checks to the actual video registry.
  const declaration = tokens.findIndex((token, i) => token === 'BATTLE_IDLE_MEDIA' &&
    ['const', 'let', 'var'].includes(tokens[i - 1]) && tokens[i + 1] === '=');
  if (declaration < 0) throw new Error('BATTLE_IDLE_MEDIA declaration is missing');
  let start = declaration + 2;
  const frozen = tokens.slice(start, start + 4).join('') === 'Object.freeze(';
  if (frozen) start += 4;
  if (tokens[start] !== '{') throw new Error('Expected a literal BATTLE_IDLE_MEDIA object');
  let depth = 0, end = -1;
  for (let i = start; i < tokens.length; i++) {
    if (tokens[i] === '{') depth++;
    if (tokens[i] === '}' && --depth === 0) { end = i; break; }
  }
  if (end < 0 || (frozen && tokens[end + 1] !== ')')) throw new Error('Incomplete BATTLE_IDLE_MEDIA object');
  const mediaTokens = tokens.slice(start + 1, end);
  for (let i = 0; i < mediaTokens.length - 2; i++) {
    const key = mediaTokens[i].replace(/^(['"])(.*)\1$/, '$2');
    if (!Object.hasOwn(refs, key) || mediaTokens[i + 1] !== ':') continue;
    const literal = mediaTokens[i + 2];
    if (!/^(['"])[^'"\\]+\1$/.test(literal) || ![',', '}'].includes(mediaTokens[i + 3])) {
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
