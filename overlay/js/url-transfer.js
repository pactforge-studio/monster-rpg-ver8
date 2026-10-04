(function () {
  'use strict';
  const OLD = 'https://kankidoi2-byte.github.io';
  const NEW = 'https://pactforge-studio.github.io';
  const BASE = '/monster-rpg-ver8/';
  const status = document.getElementById('status');
  const open = document.getElementById('open');
  const backup = document.getElementById('backup');
  const fallback = document.getElementById('fallback');
  const core = MonsterUrlMigration;
  if (location.origin === OLD) {
    fallback.href = BASE + '?legacy=1'; fallback.hidden = false;
    let payload;
    try { payload = core.validate(core.snapshot(localStorage)); }
    catch (_) { status.textContent = 'セーブを読み取れませんでした。旧画面で続けられます。'; return; }
    if (!core.hasSave(payload)) { location.replace(NEW + BASE); return; }
    let target = null;
    function launch() {
      target = window.open(NEW + BASE + 'url-transfer.html', 'monster_pactforge_transfer');
      status.textContent = target ? '新しいゲーム画面にセーブを引き継いでいます…' : '初回だけ下のボタンをタップしてください。2つのプロフィールとセーブを引き継ぎます。';
      open.hidden = false;
    }
    open.addEventListener('click', launch);
    backup.hidden = false;
    backup.addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
      const url = URL.createObjectURL(blob); const link = document.createElement('a');
      link.href = url; link.download = 'monster-url-transfer-backup.json'; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
    window.addEventListener('message', event => {
      if (event.origin !== NEW || event.source !== target || !event.data) return;
      if (event.data.type === 'monster-transfer-ready') {
        // Read again at handoff so a save made in another old tab is not stale.
        try { payload = core.validate(core.snapshot(localStorage)); target.postMessage({ type: 'monster-transfer-data', payload }, NEW); }
        catch (_) { status.textContent = 'セーブを読み取れませんでした。旧画面で続けてください。'; }
      }
      if (event.data.type === 'monster-transfer-result') {
        const result = event.data.result;
        status.textContent = result === 'imported' ? 'セーブを引き継ぎました。新しい画面でそのまま遊べます。' : result === 'already' || result === 'existing' ? '新しい画面のセーブを使用します。古いデータで上書きしていません。' : '引き継ぎに失敗しました。旧画面のセーブはそのまま残っています。';
        open.textContent = '新しいゲーム画面を開く';
      }
    });
    launch();
  } else if (location.origin === NEW) {
    fallback.href = BASE; fallback.textContent = '新URLのゲームを開く'; fallback.hidden = false;
    status.textContent = '旧画面からの引き継ぎを待っています…';
    let finished = false;
    window.addEventListener('message', event => {
      if (finished || event.origin !== OLD || event.source !== window.opener || event.data?.type !== 'monster-transfer-data') return;
      let result;
      try { result = core.receive(localStorage, event.data.payload); } catch (_) { result = 'failed'; }
      window.opener.postMessage({ type: 'monster-transfer-result', result }, OLD);
      if (result === 'failed') { status.textContent = '引き継げませんでした。旧画面に戻って続けてください。'; fallback.hidden = true; return; }
      finished = true;
      status.textContent = result === 'imported' ? 'セーブを引き継ぎました。ゲームを開きます…' : '新URLの既存セーブを使ってゲームを開きます…';
      window.opener = null; location.replace(BASE);
    });
    if (window.opener) window.opener.postMessage({ type: 'monster-transfer-ready' }, OLD);
    else status.textContent = '旧URLを開いて「セーブを引き継いでゲームを開く」をタップしてください。';
  } else { status.textContent = 'この画面は公開URLで使用します。'; }
})();
