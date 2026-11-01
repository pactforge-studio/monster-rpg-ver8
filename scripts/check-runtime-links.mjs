import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Check literal runtime references, not arbitrary JavaScript expressions.
// The English manifest is checked explicitly because lesson filenames are data-driven.
function references(text, extension) {
  const refs = new Set();
  const patterns = [
    /\b(?:window\.|document\.)?location(?:\.href)?\s*=\s*(["'])(.*?)\1/gs,
    /\b(?:window\.|document\.)?location\.(?:assign|replace)\s*\(\s*(["'])(.*?)\1/gs,
    /\b(?:fetch|import)\s*\(\s*(["'])(.*?)\1/gs,
    /^\s*import\s*(?:[^'";\n]+?\s+from\s*)?(["'])(.*?)\1/gm,
  ];
  if (extension === '.html') patterns.push(
    /\b(?:href|src)\s*=\s*(["'])(.*?)\1/gs,
    /\b(?:href|src)\s*=\s*([^\s"'=<>`]+)/g,
  );
  if (extension === '.css') patterns.push(/\burl\(\s*(["']?)([^)'"\s]+)\1\s*\)/g);
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) refs.add(match[2] ?? match[1]);
  }
  return [...refs].map(ref => ref.replaceAll('&amp;', '&'));
}

export function checkRuntimeLinks(directory) {
  const root = fs.realpathSync(directory);
  const checked = new Set();
  const errors = new Set();
  function requireTarget(from, reference) {
    const ref = reference.trim();
    if (!ref || ref.startsWith('#') || ref.startsWith('//') || /^[a-z][\w+.-]*:/i.test(ref) || ref.includes('${')) return;
    let relative;
    try {
      relative = decodeURIComponent(ref.split(/[?#]/, 1)[0]);
    } catch {
      errors.add(`${from}: invalid URL ${ref}`);
      return;
    }
    let target = relative.startsWith('/')
      ? path.resolve(root, '.' + relative)
      : path.resolve(root, path.dirname(from), relative || path.basename(from));
    if (target !== root && !target.startsWith(root + path.sep)) {
      errors.add(`${from}: target leaves site/ (${ref})`);
      return;
    }
    if (fs.existsSync(target) && fs.statSync(target).isDirectory()) target = path.join(target, 'index.html');
    if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
      errors.add(`${from}: missing ${ref} (${path.relative(root, target)})`);
      return;
    }
    const real = fs.realpathSync(target);
    if (!real.startsWith(root + path.sep)) {
      errors.add(`${from}: target leaves site/ (${ref})`);
      return;
    }
    checked.add(path.relative(root, target));
    return target;
  }
  function checkFile(file) {
    const target = requireTarget('index.html', file);
    if (!target) return;
    for (const ref of references(fs.readFileSync(target, 'utf8'), path.extname(file))) requireTarget(file, ref);
  }

  checkFile('index.html');
  // Older pinned sources do not have Life Quest yet. Once linked, both files are required.
  if(fs.existsSync(path.join(root,'index.html'))&&fs.readFileSync(path.join(root,'index.html'),'utf8').includes('life-quest/')){
    checkFile('life-quest/index.html');checkFile('life-quest/rewards.js');
  }
  for (const file of ['english/index.html', 'english/app.js', 'english/core.js', 'english/style.css']) checkFile(file);
  const curriculumPath = requireTarget('index.html', 'english/curriculum.json');
  if (curriculumPath) {
    try {
      const curriculum = JSON.parse(fs.readFileSync(curriculumPath, 'utf8'));
      if (!Array.isArray(curriculum.lessons) || !curriculum.lessons.length) throw new Error('lessons must be a nonempty array');
      for (const lesson of curriculum.lessons) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(lesson.date)) throw new Error('lesson date must be YYYY-MM-DD');
        requireTarget('english/curriculum.json', `lessons/${lesson.date}.json`);
      }
    } catch (error) {
      errors.add(`english/curriculum.json: ${error.message}`);
    }
  }
  if (errors.size) throw new Error(`Runtime links failed:\n${[...errors].sort().join('\n')}`);
  return [...checked].sort();
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (!process.argv[2]) throw new Error('Usage: node check-runtime-links.mjs <site directory>');
  const checked = checkRuntimeLinks(process.argv[2]);
  console.log(`Runtime links OK: ${checked.length} files\n${checked.join('\n')}`);
}
