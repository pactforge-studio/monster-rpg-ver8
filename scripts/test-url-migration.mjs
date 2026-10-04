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
console.log('URL migration: both profiles, metadata, backups, no overwrite, malformed data and rollback passed.');
