/* Guitar Freak データ層：端末内保存・同期・練習ロジック（習得判定、グレード解放、メニュー編成、集計）
 *
 * テーブル（スプレッドシートの6シートと同じ）
 *   logs      練習ログ（1回の練習項目）
 *   songs     曲
 *   sections  曲のセクション
 *   tasks     教材課題の進捗（課題の中身は GF_CURRICULUM）
 *   grades    項目ごとの到達グレード
 *   settings  設定（キーと値）
 * どの行も id・updatedAt（ミリ秒）・deleted を持つ。同期は「新しい updatedAt の方が勝つ」。
 */
var GF = (function () {
  'use strict';
  var C = GF_CURRICULUM;
  var TABLES = ['logs', 'songs', 'sections', 'tasks', 'grades', 'settings'];
  var SONG_CAT = '楽曲';
  var STAGES = [
    { n: 0, short: '未', label: '未着手', pct: 0 },
    { n: 1, short: '遅', label: 'ゆっくり弾ける', pct: 50 },
    { n: 2, short: '60', label: '60%で止まらず', pct: 60 },
    { n: 3, short: '80', label: '80%で止まらず', pct: 80 },
    { n: 4, short: '100', label: '100%で止まらず', pct: 100 }
  ];
  var DEFAULTS = {
    dailyGoal: 5,
    warnSong: 3,
    warnTask: 5,
    masterDays: 3,
    unlockPct: 80,
    settleDays: 3,
    mainSongId: '',
    // 時間指定モードの配分（%）。min は「この分数以上」で使う段
    alloc: [
      { min: 1, 運指: 20, コード: 0, スケール: 0, 楽曲: 80 },
      { min: 10, 運指: 20, コード: 10, スケール: 20, 楽曲: 50 },
      { min: 15, 運指: 13.4, コード: 13.3, スケール: 26.7, 楽曲: 46.6 },
      { min: 30, 運指: 15, コード: 10, スケール: 25, 楽曲: 50 }
    ],
    fixed: { 運指: 2, コード: 1, スケール: 1, 楽曲: 1 },
    reviewMin: 3,
    metAuto: true
  };

  /* ---------- 端末内保存 ---------- */
  var LS = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) {} }
  };

  // 設定用リンク（#setup=...）から同期APIのURLと合言葉を保存（筋トレアプリと同じ方式）
  (function () {
    var m = location.hash.match(/^#setup=(.+)$/);
    if (!m) return;
    try {
      var c = JSON.parse(decodeURIComponent(m[1]));
      if (c && c.api && c.token) { LS.set('gf_cfg', { api: c.api, token: c.token }); LS.set('gf_justSetup', true); }
    } catch (e) {}
    try { history.replaceState(null, '', location.pathname); } catch (e) {}
  })();

  /* ---------- 日付 ---------- */
  function p2(n) { return ('0' + n).slice(-2); }
  function ymd(d) { return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); }
  function today() { return ymd(new Date()); }
  function parseYmd(s) { var a = s.split('-'); return new Date(+a[0], +a[1] - 1, +a[2]); }
  function addDays(s, n) { var d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); }
  function daysBetween(a, b) { return Math.round((parseYmd(b) - parseYmd(a)) / 86400000); }
  function hm(ts) { var d = new Date(ts); return p2(d.getHours()) + ':' + p2(d.getMinutes()); }
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) { var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); });
  }
  function r1(n) { return Math.round(n * 10) / 10; }

  /* ---------- 状態 ---------- */
  var D = LS.get('gf_data', null);
  var dirty = LS.get('gf_dirty', {});
  var meta = LS.get('gf_meta', { synced: 0, notices: [], seeded: false });
  if (!D) { D = {}; }
  TABLES.forEach(function (t) { D[t] = D[t] || {}; });

  function seed() {
    if (meta.seeded) return;
    [
      { id: 'song-1', title: "Can't Take My Eyes Off You", artist: 'Frankie Valli' },
      { id: 'song-2', title: 'Virtual Insanity（solo ver）', artist: 'Jamiroquai' },
      { id: 'song-3', title: 'Waiting in Vain', artist: 'Bob Marley' }
    ].forEach(function (s, i) {
      if (!D.songs[s.id]) D.songs[s.id] = normSong({ id: s.id, title: s.title, artist: s.artist, order: i + 1, status: '練習中', createdAt: today(), updatedAt: 0 });
    });
    C.CATS.forEach(function (cat) {
      if (!D.grades[cat]) D.grades[cat] = { id: cat, cat: cat, grade: 1, unlockedAt: '', updatedAt: 0 };
    });
    meta.seeded = true;
    saveAll();
  }

  function normSong(s) {
    return {
      id: s.id, title: s.title || '', artist: s.artist || '', bpm: num(s.bpm), tuning: s.tuning || '', capo: s.capo || '',
      links: Array.isArray(s.links) ? s.links : [], book: s.book || '', chords: s.chords || '', status: s.status || '練習中',
      throughAt: s.throughAt || '', settledAt: s.settledAt || '', order: num(s.order) || 0, createdAt: s.createdAt || '',
      updatedAt: Number(s.updatedAt) || 0, deleted: !!s.deleted
    };
  }
  function num(v) { if (v === '' || v === null || v === undefined) return null; var n = Number(v); return isNaN(n) ? null : n; }

  function saveAll() { LS.set('gf_data', D); LS.set('gf_dirty', dirty); LS.set('gf_meta', meta); }
  var rev = 0, changeCbs = [];
  function changed() { rev++; cache = {}; saveAll(); changeCbs.forEach(function (f) { try { f(); } catch (e) {} }); }

  function put(table, row, opts) {
    row.updatedAt = (opts && opts.ts) || Date.now();
    D[table][row.id] = row;
    var k = table + '|' + row.id;
    dirty[k] = (dirty[k] || 0) + 1;
    if (!(opts && opts.silent)) { changed(); schedule(800); }
  }
  function list(table) { return Object.keys(D[table]).map(function (k) { return D[table][k]; }).filter(function (r) { return !r.deleted; }); }
  function get(table, id) { var r = D[table][id]; return r && !r.deleted ? r : null; }

  /* ---------- 設定 ---------- */
  function setting(k) {
    var r = D.settings[k];
    if (r && !r.deleted && r.value !== undefined && r.value !== '') {
      try { return typeof r.value === 'string' ? JSON.parse(r.value) : r.value; } catch (e) { return r.value; }
    }
    return JSON.parse(JSON.stringify(DEFAULTS[k]));
  }
  function setSetting(k, v) { put('settings', { id: k, key: k, value: JSON.stringify(v), deleted: false }); }

  function device() {
    var d = LS.get('gf_device', '');
    if (d) return d;
    var ua = navigator.userAgent;
    d = /Android/.test(ua) ? (/Mobile/.test(ua) ? 'Android' : 'タブレット') : /iPad|Macintosh.*Touch/.test(ua) ? 'iPad' : /iPhone/.test(ua) ? 'iPhone' : 'PC';
    return d;
  }

  /* ---------- 集計キャッシュ ---------- */
  var cache = {};
  function memo(key, fn) { if (!(key in cache)) cache[key] = fn(); return cache[key]; }

  function logs() { return memo('logs', function () { return list('logs').sort(function (a, b) { return a.start < b.start ? -1 : 1; }); }); }
  function practiced() { return memo('prac', function () { return logs().filter(function (l) { return !l.skipped; }); }); }

  function dayTotals() {
    return memo('days', function () {
      var m = {};
      practiced().forEach(function (l) { m[l.date] = (m[l.date] || 0) + (Number(l.min) || 0); });
      Object.keys(m).forEach(function (k) { m[k] = r1(m[k]); });
      return m;
    });
  }
  function minutesOn(d) { return dayTotals()[d] || 0; }

  // 対象（課題ID・セクションID・曲ID）ごとの最終練習日。セクションの練習は曲の練習にも数える
  function lastMap() {
    return memo('last', function () {
      var m = {};
      practiced().forEach(function (l) {
        if (l.targetId) m[l.targetId] = l.date > (m[l.targetId] || '') ? l.date : m[l.targetId];
        if (l.songId) m[l.songId] = l.date > (m[l.songId] || '') ? l.date : m[l.songId];
      });
      return m;
    });
  }
  function lastPracticed(id) { return lastMap()[id] || ''; }

  function streak() {
    return memo('streak', function () {
      var goal = setting('dailyGoal'), days = dayTotals(), t = today();
      var ok = function (d) { return (days[d] || 0) >= goal; };
      var cur = 0, d = ok(t) ? t : addDays(t, -1);
      while (ok(d)) { cur++; d = addDays(d, -1); }
      var dates = Object.keys(days).filter(ok).sort(), best = 0, run = 0, prev = '';
      dates.forEach(function (x) { run = prev && daysBetween(prev, x) === 1 ? run + 1 : 1; best = Math.max(best, run); prev = x; });
      return { current: cur, best: Math.max(best, cur), todayDone: ok(t) };
    });
  }

  /* ---------- 曲 ---------- */
  function songs() { return list('songs').sort(function (a, b) { return (a.order || 0) - (b.order || 0) || (a.title < b.title ? -1 : 1); }); }
  function sectionsOf(songId) { return list('sections').filter(function (s) { return s.songId === songId; }).sort(function (a, b) { return (a.order || 0) - (b.order || 0); }); }
  function mainSong() {
    var id = setting('mainSongId'); var s = id && get('songs', id);
    return s && s.status !== '定着' && s.status !== '休止' ? s : null;
  }
  function songBpm(song, sec) { return (sec && num(sec.bpm)) || num(song.bpm) || null; }
  function stageBpm(song, sec, stage) {
    var b = songBpm(song, sec); if (!b) return null;
    return Math.max(40, Math.round(b * STAGES[stage].pct / 100));
  }
  function nextSection(songId) {
    var secs = sectionsOf(songId).filter(function (s) { return (s.stage || 0) < 4; });
    secs.sort(function (a, b) { return (a.stage || 0) - (b.stage || 0) || (a.order || 0) - (b.order || 0); });
    return secs[0] || null;
  }
  function songPhase(song) {
    var secs = sectionsOf(song.id);
    if (!secs.length) return { phase: 'nosec', label: 'セクション未登録' };
    if (song.settledAt) return { phase: 'settled', label: '定着' };
    var allDone = secs.every(function (s) { return (s.stage || 0) >= 4; });
    if (!allDone) {
      var avg = secs.reduce(function (a, s) { return a + (s.stage || 0); }, 0) / secs.length;
      return { phase: 'sections', label: '途中（' + Math.round(avg / 4 * 100) + '%）', pct: avg / 4 };
    }
    if (!song.throughAt) return { phase: 'through', label: '通し待ち' };
    var wait = setting('settleDays') - daysBetween(song.throughAt, today());
    return wait > 0 ? { phase: 'waiting', label: '定着まであと' + wait + '日', wait: wait } : { phase: 'settle', label: '定着チャレンジ可' };
  }

  function saveSong(p) {
    p = Object.assign({}, p); if (!p.id) delete p.id;
    var s = p.id ? Object.assign({}, get('songs', p.id) || {}, p) : Object.assign({ id: uuid(), order: songs().length + 1, createdAt: today(), status: '練習中' }, p);
    put('songs', normSong(s));
    return D.songs[s.id];
  }
  function deleteSong(id) {
    var s = D.songs[id]; if (!s) return;
    sectionsOf(id).forEach(function (sec) { put('sections', Object.assign({}, sec, { deleted: true }), { silent: true }); });
    put('songs', Object.assign({}, s, { deleted: true }));
    if (setting('mainSongId') === id) setSetting('mainSongId', '');
  }
  function setMainSong(id) {
    var prev = setting('mainSongId');
    if (prev && prev !== id) { var ps = get('songs', prev); if (ps && ps.status === '練習中（メイン）') put('songs', Object.assign({}, ps, { status: '練習中' }), { silent: true }); }
    if (id) { var s = get('songs', id); if (s) put('songs', Object.assign({}, s, { status: '練習中（メイン）' }), { silent: true }); }
    setSetting('mainSongId', id || '');
  }
  function saveSection(p) {
    p = Object.assign({}, p); if (!p.id) delete p.id;
    var s = p.id ? Object.assign({}, get('sections', p.id) || {}, p)
      : Object.assign({ id: uuid(), order: sectionsOf(p.songId).length + 1, stage: 0, stageDates: {} }, p);
    s.bpm = num(s.bpm); s.stage = Number(s.stage) || 0; s.stageDates = s.stageDates || {}; s.deleted = !!s.deleted;
    put('sections', s);
    return D.sections[s.id];
  }
  function moveSection(id, dir) {
    var sec = get('sections', id); if (!sec) return;
    var arr = sectionsOf(sec.songId), i = arr.findIndex(function (s) { return s.id === id; }), j = i + dir;
    if (j < 0 || j >= arr.length) return;
    var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    arr.forEach(function (s, k) { if (s.order !== k + 1) put('sections', Object.assign({}, s, { order: k + 1 }), { silent: true }); });
    changed(); schedule(800);
  }
  // 段階を直接つける／戻す（自己申告）
  function setStage(secId, stage, date) {
    var sec = get('sections', secId); if (!sec) return;
    var dates = Object.assign({}, sec.stageDates || {}), d = date || today();
    if (stage > (sec.stage || 0)) { for (var k = (sec.stage || 0) + 1; k <= stage; k++) if (!dates[k]) dates[k] = d; }
    else { for (var k2 = stage + 1; k2 <= 4; k2++) delete dates[k2]; }
    put('sections', Object.assign({}, sec, { stage: stage, stageDates: dates }));
    // セクションが戻ったら通し・定着も取り消す
    if (stage < 4) {
      var song = get('songs', sec.songId);
      if (song && (song.throughAt || song.settledAt)) put('songs', Object.assign({}, song, { throughAt: '', settledAt: '', status: song.status === '定着' ? '練習中' : song.status }));
    }
  }
  function markThrough(songId, date) {
    var song = get('songs', songId); if (!song) return null;
    var d = date || today(), ph = songPhase(song);
    if (ph.phase === 'through') { put('songs', Object.assign({}, song, { throughAt: d })); return 'through'; }
    if (ph.phase === 'settle') {
      put('songs', Object.assign({}, song, { settledAt: d, status: '定着' }));
      notice('settle:' + song.id, '「' + song.title + '」が定着しました。次のメイン曲を選びましょう。', '#/songs');
      return 'settled';
    }
    return null;
  }
  function undoThrough(songId) {
    var song = get('songs', songId); if (!song) return;
    if (song.settledAt) put('songs', Object.assign({}, song, { settledAt: '', status: '練習中' }));
    else put('songs', Object.assign({}, song, { throughAt: '' }));
  }

  /* ---------- 教材課題の進捗 ---------- */
  function taskRow(id) {
    var t = C.byId[id], r = D.tasks[id];
    if (!t) return null;
    if (!r || r.deleted) r = { id: id, cat: t.cat, grade: t.grade, name: t.name, bpm: null, key: id, okDates: [], masteredAt: '', updatedAt: 0 };
    return r;
  }
  function taskTarget(id) { var r = taskRow(id); return num(r.bpm) || C.byId[id].bpm; }
  function taskInfo(id) {
    var t = C.byId[id], r = taskRow(id), need = setting('masterDays');
    var ok = (r.okDates || []).length;
    return { task: t, row: r, target: taskTarget(id), ok: ok, need: need, mastered: !!r.masteredAt, last: lastPracticed(id),
      status: r.masteredAt ? '習得' : lastPracticed(id) ? '練習中' : '未着手' };
  }
  function setTaskBpm(id, bpm) {
    var r = Object.assign({}, taskRow(id)); r.bpm = num(bpm); put('tasks', r);
  }
  function setTaskMastered(id, on) { // 手動の付け外し（教材画面から）
    var r = Object.assign({}, taskRow(id));
    r.masteredAt = on ? (r.masteredAt || today()) : '';
    if (!on) r.okDates = [];
    put('tasks', r);
    checkGrades();
  }
  function creditTask(id, date, bpm) {
    var r = Object.assign({}, taskRow(id));
    if (bpm < taskTarget(id)) return false;
    var dates = (r.okDates || []).slice();
    if (dates.indexOf(date) < 0) dates.push(date);
    dates.sort(); r.okDates = dates;
    if (!r.masteredAt && dates.length >= setting('masterDays')) {
      r.masteredAt = date;
      notice('master:' + id, '「' + C.byId[id].name + '」を習得しました。', '#/lib');
    }
    put('tasks', r, { silent: true });
    return true;
  }
  function gradeOf(cat) { var g = D.grades[cat]; return g && !g.deleted ? Number(g.grade) || 1 : 1; }
  function gradeStats(cat, grade) {
    var ts = C.forCat(cat, grade), m = ts.filter(function (t) { return !!taskRow(t.id).masteredAt; }).length;
    return { total: ts.length, mastered: m, pct: ts.length ? m / ts.length : 0 };
  }
  function checkGrades() {
    var pct = setting('unlockPct') / 100, any = false;
    C.CATS.forEach(function (cat) {
      var g = gradeOf(cat);
      while (g < 4 && gradeStats(cat, g).pct >= pct - 1e-9) {
        g++;
        put('grades', { id: cat, cat: cat, grade: g, unlockedAt: today(), deleted: false }, { silent: true });
        notice('grade:' + cat + ':' + g, cat + 'のG' + g + 'が解放されました。', '#/lib/' + encodeURIComponent(cat));
        any = true;
      }
    });
    if (any) { changed(); schedule(800); }
  }

  /* ---------- お知らせ（端末内のみ） ---------- */
  function notice(key, text, href) {
    if (meta.notices.some(function (n) { return n.key === key; })) return;
    meta.notices.unshift({ key: key, text: text, href: href || '', at: Date.now(), read: false });
    meta.notices = meta.notices.slice(0, 30);
  }
  function notices() { return meta.notices.filter(function (n) { return !n.read; }); }
  function dismissNotice(key) { meta.notices.forEach(function (n) { if (n.key === key) n.read = true; }); changed(); }

  /* ---------- 記録 ---------- */
  // p: {cat, kind, targetId, targetName, songId, start, end, min, bpm, done, memo, skipped}
  function addLog(p) {
    var start = p.start || Date.now(), end = p.end || start;
    var l = {
      id: p.id || uuid(), date: p.date || ymd(new Date(start)), start: new Date(start).toISOString(), end: new Date(end).toISOString(),
      min: r1(Number(p.min) || 0), cat: p.cat, kind: p.kind || '', targetId: p.targetId || '', targetName: p.targetName || '',
      songId: p.songId || '', bpm: num(p.bpm), done: !!p.done, memo: p.memo || '', device: device(), skipped: !!p.skipped, deleted: false
    };
    put('logs', l, { silent: true });
    applyLog(l);
    changed(); schedule(500);
    return l;
  }
  function updateLog(id, patch) {
    var l = get('logs', id); if (!l) return;
    var n = Object.assign({}, l, patch); n.min = r1(Number(n.min) || 0); n.bpm = num(n.bpm);
    put('logs', n, { silent: true });
    if (patch.done && !l.done) applyLog(n);
    changed(); schedule(500);
  }
  function deleteLog(id) { var l = D.logs[id]; if (l) put('logs', Object.assign({}, l, { deleted: true })); }

  // 達成✓の付いた記録を、進捗（段階・通し・習得）に反映する
  function applyLog(l) {
    if (!l.done || l.skipped) return null;
    var result = null;
    if (l.cat === SONG_CAT) {
      var m = /^S([1-4])$/.exec(l.kind || '');
      if (m && l.targetId) {
        var sec = get('sections', l.targetId), st = Number(m[1]);
        if (sec && (sec.stage || 0) < st) { setStageSilent(sec, st, l.date); result = 'stage'; }
      } else if (l.kind === '通し' && l.songId) {
        result = markThrough(l.songId, l.date);
      }
    } else if (C.byId[l.targetId] && l.bpm) {
      if (creditTask(l.targetId, l.date, l.bpm)) { result = 'credit'; checkGrades(); }
    }
    return result;
  }
  function setStageSilent(sec, stage, date) {
    var dates = Object.assign({}, sec.stageDates || {});
    for (var k = (sec.stage || 0) + 1; k <= stage; k++) if (!dates[k]) dates[k] = date;
    put('sections', Object.assign({}, sec, { stage: stage, stageDates: dates }), { silent: true });
  }

  /* ---------- 放置アラート ---------- */
  function neglect() {
    var t = today(), ws = setting('warnSong'), wt = setting('warnTask'), out = [];
    songs().forEach(function (s) {
      if (s.status === '休止' || s.status === '定着') return;
      var last = lastPracticed(s.id);
      if (!last) { out.push({ kind: 'song', id: s.id, name: s.title, days: 9999, never: true, href: '#/song/' + s.id }); return; }
      var days = daysBetween(last, t);
      if (days >= ws) out.push({ kind: 'song', id: s.id, name: s.title, days: days, href: '#/song/' + s.id });
    });
    var untouched = 0;
    C.CATS.forEach(function (cat) {
      var g = gradeOf(cat);
      C.tasks.forEach(function (task) {
        if (task.cat !== cat || task.grade > g) return;
        var info = taskInfo(task.id);
        if (info.mastered) return;
        if (!info.last) { untouched++; return; }
        var d = daysBetween(info.last, t);
        if (d >= wt) out.push({ kind: 'task', id: task.id, cat: cat, name: task.name, days: d, href: '#/task/' + task.id });
      });
    });
    out.sort(function (a, b) { return b.days - a.days; });
    return { items: out, untouched: untouched };
  }

  /* ---------- 今日のメニュー ---------- */
  function allocFor(total) {
    var tiers = setting('alloc').slice().sort(function (a, b) { return a.min - b.min; }), tier = tiers[0];
    tiers.forEach(function (t) { if (total >= t.min) tier = t; });
    var cats = ['運指', 'コード', 'スケール', SONG_CAT], out = {}, used = 0;
    cats.forEach(function (c) {
      if (c === SONG_CAT) return;
      var v = (tier[c] || 0) > 0 ? Math.max(1, Math.round(total * tier[c] / 100)) : 0;
      out[c] = v; used += v;
    });
    out[SONG_CAT] = Math.max(0, total - used);
    if ((tier[SONG_CAT] || 0) > 0 && out[SONG_CAT] < 1 && total >= 2) { // 曲は最低1分
      var big = cats.slice(0, 3).sort(function (a, b) { return out[b] - out[a]; })[0]; out[big]--; out[SONG_CAT]++;
    }
    return out;
  }

  // 基礎（運指・コード・スケール）の出題候補：解放済みグレードの未習得 → 最終練習日が古い順。習得済みはその後
  function taskCandidates(cat, exclude) {
    var g = gradeOf(cat), ex = exclude || {};
    return C.tasks.filter(function (t) { return t.cat === cat && t.grade <= g && !ex[t.id]; }).map(function (t) { return taskInfo(t.id); })
      .sort(function (a, b) {
        if (a.mastered !== b.mastered) return a.mastered ? 1 : -1;
        if ((a.last || '') !== (b.last || '')) return (a.last || '') < (b.last || '') ? -1 : 1;
        return a.task.grade - b.task.grade || (a.task.id < b.task.id ? -1 : 1);
      });
  }
  function taskItem(info, min) {
    var t = info.task;
    return { cat: t.cat, kind: '課題', targetId: t.id, targetName: t.name, min: min, bpm: info.target,
      note: info.mastered ? '維持（習得済み）' : '習得まで ' + info.ok + '/' + info.need + '日（目標 ♩=' + info.target + '）' };
  }

  function songItems(min) {
    var items = [], song = mainSong();
    if (!song) return [{ cat: SONG_CAT, kind: 'メイン未設定', targetId: '', targetName: 'メイン曲を選んでください', min: min, bpm: null, note: '曲の画面でメイン曲を選ぶと、ここに次のセクションが出ます' }];
    var ph = songPhase(song), budget = min;
    var review = null;
    if (budget >= 6) { // 余裕があればしばらく触っていない曲を復習
      var cand = songs().filter(function (s) { return s.id !== song.id && s.status !== '休止' && sectionsOf(s.id).length; })
        .map(function (s) { return { s: s, last: lastPracticed(s.id) || '0000' }; })
        .sort(function (a, b) { return a.last < b.last ? -1 : 1; })[0];
      if (cand && (cand.last === '0000' || daysBetween(cand.last, today()) >= setting('warnSong'))) {
        var rm = Math.min(setting('reviewMin'), Math.floor(budget / 2));
        review = { cat: SONG_CAT, kind: '復習', targetId: cand.s.id, songId: cand.s.id, targetName: cand.s.title + '（復習・通し1回）', min: rm, bpm: songBpm(cand.s), note: 'しばらく触っていない曲。止まってもいいので最後まで' };
        budget -= rm;
      }
    }
    if (ph.phase === 'nosec') {
      items.push({ cat: SONG_CAT, kind: 'セクション未登録', targetId: song.id, songId: song.id, targetName: song.title, min: budget, bpm: songBpm(song), note: 'まずセクション（イントロ・Aメロ…）を登録すると、段階ごとに出題されます', needsSetup: true });
    } else if (ph.phase === 'through' || ph.phase === 'settle') {
      items.push({ cat: SONG_CAT, kind: '通し', targetId: song.id, songId: song.id, targetName: song.title + '（' + (ph.phase === 'settle' ? '定着チャレンジ' : '通し') + '）', min: budget, bpm: songBpm(song),
        note: ph.phase === 'settle' ? '通し達成から' + setting('settleDays') + '日以上空いた。もう一度頭から最後まで止まらず弾けたら定着' : '全セクションが100%に到達。頭から最後まで止まらず弾く' });
    } else if (ph.phase === 'waiting' || ph.phase === 'settled') {
      var secs = sectionsOf(song.id);
      items.push({ cat: SONG_CAT, kind: '維持', targetId: song.id, songId: song.id, targetName: song.title + '（維持の通し）', min: budget, bpm: songBpm(song), note: ph.label + '。間を空けすぎないよう軽く通す' });
      void secs;
    } else {
      var secList = sectionsOf(song.id).filter(function (s) { return (s.stage || 0) < 4; })
        .sort(function (a, b) { return (a.stage || 0) - (b.stage || 0) || (a.order || 0) - (b.order || 0); });
      var n = budget >= 10 ? 2 : 1, per = Math.floor(budget / Math.min(n, secList.length)), rest = budget;
      secList.slice(0, n).forEach(function (sec, i, arr) {
        var st = (sec.stage || 0) + 1, m = i === arr.length - 1 ? rest : per; rest -= m;
        items.push({ cat: SONG_CAT, kind: 'S' + st, targetId: sec.id, songId: song.id, targetName: song.title + '｜' + sec.name, min: m, bpm: stageBpm(song, sec, st),
          stage: st, note: STAGES[st].label + (songBpm(song, sec) ? '（目標 ♩=' + songBpm(song, sec) + ' の' + STAGES[st].pct + '%）' : '（目標BPM未設定）') + (sec.memo ? '｜' + sec.memo : '') });
      });
    }
    if (review) items.push(review);
    return items;
  }

  // 曲のコード（曲情報の「使うコード」）を優先して出す
  function chordItems(min) {
    var items = [], song = mainSong(), budget = min;
    if (song && song.chords && budget > 0) {
      var m = budget >= 3 ? Math.ceil(budget / 2) : budget;
      items.push({ cat: 'コード', kind: '曲のコード', targetId: song.id, songId: song.id, targetName: song.title + 'のコードチェンジ', min: m, bpm: songBpm(song) ? Math.round(songBpm(song) * 0.6) : 60,
        note: '使うコード：' + song.chords, chords: song.chords });
      budget -= m;
    }
    return items.concat(basicItems('コード', budget));
  }
  function basicItems(cat, min) {
    if (min <= 0) return [];
    var n = Math.max(1, Math.ceil(min / 5)), cands = taskCandidates(cat).slice(0, n), out = [], rest = min;
    cands.forEach(function (info, i) {
      var m = i === cands.length - 1 ? rest : Math.max(1, Math.round(min / cands.length)); rest -= m;
      out.push(taskItem(info, m));
    });
    return out;
  }

  function buildMenu(mode, total) {
    var alloc = mode === 'fixed' ? setting('fixed') : allocFor(Math.max(1, Math.round(total)));
    var items = [];
    items = items.concat(basicItems('運指', alloc['運指'] || 0));
    items = items.concat(chordItems(alloc['コード'] || 0));
    items = items.concat(basicItems('スケール', alloc['スケール'] || 0));
    if ((alloc[SONG_CAT] || 0) > 0) items = items.concat(songItems(alloc[SONG_CAT]));
    items = items.filter(function (it) { return it.min > 0; });
    items.forEach(function (it, i) { it.key = i + ':' + it.targetId; });
    return { mode: mode, total: items.reduce(function (a, b) { return a + b.min; }, 0), alloc: alloc, items: items };
  }
  // 入れ替え：同じ項目の次の候補
  function swapItem(menu, idx) {
    var it = menu.items[idx]; if (!it) return null;
    if (it.cat === SONG_CAT) {
      var song = mainSong(); if (!song) return null;
      var used = {}; menu.items.forEach(function (x) { used[x.targetId] = true; });
      var sec = sectionsOf(song.id).filter(function (s) { return (s.stage || 0) < 4 && !used[s.id]; })[0];
      if (!sec) return null;
      var st = (sec.stage || 0) + 1;
      return { cat: SONG_CAT, kind: 'S' + st, targetId: sec.id, songId: song.id, targetName: song.title + '｜' + sec.name, min: it.min, bpm: stageBpm(song, sec, st), stage: st, note: STAGES[st].label };
    }
    var ex = {}; menu.items.forEach(function (x) { ex[x.targetId] = true; });
    var c = taskCandidates(it.cat, ex)[0];
    return c ? taskItem(c, it.min) : null;
  }

  /* ---------- 分析 ---------- */
  function periodRange(type, anchor) {
    var a = parseYmd(anchor || today()), s, e, label;
    if (type === 'day') { s = e = ymd(a); label = (a.getMonth() + 1) + '月' + a.getDate() + '日（' + '日月火水木金土'[a.getDay()] + '）'; }
    else if (type === 'week') {
      var dow = (a.getDay() + 6) % 7; var st = new Date(a); st.setDate(a.getDate() - dow);
      s = ymd(st); e = addDays(s, 6);
      var ed = parseYmd(e); label = (st.getMonth() + 1) + '/' + st.getDate() + '〜' + (ed.getMonth() + 1) + '/' + ed.getDate();
    } else if (type === 'month') {
      s = ymd(new Date(a.getFullYear(), a.getMonth(), 1)); e = ymd(new Date(a.getFullYear(), a.getMonth() + 1, 0)); label = a.getFullYear() + '年' + (a.getMonth() + 1) + '月';
    } else { s = a.getFullYear() + '-01-01'; e = a.getFullYear() + '-12-31'; label = a.getFullYear() + '年'; }
    return { start: s, end: e, label: label, type: type };
  }
  function shiftAnchor(type, anchor, dir) {
    var a = parseYmd(anchor || today());
    if (type === 'day') a.setDate(a.getDate() + dir);
    else if (type === 'week') a.setDate(a.getDate() + 7 * dir);
    else if (type === 'month') a = new Date(a.getFullYear(), a.getMonth() + dir, 1);
    else a = new Date(a.getFullYear() + dir, 0, 1);
    return ymd(a);
  }
  function analytics(type, anchor) {
    var r = periodRange(type, anchor), cats = ['運指', 'コード', 'スケール', SONG_CAT];
    var ls = practiced().filter(function (l) { return l.date >= r.start && l.date <= r.end; });
    var byCat = {}; cats.forEach(function (c) { byCat[c] = 0; });
    ls.forEach(function (l) { byCat[l.cat] = (byCat[l.cat] || 0) + (Number(l.min) || 0); });
    var total = r1(ls.reduce(function (a, l) { return a + (Number(l.min) || 0); }, 0));
    // 推移の単位：年は月、それ以外は日
    var buckets = [];
    if (type === 'year') {
      for (var m = 0; m < 12; m++) buckets.push({ key: r.start.slice(0, 4) + '-' + p2(m + 1), label: (m + 1) + '月' });
    } else {
      for (var d = r.start; d <= r.end; d = addDays(d, 1)) { var dd = parseYmd(d); buckets.push({ key: d, label: type === 'month' ? String(dd.getDate()) : (dd.getMonth() + 1) + '/' + dd.getDate() + '（' + '日月火水木金土'[dd.getDay()] + '）' }); }
    }
    buckets.forEach(function (b) { b.cats = {}; cats.forEach(function (c) { b.cats[c] = 0; }); b.total = 0; });
    var bi = {}; buckets.forEach(function (b, i) { bi[b.key] = i; });
    ls.forEach(function (l) {
      var k = type === 'year' ? l.date.slice(0, 7) : l.date, b = buckets[bi[k]];
      if (!b) return; b.cats[l.cat] = (b.cats[l.cat] || 0) + (Number(l.min) || 0); b.total += Number(l.min) || 0;
    });
    var days = {}; ls.forEach(function (l) { days[l.date] = (days[l.date] || 0) + (Number(l.min) || 0); });
    var goal = setting('dailyGoal'), dayCount = 0, okCount = 0;
    for (var x = r.start; x <= r.end && x <= today(); x = addDays(x, 1)) { dayCount++; if ((dayTotals()[x] || 0) >= goal) okCount++; }
    return { range: r, total: total, byCat: byCat, buckets: buckets, logs: logs().filter(function (l) { return l.date >= r.start && l.date <= r.end; }), okDays: okCount, dayCount: dayCount };
  }
  // ✓したBPMの伸び（対象ごと、全期間）
  function bpmHistory() {
    return memo('bpmh', function () {
      var m = {};
      practiced().forEach(function (l) {
        if (!l.done || !l.bpm || !l.targetId) return;
        var k = l.targetId, e = m[k] = m[k] || { id: k, name: l.targetName, cat: l.cat, points: [] };
        var last = e.points[e.points.length - 1];
        if (last && last.date === l.date) last.bpm = Math.max(last.bpm, l.bpm); else e.points.push({ date: l.date, bpm: l.bpm });
      });
      return Object.keys(m).map(function (k) { return m[k]; }).filter(function (e) { return e.points.length; })
        .sort(function (a, b) { return a.points[a.points.length - 1].date < b.points[b.points.length - 1].date ? 1 : -1; });
    });
  }
  function monthlyOkDays(year) {
    var goal = setting('dailyGoal'), days = dayTotals(), out = [];
    for (var m = 0; m < 12; m++) {
      var c = 0, n = new Date(year, m + 1, 0).getDate();
      for (var d = 1; d <= n; d++) { var k = year + '-' + p2(m + 1) + '-' + p2(d); if ((days[k] || 0) >= goal) c++; }
      out.push({ month: m + 1, days: c, total: n });
    }
    return out;
  }

  /* ---------- 同期 ---------- */
  function cfg() { return LS.get('gf_cfg', null); }
  var status = { online: navigator.onLine !== false, syncing: false, error: null }, statusCbs = [];
  function statusInfo() { return { online: status.online, syncing: status.syncing, error: status.error, pending: Object.keys(dirty).length, syncedAt: meta.synced, configured: !!cfg() }; }
  function emitStatus() { var s = statusInfo(); statusCbs.forEach(function (f) { try { f(s); } catch (e) {} }); }

  function api(fn, args, timeoutMs) {
    var c = cfg();
    if (!c) { var e0 = new Error('同期が未設定です'); e0.nocfg = true; return Promise.reject(e0); }
    if (navigator.onLine === false) { var e1 = new Error('オフライン'); e1.offline = true; return Promise.reject(e1); }
    var ctl = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctl) ctl.abort(); }, timeoutMs || 60000);
    return fetch(c.api, {
      method: 'POST', body: JSON.stringify({ token: c.token, fn: fn, args: args || [] }),
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, redirect: 'follow', credentials: 'omit', cache: 'no-store',
      signal: ctl ? ctl.signal : undefined
    }).then(function (r) {
      if (!r.ok) { var e = new Error('HTTP ' + r.status); e.offline = true; throw e; }
      return r.json();
    }, function (err) { var e = new Error((err && err.message) || '通信できません'); e.offline = true; throw e; })
      .then(function (j) {
        clearTimeout(timer);
        if (!j.ok) { var msg = String(j.error || 'エラー'); var e = new Error(msg.replace(/^AUTH: /, '')); if (/^AUTH/.test(msg)) e.auth = true; throw e; }
        return j.data;
      }, function (e) { clearTimeout(timer); throw e; });
  }

  var syncing = null, syncTimer = null;
  function sync() {
    if (syncing) return syncing;
    if (!cfg()) return Promise.resolve(null);
    var sent = {}, changes = {};
    TABLES.forEach(function (t) { changes[t] = []; });
    Object.keys(dirty).forEach(function (k) {
      var i = k.indexOf('|'), t = k.slice(0, i), id = k.slice(i + 1);
      if (D[t] && D[t][id]) { changes[t].push(D[t][id]); sent[k] = dirty[k]; }
      else delete dirty[k];
    });
    // シートに課題の一覧がない場合は、読みやすさのため未着手の課題行も送る（updatedAt=1 なので既存行は上書きしない）
    if (!meta.tasksPushed) {
      C.tasks.forEach(function (t) { if (!D.tasks[t.id]) changes.tasks.push(Object.assign(taskRow(t.id), { updatedAt: 1 })); });
    }
    status.syncing = true; emitStatus();
    var p = api('sync', [{ changes: changes, device: device() }], 90000).then(function (res) {
      // 送った分のうち、送信中に変更されていないものを「送信済み」にする
      Object.keys(sent).forEach(function (k) { if (dirty[k] === sent[k]) delete dirty[k]; });
      TABLES.forEach(function (t) {
        var fresh = {};
        (res[t] || []).forEach(function (row) { fresh[row.id] = t === 'songs' ? normSong(row) : row; });
        Object.keys(dirty).forEach(function (k) { // まだ送っていない変更は端末の方を残す
          var i = k.indexOf('|'); if (k.slice(0, i) === t) { var id = k.slice(i + 1); if (D[t][id]) fresh[id] = D[t][id]; }
        });
        D[t] = fresh;
      });
      seedGradesIfMissing();
      meta.tasksPushed = true;
      meta.synced = Date.now();
      status.online = true; status.error = null;
      changed();
      return res;
    }).then(function (v) {
      syncing = null; status.syncing = false; emitStatus();
      if (Object.keys(dirty).length) schedule(1500);
      return v;
    }, function (e) {
      syncing = null; status.syncing = false;
      if (e.offline) status.online = false;
      status.error = e.offline ? null : e;
      emitStatus();
      throw e;
    });
    syncing = p;
    return p;
  }
  function seedGradesIfMissing() {
    C.CATS.forEach(function (cat) { if (!D.grades[cat]) D.grades[cat] = { id: cat, cat: cat, grade: 1, unlockedAt: '', updatedAt: 0 }; });
  }
  function schedule(ms) {
    if (!cfg()) { emitStatus(); return; }
    clearTimeout(syncTimer);
    syncTimer = setTimeout(function () { sync().catch(function () {}); }, ms || 300);
    emitStatus();
  }
  window.addEventListener('online', function () { status.online = true; emitStatus(); schedule(500); });
  window.addEventListener('offline', function () { status.online = false; emitStatus(); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) schedule(300); });
  setInterval(function () { if (Object.keys(dirty).length && cfg() && !document.hidden) sync().catch(function () {}); }, 60000);

  /* ---------- バックアップ ---------- */
  function exportJson() { return JSON.stringify({ app: 'guitar-freak', at: new Date().toISOString(), data: D }, null, 1); }
  function importJson(text) {
    var j = JSON.parse(text);
    if (!j || !j.data) throw new Error('Guitar Freak のバックアップではありません');
    TABLES.forEach(function (t) {
      Object.keys(j.data[t] || {}).forEach(function (id) {
        var row = j.data[t][id], cur = D[t][id];
        if (!cur || (Number(row.updatedAt) || 0) > (Number(cur.updatedAt) || 0)) { D[t][id] = row; dirty[t + '|' + id] = (dirty[t + '|' + id] || 0) + 1; }
      });
    });
    changed(); schedule(500);
  }

  seed();

  return {
    C: C, STAGES: STAGES, SONG_CAT: SONG_CAT, CATS4: ['運指', 'コード', 'スケール', SONG_CAT],
    today: today, addDays: addDays, daysBetween: daysBetween, parseYmd: parseYmd, ymd: ymd, hm: hm, r1: r1, uuid: uuid,
    get: get, list: list, setting: setting, setSetting: setSetting, DEFAULTS: DEFAULTS,
    device: device, setDevice: function (d) { LS.set('gf_device', d); },
    rev: function () { return rev; }, onChange: function (f) { changeCbs.push(f); },
    logs: logs, minutesOn: minutesOn, dayTotals: dayTotals, streak: streak, lastPracticed: lastPracticed,
    songs: songs, sectionsOf: sectionsOf, mainSong: mainSong, songBpm: songBpm, stageBpm: stageBpm, nextSection: nextSection, songPhase: songPhase,
    saveSong: saveSong, deleteSong: deleteSong, setMainSong: setMainSong, saveSection: saveSection, moveSection: moveSection,
    deleteSection: function (id) { var s = D.sections[id]; if (s) put('sections', Object.assign({}, s, { deleted: true })); },
    setStage: setStage, markThrough: function (id) { var r = markThrough(id); changed(); schedule(500); return r; }, undoThrough: undoThrough,
    taskInfo: taskInfo, setTaskBpm: setTaskBpm, setTaskMastered: setTaskMastered, gradeOf: gradeOf, gradeStats: gradeStats, checkGrades: checkGrades,
    notices: notices, dismissNotice: dismissNotice,
    addLog: addLog, updateLog: updateLog, deleteLog: deleteLog,
    neglect: neglect, buildMenu: buildMenu, swapItem: swapItem, allocFor: allocFor,
    analytics: analytics, periodRange: periodRange, shiftAnchor: shiftAnchor, bpmHistory: bpmHistory, monthlyOkDays: monthlyOkDays,
    sync: sync, schedule: schedule, status: statusInfo, onStatus: function (f) { statusCbs.push(f); f(statusInfo()); },
    configured: function () { return !!cfg(); }, cfg: cfg,
    setConfig: function (c) { LS.set('gf_cfg', c); schedule(100); }, clearConfig: function () { LS.del('gf_cfg'); emitStatus(); },
    justSetup: function () { var v = LS.get('gf_justSetup', false); LS.del('gf_justSetup'); return v; },
    exportJson: exportJson, importJson: importJson
  };
})();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
}
