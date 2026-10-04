import fs from 'node:fs';
import path from 'node:path';
const game = process.argv[2];
if (!game) throw new Error('game path required');
fs.cpSync(new URL('../overlay/', import.meta.url), game, { recursive: true });
fs.copyFileSync(new URL('./test-url-migration.mjs', import.meta.url), path.join(game, 'scripts/test-url-migration.mjs'));
const notice = '  Object.freeze({id:"20261004-pactforge-url",date:"2026-10-04",category:"important",title:"ゲームの公開URLが変わりました",body:"新しい公開先はpactforge-studio.github.ioです。旧URLからも新しい画面を開けます。初回のセーブ引き継ぎでボタンが表示された場合はタップしてください。旧セーブは端末に残り、新URLの既存セーブは自動で上書きしません。"}),';
const noticesPath = path.join(game, 'js/notices-data.js');
let notices = fs.readFileSync(noticesPath, 'utf8');
if (!notices.includes('20261004-pactforge-url')) notices = notices.replace('const GAME_NOTICES = Object.freeze([', 'const GAME_NOTICES = Object.freeze([\n' + notice);
fs.writeFileSync(noticesPath, notices);
let index = fs.readFileSync(path.join(game, 'index.html'), 'utf8');
// Old-source updates may include its redirect hook. It is never needed on the new host.
index = index.replace(/<script src="js\/url-redirect\.js[^\"]*"><\/script>\s*/g, '');
index = index.replace(/(js\/notices-data\.js\?v=[^"]+)/, '$1-pactforge-url-1');
fs.writeFileSync(path.join(game, 'index.html'), index);
