/* Save transfer is browser-local. Never send its contents to a server or URL. */
(function (root) {
  'use strict';
  const keys = Object.freeze(['mb_profiles_v1', 'mb_v95c', 'mb_v95c_lastKnownGood', 'mb_v95c_corrupt', 'mb_v95c_profile2', 'mb_v95c_profile2_lastKnownGood', 'mb_v95c_profile2_corrupt', 'mb_notice_last_seen_v1', 'mb_title_last_map_v7']);
  const saves = ['mb_v95c', 'mb_v95c_profile2'];
  const marker = 'mb_url_migration_pactforge_v1';
  function snapshot(storage) {
    const entries = {};
    for (const key of keys) { const value = storage.getItem(key); if (value !== null) entries[key] = value; }
    return { version: 1, entries };
  }
  function validate(payload) {
    if (!payload || payload.version !== 1 || !payload.entries || typeof payload.entries !== 'object' || Array.isArray(payload.entries)) throw new Error('invalid-transfer');
    if (JSON.stringify(payload).length > 8000000) throw new Error('transfer-too-large');
    for (const [key, value] of Object.entries(payload.entries)) {
      if (!keys.includes(key) || typeof value !== 'string') throw new Error('invalid-entry');
      if (saves.includes(key) || key === 'mb_profiles_v1') {
        const parsed = JSON.parse(value);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid-save');
        if (key === 'mb_profiles_v1' && (parsed.version !== 1 || !Array.isArray(parsed.profiles) || parsed.profiles.length !== 2 || parsed.profiles.some((p, i) => p.slot !== i + 1 || typeof p.id !== 'string' || typeof p.token !== 'string'))) throw new Error('invalid-profiles');
      }
    }
    return payload;
  }
  function hasSave(payload) { return saves.some(key => typeof payload.entries[key] === 'string'); }
  function receive(storage, payload) {
    validate(payload);
    // A revisit through an old bookmark must never roll back a newer save.
    if (storage.getItem(marker) !== null) return 'already';
    if (saves.some(key => storage.getItem(key) !== null)) return 'existing';
    const previous = new Map();
    try {
      for (const [key, value] of Object.entries(payload.entries)) {
        previous.set(key, storage.getItem(key)); storage.setItem(key, value);
        if (storage.getItem(key) !== value) throw new Error('storage-verification');
      }
      previous.set(marker, storage.getItem(marker)); storage.setItem(marker, 'complete');
      if (storage.getItem(marker) !== 'complete') throw new Error('storage-verification');
      return 'imported';
    } catch (error) {
      for (const [key, value] of [...previous].reverse()) {
        try { if (value === null) storage.removeItem(key); else storage.setItem(key, value); } catch (_) { /* Source remains intact even if storage is unavailable. */ }
      }
      throw error;
    }
  }
  root.MonsterUrlMigration = Object.freeze({ keys, saves, marker, snapshot, validate, hasSave, receive });
})(globalThis);
