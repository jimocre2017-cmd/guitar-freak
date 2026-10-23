/**
 * Guitar Freak 同期API（Google Apps Script）
 *
 * スプレッドシート「Guitar Freak」に紐づけて使う。アプリ（GitHub Pages の PWA）と
 * スプレッドシートの間でデータを送受信するだけで、画面はすべてアプリ側にある。
 *
 * 初回の手順（README.md にも同じ内容）
 *   1. スプレッドシートを新規作成し、名前を「Guitar Freak」にする
 *   2. 拡張機能 → Apps Script を開き、このファイルの内容を Code.gs に貼り付けて保存
 *   3. 関数「setup」を選んで ▶実行（権限を許可）→ 6つのシートと合言葉ができる
 *   4. デプロイ → 新しいデプロイ → 種類「ウェブアプリ」
 *        実行するユーザー：自分 ／ アクセスできるユーザー：全員
 *   5. スプレッドシートを開き直し、メニュー「Guitar Freak」→「アプリ設定リンクを表示」
 *      表示されたリンクを、使う端末（スマホ・タブレット・PC）それぞれで1回開く
 */

var APP_URL_DEFAULT = 'https://jimocre2017-cmd.github.io/guitar-freak/';

/* ---------- シートの定義（見出し ⇔ アプリのデータ名） ---------- */
var SCHEMA = {
  logs: { sheet: '練習ログ', cols: [
    ['log_id', 'id'], ['日付', 'date'], ['開始', 'start'], ['終了', 'end'], ['分', 'min', 'num'], ['項目', 'cat'],
    ['対象ID', 'targetId'], ['対象名', 'targetName'], ['種別', 'kind'], ['曲ID', 'songId'], ['BPM', 'bpm', 'num'],
    ['達成✓', 'done', 'bool'], ['メモ', 'memo'], ['端末', 'device'], ['スキップ', 'skipped', 'bool'],
    ['同期日時', 'syncedAt'], ['更新日時', 'updatedAt', 'num'], ['削除', 'deleted', 'bool']] },
  songs: { sheet: '曲', cols: [
    ['song_id', 'id'], ['曲名', 'title'], ['アーティスト', 'artist'], ['目標BPM', 'bpm', 'num'], ['チューニング', 'tuning'], ['カポ', 'capo'],
    ['譜面リンク', 'links', 'json'], ['手持ち譜面', 'book'], ['使うコード', 'chords'], ['ステータス', 'status'], ['通し達成日', 'throughAt'],
    ['定着日', 'settledAt'], ['並び順', 'order', 'num'], ['登録日', 'createdAt'], ['更新日時', 'updatedAt', 'num'], ['削除', 'deleted', 'bool']] },
  sections: { sheet: 'セクション', cols: [
    ['section_id', 'id'], ['song_id', 'songId'], ['並び順', 'order', 'num'], ['名前', 'name'], ['小節範囲', 'bars'], ['目標BPM', 'bpm', 'num'],
    ['現在の段階', 'stage', 'num'], ['段階ごとの到達日', 'stageDates', 'json'], ['メモ', 'memo'], ['更新日時', 'updatedAt', 'num'], ['削除', 'deleted', 'bool']] },
  tasks: { sheet: '課題', cols: [
    ['task_id', 'id'], ['項目', 'cat'], ['グレード', 'grade', 'num'], ['名前', 'name'], ['目標BPM', 'bpm', 'num'], ['教材データキー', 'key'],
    ['習得✓回数', 'okCount', 'num'], ['✓した日', 'okDates', 'json'], ['習得日', 'masteredAt'], ['更新日時', 'updatedAt', 'num'], ['削除', 'deleted', 'bool']] },
  grades: { sheet: 'グレード', cols: [
    ['項目', 'id'], ['現在のグレード', 'grade', 'num'], ['解放日', 'unlockedAt'], ['更新日時', 'updatedAt', 'num'], ['削除', 'deleted', 'bool']] },
  settings: { sheet: '設定', cols: [
    ['キー', 'id'], ['値', 'value'], ['更新日時', 'updatedAt', 'num'], ['削除', 'deleted', 'bool']] }
};
var TABLES = ['logs', 'songs', 'sections', 'tasks', 'grades', 'settings'];

/* ---------- 入口 ---------- */
function doGet() {
  return ContentService.createTextOutput('Guitar Freak 同期API は動いています。アプリはスプレッドシートのメニュー「Guitar Freak」→「アプリ設定リンクを表示」から開いてください。');
}

function doPost(e) {
  var out;
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var token = PropertiesService.getScriptProperties().getProperty('TOKEN');
    if (!token || body.token !== token) throw new Error('AUTH: 合言葉が一致しません');
    var fn = body.fn, args = body.args || [];
    if (fn === 'sync') out = { ok: true, data: syncAll(args[0] || {}) };
    else if (fn === 'ping') out = { ok: true, data: { time: new Date().toISOString() } };
    else throw new Error('不明な操作：' + fn);
  } catch (err) {
    out = { ok: false, error: String(err && err.message || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

/* ---------- 同期：届いた行を「新しい方が勝つ」で反映し、全データを返す ---------- */
function syncAll(req) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet(), changes = req.changes || {}, now = isoNow();
    var result = {};
    TABLES.forEach(function (t) {
      var sh = ensureSheet(ss, t), sc = SCHEMA[t], cols = sc.cols;
      var rows = readRows(sh, cols), index = {};
      rows.forEach(function (r, i) { index[String(r.id)] = i; });
      var incoming = changes[t] || [], touched = false;
      incoming.forEach(function (row) {
        if (!row || !row.id) return;
        if (t === 'tasks') row.okCount = (row.okDates || []).length;
        if (t === 'logs') row.syncedAt = now;
        var i = index[String(row.id)];
        if (i === undefined) { index[String(row.id)] = rows.length; rows.push(row); touched = true; }
        else if ((Number(row.updatedAt) || 0) >= (Number(rows[i].updatedAt) || 0)) {
          if (t === 'logs' && rows[i].syncedAt) row.syncedAt = rows[i].syncedAt;
          rows[i] = row; touched = true;
        }
      });
      if (touched) writeRows(sh, cols, rows);
      result[t] = rows;
    });
    result.serverTime = now;
    return result;
  } finally {
    lock.releaseLock();
  }
}

function readRows(sh, cols) {
  var last = sh.getLastRow();
  if (last < 2) return [];
  var head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  var pos = cols.map(function (c) { return head.indexOf(c[0]); });
  var values = sh.getRange(2, 1, last - 1, head.length).getValues();
  var out = [];
  values.forEach(function (v) {
    var id = pos[0] >= 0 ? v[pos[0]] : '';
    if (id === '' || id === null) return;
    var row = {};
    cols.forEach(function (c, i) { row[c[1]] = fromCell(pos[i] >= 0 ? v[pos[i]] : '', c[2]); });
    row.id = String(row.id);
    out.push(row);
  });
  return out;
}

function writeRows(sh, cols, rows) {
  var head = sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0].map(String);
  // 足りない列は右端に追加（Geminiで列を足していても壊さない）
  cols.forEach(function (c) { if (head.indexOf(c[0]) < 0) { head.push(c[0]); sh.getRange(1, head.length).setValue(c[0]); } });
  var width = head.length, last = sh.getLastRow();
  var existing = last >= 2 ? sh.getRange(2, 1, last - 1, width).getValues() : [];
  var idPos = head.indexOf(cols[0][0]), byId = {};
  existing.forEach(function (v) { if (v[idPos] !== '') byId[String(v[idPos])] = v; });
  var data = rows.map(function (row) {
    var base = (byId[String(row.id)] || new Array(width).fill('')).slice();
    while (base.length < width) base.push('');
    cols.forEach(function (c) { base[head.indexOf(c[0])] = toCell(row[c[1]], c[2]); });
    return base;
  });
  if (data.length) {
    // 文字列の列は「書式なしテキスト」にして、日付などの自動変換を防ぐ
    cols.forEach(function (c) {
      var col = head.indexOf(c[0]) + 1;
      sh.getRange(2, col, data.length, 1).setNumberFormat(c[2] === 'num' ? '0.##' : '@');
    });
    sh.getRange(2, 1, data.length, width).setValues(data);
  }
  if (last - 1 > data.length) sh.getRange(data.length + 2, 1, last - 1 - data.length, width).clearContent();
}

function toCell(v, type) {
  if (v === undefined || v === null) return '';
  if (type === 'json') return typeof v === 'string' ? v : JSON.stringify(v);
  if (type === 'bool') return v ? 'TRUE' : '';
  if (type === 'num') return v === '' ? '' : Number(v);
  return String(v);
}
function fromCell(v, type) {
  if (type === 'num') { if (v === '' || v === null) return null; var n = Number(v); return isNaN(n) ? null : n; }
  if (type === 'bool') return v === true || String(v).toUpperCase() === 'TRUE' || v === 1 || v === '1' || v === '✓';
  if (type === 'json') {
    if (v === '' || v === null) return null;
    try { return JSON.parse(v); } catch (e) { return null; }
  }
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  return v === null ? '' : String(v);
}
function isoNow() { return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm:ssXXX"); }

function ensureSheet(ss, t) {
  var sc = SCHEMA[t], sh = ss.getSheetByName(sc.sheet);
  if (!sh) {
    sh = ss.insertSheet(sc.sheet);
    sh.getRange(1, 1, 1, sc.cols.length).setValues([sc.cols.map(function (c) { return c[0]; })]).setFontWeight('bold').setBackground('#f1ead9');
    sh.setFrozenRows(1);
  }
  return sh;
}

/* ---------- 初期設定 ---------- */
function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  TABLES.forEach(function (t) { ensureSheet(ss, t); });
  var def = ss.getSheetByName('シート1') || ss.getSheetByName('Sheet1');
  if (def && ss.getSheets().length > 1 && def.getLastRow() === 0) ss.deleteSheet(def);
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('TOKEN')) props.setProperty('TOKEN', Utilities.getUuid().replace(/-/g, ''));
  if (!props.getProperty('APP_URL')) props.setProperty('APP_URL', APP_URL_DEFAULT);
  // 初期登録する3曲（アプリ側と同じIDなので二重登録にならない）
  var sh = ss.getSheetByName(SCHEMA.songs.sheet);
  if (sh.getLastRow() < 2) {
    syncAll({ changes: { songs: [
      { id: 'song-1', title: "Can't Take My Eyes Off You", artist: 'Frankie Valli', status: '練習中', order: 1, links: [], updatedAt: 0 },
      { id: 'song-2', title: 'Virtual Insanity（solo ver）', artist: 'Jamiroquai', status: '練習中', order: 2, links: [], updatedAt: 0 },
      { id: 'song-3', title: 'Waiting in Vain', artist: 'Bob Marley', status: '練習中', order: 3, links: [], updatedAt: 0 }
    ] } });
  }
  Logger.log('準備できました。次に「デプロイ → 新しいデプロイ → ウェブアプリ」で公開してください。');
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Guitar Freak')
    .addItem('アプリ設定リンクを表示', 'showSetupLink')
    .addItem('合言葉を作り直す（全端末で再設定が必要）', 'resetToken')
    .addToUi();
}

function setupLink_(apiUrl) {
  var props = PropertiesService.getScriptProperties();
  var cfg = { api: apiUrl, token: props.getProperty('TOKEN') };
  return (props.getProperty('APP_URL') || APP_URL_DEFAULT) + '#setup=' + encodeURIComponent(JSON.stringify(cfg));
}

function showSetupLink() {
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('TOKEN')) setup();
  var api = props.getProperty('API_URL') || ScriptApp.getService().getUrl() || '';
  var html;
  if (!api || /\/dev$/.test(api)) {
    html = '<p style="font-family:sans-serif">ウェブアプリのURL（/exec で終わるもの）を貼り付けてください。デプロイ → デプロイを管理 でコピーできます。</p>'
      + '<input id="u" style="width:100%;padding:8px" placeholder="https://script.google.com/macros/s/.../exec">'
      + '<p><button onclick="google.script.run.withSuccessHandler(function(){google.script.host.close()}).saveApiUrl(document.getElementById(\'u\').value)">保存して閉じる</button></p>'
      + '<p style="font-family:sans-serif;font-size:12px;color:#666">保存したら、もう一度メニューから「アプリ設定リンクを表示」を開いてください。</p>';
  } else {
    var link = setupLink_(api);
    html = '<div style="font-family:sans-serif;line-height:1.7">'
      + '<p>使う端末（スマホ・タブレット・PC）それぞれで、このリンクを1回開いてください。開くと同期の設定が保存されます。</p>'
      + '<p><a href="' + link + '" target="_blank" style="font-size:16px;font-weight:bold">Guitar Freak を開いて設定する</a></p>'
      + '<p style="font-size:12px;color:#666">スマホに送る場合は下のリンクをコピーして自分宛てに送ってください。合言葉が含まれるので他の人には送らないでください。</p>'
      + '<textarea style="width:100%;height:90px;font-size:11px" onclick="this.select()">' + link + '</textarea></div>';
  }
  SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutput(html).setWidth(520).setHeight(320), 'Guitar Freak アプリ設定');
}

function saveApiUrl(url) {
  url = String(url || '').trim();
  if (!/^https:\/\/script\.google\.com\/.+\/exec$/.test(url)) throw new Error('/exec で終わるウェブアプリのURLを貼り付けてください');
  PropertiesService.getScriptProperties().setProperty('API_URL', url);
}

function resetToken() {
  PropertiesService.getScriptProperties().setProperty('TOKEN', Utilities.getUuid().replace(/-/g, ''));
  SpreadsheetApp.getUi().alert('合言葉を作り直しました。各端末で「アプリ設定リンクを表示」のリンクを開き直してください。');
}

// エディタから実行すると、設定リンクをログに出す（メニューが使えないとき用）
function logSetupLink() {
  var api = PropertiesService.getScriptProperties().getProperty('API_URL') || ScriptApp.getService().getUrl();
  Logger.log(setupLink_(api));
}
