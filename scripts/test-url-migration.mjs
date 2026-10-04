import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const ctx = vm.createContext({});
vm.runInContext(fs.readFileSync('js/url-migration-core.js', 'utf8'), ctx);
const m = ctx.MonsterUrlMigration;
class Store { constructor(entries = {}) { this.data = new Map(Object.entries(entries)); } getItem(k) { return this.data.get(k) ?? null; } setItem(k,v) { this.data.set(k,v); } removeItem(k) { this.data.delete(k); } }
const entries = { mb_v95c: JSON.stringify({ gold: 100, custom: { preserved: true } }), mb_v95c_profile2: JSON.stringify({ gold: 200 }), mb_v95c_lastKnownGood: 'backup', mb_v95c_profile2_corrupt: 'recovery', mb_profiles_v1: JSON.stringify({ version: 1, selected: 2, profiles: [1,2].map(slot => ({ slot, id: 'profile'+slot, token:'test-token'+slot, name:'枠'+slot })) }), unrelated: 'do-not-copy' };
const source = new Store(entries), payload = m.snapshot(source), target = new Store();
assert.equal(m.receive(target, payload), 'imported');
for (const key of m.keys) assert.equal(target.getItem(key), source.getItem(key));
assert.equal(target.getItem('unrelated'), null);
assert.equal(source.getItem('mb_v95c'), entries.mb_v95c);
target.setItem('mb_v95c', '{"gold":999}');
assert.equal(m.receive(target, payload), 'already'); assert.equal(target.getItem('mb_v95c'), '{"gold":999}');
const existing = new Store({ mb_v95c_profile2: '{"gold":300}' });
assert.equal(m.receive(existing,payload), 'existing'); assert.equal(existing.getItem('mb_profiles_v1'), null);
assert.throws(() => m.receive(new Store(), {version:1,entries:{evil:'x'}}));
assert.throws(() => m.receive(new Store(), {version:1,entries:{mb_v95c:'broken'}}));
for (let failAt = 1; failAt <= Object.keys(payload.entries).length + 1; failAt++) {
  class Failing extends Store { calls=0; setItem(k,v) { if (++this.calls === failAt) throw new Error('quota'); super.setItem(k,v); } }
  const broken = new Failing({ mb_notice_last_seen_v1: 'before' });
  assert.throws(() => m.receive(broken,payload));
  assert.deepEqual(Object.fromEntries(broken.data),{mb_notice_last_seen_v1:'before'});
}
assert.equal(m.hasSave(m.snapshot(new Store())), false);
const OLD = 'https://kankidoi2-byte.github.io', NEW = 'https://pactforge-studio.github.io', BASE = '/monster-rpg-ver8/';
function screen(origin, storage, options = {}) {
  const elements = Object.fromEntries(['status','open','backup','fallback'].map(id => [id, {hidden:true,textContent:'',addEventListener(){}}]));
  const sent = [], redirects = [], handlers = [];
  const opener = options.opener === false ? null : { postMessage(data, target) { sent.push({data,target}); } };
  const popup = { postMessage(data, target) { sent.push({data,target}); } };
  const context = vm.createContext({ location:{origin,replace(url){redirects.push(url);}}, localStorage:storage, document:{getElementById(id){return elements[id];}}, opener, open(){return options.blocked ? null : popup;}, addEventListener(type, handler){if(type==='message')handlers.push(handler);} });
  context.window = context;
  vm.runInContext(fs.readFileSync('js/url-migration-core.js','utf8'),context);
  vm.runInContext(fs.readFileSync('js/url-transfer.js','utf8'),context);
  return {elements,sent,redirects,popup,opener,message(event){for(const handler of handlers)handler(event);}};
}
const oldEmpty = screen(OLD,new Store()); assert.deepEqual(oldEmpty.redirects,[NEW+BASE]);
const oldSaved = screen(OLD,source); assert.deepEqual(oldSaved.redirects,[]);
oldSaved.message({origin:'https://example.com',source:oldSaved.popup,data:{type:'monster-transfer-ready'}});
oldSaved.message({origin:NEW,source:{},data:{type:'monster-transfer-ready'}}); assert.equal(oldSaved.sent.length,0);
oldSaved.message({origin:NEW,source:oldSaved.popup,data:{type:'monster-transfer-ready'}});
assert.equal(oldSaved.sent[0].target,NEW); assert.equal(oldSaved.sent[0].data.payload.entries.mb_profiles_v1,entries.mb_profiles_v1);
const blocked = screen(OLD,source,{blocked:true}); assert.equal(blocked.elements.open.hidden,false); assert.match(blocked.elements.status.textContent,/タップ/);
const receiverStore = new Store(), receiver = screen(NEW,receiverStore);
assert.equal(receiver.sent[0].target,OLD);
receiver.message({origin:OLD,source:{},data:{type:'monster-transfer-data',payload}}); assert.equal(receiverStore.data.size,0);
receiver.message({origin:'https://example.com',source:receiver.opener,data:{type:'monster-transfer-data',payload}}); assert.equal(receiverStore.data.size,0);
receiver.message({origin:OLD,source:receiver.opener,data:{type:'monster-transfer-data',payload}});
assert.deepEqual(receiver.redirects,[BASE]); assert.equal(receiver.sent.at(-1).data.result,'imported');
class NoWrite extends Store { setItem(){throw new Error('blocked');} }
const unavailable = screen(NEW,new NoWrite());
unavailable.message({origin:OLD,source:unavailable.opener,data:{type:'monster-transfer-data',payload}});
assert.deepEqual(unavailable.redirects,[]); assert.equal(unavailable.sent.at(-1).data.result,'failed');
assert.equal(unavailable.elements.fallback.hidden,true);
assert.match(fs.readFileSync('url-transfer.html','utf8'),/\[hidden\]\{display:none!important\}/);
for (const [origin,search,expected] of [[OLD,'',1],[OLD,'?legacy=1',0],[NEW,'',0]]) {
  const redirects=[];vm.runInNewContext(fs.readFileSync('js/url-redirect.js','utf8'),{URLSearchParams,location:{origin,search,replace(url){redirects.push(url);}}});assert.equal(redirects.length,expected);
}
console.log('URL migration: both profiles, metadata, backups, no overwrite, malformed data and rollback passed.');
console.log('Transfer UI protocol: exact origin/source checks, popup fallback, receipt, failed storage and legacy escape passed.');
