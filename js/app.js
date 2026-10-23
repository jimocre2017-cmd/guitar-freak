/* Guitar Freak 画面 */
(function () {
  'use strict';
  var C = GF.C, A = GF_AUDIO, CAT_COLOR = { 運指: 'var(--c-fing)', コード: 'var(--c-chord)', スケール: 'var(--c-scale)', 楽曲: 'var(--c-song)' };
  var app = document.getElementById('app');
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmtMin(m) { m = Number(m) || 0; return m >= 60 ? Math.floor(m / 60) + '時間' + (Math.round(m % 60) ? Math.round(m % 60) + '分' : '') : GF.r1(m) + '分'; }
  function mmss(ms) { var s = Math.max(0, Math.round(ms / 1000)); return Math.floor(s / 60) + ':' + ('0' + s % 60).slice(-2); }
  function catChip(c) { return '<span class="chip cat-' + esc(c) + '">' + esc(c) + '</span>'; }
  function dayLabel(d) { var x = GF.parseYmd(d); return (x.getMonth() + 1) + '/' + x.getDate() + '（' + '日月火水木金土'[x.getDay()] + '）'; }
  function ago(d) { if (!d) return 'まだ一度も'; var n = GF.daysBetween(d, GF.today()); return n === 0 ? '今日' : n === 1 ? '昨日' : n + '日前'; }

  var toastTimer;
  function toast(msg) { var t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove('on'); }, 2600); }

  /* ---------- テーマ ---------- */
  function applyTheme() { var t = localStorage.getItem('gf_theme') || 'auto'; if (t === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', t); }
  applyTheme();

  /* ---------- シート（下から出るダイアログ） ---------- */
  var sheetClose = null;
  function openSheet(html, onMount, onClose) {
    var w = $('#sheet'), s = $('.sheet', w);
    s.innerHTML = html; w.hidden = false; sheetClose = onClose || null;
    if (onMount) onMount(s);
    var f = $('input,select,textarea', s); if (f && f.dataset.autofocus !== undefined) f.focus();
  }
  function closeSheet() { var w = $('#sheet'); if (w.hidden) return; w.hidden = true; $('.sheet', w).innerHTML = ''; var f = sheetClose; sheetClose = null; if (f) f(); }
  $('#sheet').addEventListener('click', function (e) { if (e.target.hasAttribute('data-close') || e.target.closest('[data-close]')) closeSheet(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeSheet(); });

  /* ---------- 同期の表示 ---------- */
  GF.onStatus(function (s) {
    var el = $('#syncChip'), cls = 'off', txt = '同期なし';
    if (!s.configured) { cls = 'off'; txt = '同期未設定'; }
    else if (s.syncing) { cls = 'wait busy'; txt = '同期中'; }
    else if (s.error) { cls = 'err'; txt = '同期エラー'; }
    else if (!s.online) { cls = 'off'; txt = 'オフライン' + (s.pending ? '・送信待ち' + s.pending : ''); }
    else if (s.pending) { cls = 'wait'; txt = '送信待ち ' + s.pending; }
    else { cls = 'ok'; txt = '同期済み'; }
    el.className = 'sync ' + cls; el.innerHTML = '<i></i>' + esc(txt);
    el.title = s.syncedAt ? '最終同期 ' + new Date(s.syncedAt).toLocaleString('ja-JP') : '';
  });
  $('#syncChip').addEventListener('click', function () {
    if (!GF.configured()) { location.hash = '#/settings'; return; }
    GF.sync().then(function () { toast('同期しました'); }, function (e) { toast(e.offline ? 'オフラインです。記録は端末に保存され、つながったら送ります' : '同期できませんでした：' + e.message); if (e.auth) location.hash = '#/settings'; });
  });

  /* ================= ルーティング ================= */
  var routes = [];
  function route(re, fn, tab) { routes.push({ re: re, fn: fn, tab: tab }); }
  function render() {
    var h = location.hash.replace(/^#/, '') || '/';
    if (h.indexOf('setup=') >= 0) h = '/';
    for (var i = 0; i < routes.length; i++) {
      var m = routes[i].re.exec(h);
      if (m) {
        $$('[data-tab]').forEach(function (a) { a.classList.toggle('on', a.dataset.tab === routes[i].tab); });
        app.innerHTML = '';
        routes[i].fn.apply(null, m.slice(1).map(decodeURIComponent));
        updatePill();
        return;
      }
    }
    location.hash = '#/';
  }
  window.addEventListener('hashchange', function () { closeSheet(); render(); window.scrollTo(0, 0); });
  var rerenderTimer;
  GF.onChange(function () {
    // 練習中の画面は自分で描き直すので、データ更新で全体を描き直さない
    if (/^#\/run/.test(location.hash) || !$('#sheet').hidden) return;
    clearTimeout(rerenderTimer); rerenderTimer = setTimeout(function () { var y = window.scrollY; render(); window.scrollTo(0, y); }, 60);
  });

  /* ================= ホーム ================= */
  route(/^\/$/, function () {
    var t = GF.today(), mins = GF.minutesOn(t), goal = GF.setting('dailyGoal'), st = GF.streak(), main = GF.mainSong();
    var ns = GF.notices(), ng = GF.neglect();
    var h = '';
    ns.slice(0, 3).forEach(function (n) {
      h += '<div class="notice"><span class="flame">●</span>' + (n.href ? '<a href="' + esc(n.href) + '">' + esc(n.text) + '</a>' : esc(n.text)) + '<button data-dismiss="' + esc(n.key) + '" aria-label="閉じる">×</button></div>';
    });
    h += '<div class="hero">';
    h += '<section class="card today">';
    if (mins <= 0) h += '<div class="zero">今日まだ0分<small>' + esc(dayLabel(t)) + '　まず' + goal + '分だけ、ギターを持とう</small></div>';
    else h += '<div class="muted small" style="font-weight:700">今日の練習　' + esc(dayLabel(t)) + '</div><div class="mins num">' + GF.r1(mins) + '<span>分</span></div>';
    var pct = Math.min(100, mins / goal * 100);
    h += '<div class="goalbar' + (mins >= goal ? ' done' : '') + '"><i style="width:' + pct + '%"></i></div>';
    h += '<div class="small ' + (mins >= goal ? '' : 'muted') + '" style="font-weight:700;color:' + (mins >= goal ? 'var(--good)' : '') + '">' + (mins >= goal ? '今日の最低' + goal + '分 達成' : '最低' + goal + '分まで あと' + GF.r1(goal - mins) + '分') + '</div>';
    h += '</section>';
    h += '<section class="card streak"><div class="muted small" style="font-weight:700">連続日数（' + goal + '分以上）</div><div class="big num"><span class="flame">' + (st.current ? '🔥' : '') + '</span>' + st.current + '<span>日</span></div>'
      + '<div class="small muted">最長 ' + st.best + '日' + (st.current && !st.todayDone ? '　・今日やれば ' + (st.current + 1) + '日' : '') + '</div></section>';
    h += '</div>';

    h += '<div class="grid two" style="margin-top:16px"><div class="stack" style="gap:16px">';
    h += '<section class="card start"><div class="ch" style="font-size:13px;color:var(--ink-3);font-weight:700;letter-spacing:.06em">練習を始める（今日は何分？）</div>'
      + '<div class="mins-pick">' + [5, 10, 15, 30, 60].map(function (m) { return '<button data-start="' + m + '">' + m + '<small>分</small></button>'; }).join('') + '</div>'
      + '<div class="row"><button class="btn sp" data-start="custom">分数を入力</button><button class="btn sp" data-start="fixed">固定配分（' + fixedTotal() + '分）</button></div>'
      + '<a class="btn ghost" href="#/free">メニューを使わず自由に練習する →</a></section>';

    h += '<section class="card"><div class="ch">メイン曲<span class="sp"></span>' + (main ? '<a class="small" href="#/song/' + esc(main.id) + '">曲の画面へ</a>' : '') + '</div>';
    if (!main) h += '<div class="empty">メイン曲がまだ選ばれていません。<br><a class="btn pri" style="margin-top:10px" href="#/songs">曲を選ぶ</a></div>';
    else {
      var ph = GF.songPhase(main), nx = GF.nextSection(main.id);
      h += '<div class="row" style="margin-bottom:10px"><b style="font-size:18px">' + esc(main.title) + '</b><span class="chip acc">' + esc(ph.label) + '</span></div>';
      if (ph.phase === 'nosec') h += '<div class="empty" style="padding:12px">セクション（イントロ・Aメロ・サビ…）を登録すると、進捗が見えるようになります。<br><a class="btn" style="margin-top:10px" href="#/song/' + esc(main.id) + '">セクションを登録</a></div>';
      else {
        h += pmap(main, true);
        if (nx) h += '<div class="small" style="margin-top:8px">次に進めるセクション：<b>' + esc(nx.name) + '</b>（' + esc(GF.STAGES[(nx.stage || 0) + 1].label) + '）</div>';
      }
    }
    h += '</section></div>';

    h += '<section class="card"><div class="ch">しばらく触っていないもの</div>';
    if (!ng.items.length && !ng.untouched) h += '<div class="empty">放置しているものはありません。この調子。</div>';
    else {
      h += '<div class="neg">' + ng.items.slice(0, 12).map(function (it) {
        return '<a href="' + esc(it.href) + '">' + (it.kind === 'song' ? catChip('楽曲') : catChip(it.cat)) + '<span>' + esc(it.name) + '</span><span class="d' + (it.days >= 7 && !it.never ? ' hot' : '') + '">'
          + (it.never ? 'まだ一度も弾いていない' : it.days + '日触っていない') + '</span></a>';
      }).join('') + '</div>';
      if (ng.untouched) h += '<div class="small muted" style="margin-top:8px">解放済みで未着手の課題が ' + ng.untouched + ' 件あります。<a href="#/lib">教材を見る</a></div>';
    }
    h += '</section></div>';
    app.innerHTML = h;
    $$('[data-dismiss]').forEach(function (b) { b.onclick = function () { GF.dismissNotice(b.dataset.dismiss); }; });
    $$('[data-start]').forEach(function (b) {
      b.onclick = function () {
        A.unlock();
        var v = b.dataset.start;
        if (v === 'fixed') return planMenu('fixed', fixedTotal());
        if (v === 'custom') {
          openSheet('<h2>今日は何分？<button class="btn ghost sm" data-close>閉じる</button></h2><label class="f">練習する分数<input type="number" id="cm" min="1" max="240" value="20" inputmode="numeric" data-autofocus></label><button class="btn pri big wide" id="cmGo" style="margin-top:14px">メニューを作る</button>', function (s) {
            $('#cmGo', s).onclick = function () { var m = Math.round(Number($('#cm', s).value)); if (!(m > 0)) return toast('1分以上を入れてください'); closeSheet(); planMenu('time', Math.min(240, m)); };
          });
          return;
        }
        planMenu('time', Number(v));
      };
    });
  }, 'home');
  function fixedTotal() { var f = GF.setting('fixed'); return Object.keys(f).reduce(function (a, k) { return a + (Number(f[k]) || 0); }, 0); }

  // セクション×段階のマップ
  function pmap(song, compact) {
    var secs = GF.sectionsOf(song.id), nx = GF.nextSection(song.id), ph = GF.songPhase(song);
    var h = '<div style="overflow-x:auto"><table class="pmap"><thead><tr><th></th>' + GF.STAGES.slice(1).map(function (s) { return '<th>' + (s.n === 1 ? 'ゆっくり' : s.pct + '%') + '</th>'; }).join('') + '</tr></thead><tbody>';
    secs.forEach(function (sec) {
      var isNext = nx && nx.id === sec.id;
      h += '<tr class="' + (isNext ? 'nextrow' : '') + '"><th class="sec" title="' + esc(sec.name) + '">' + esc(sec.name) + '</th>';
      for (var k = 1; k <= 4; k++) {
        var on = (sec.stage || 0) >= k, nxt = isNext && (sec.stage || 0) + 1 === k, dt = (sec.stageDates || {})[k];
        h += '<td class="' + (on ? 'on' : '') + (nxt ? ' next' : '') + (compact ? '' : ' tap') + '" data-sec="' + esc(sec.id) + '" data-st="' + k + '" title="' + esc(dt ? GF.STAGES[k].label + '：' + dt : GF.STAGES[k].label) + '">' + (on && dt ? esc(dt.slice(5).replace('-', '/')) : nxt ? '次' : '') + '</td>';
      }
      h += '</tr>';
    });
    if (!compact || song.throughAt || ph.phase === 'through' || ph.phase === 'settle' || ph.phase === 'waiting') {
      h += '<tr><th class="sec">曲全体</th><td colspan="2" class="whole' + (song.throughAt ? ' on' : '') + (compact ? '' : ' tap') + '" data-through="1" title="通し">' + (song.throughAt ? '通し ' + esc(song.throughAt.slice(5).replace('-', '/')) : '通し') + '</td>'
        + '<td colspan="2" class="whole' + (song.settledAt ? ' on' : '') + (compact ? '' : ' tap') + '" data-through="2" title="定着">' + (song.settledAt ? '定着 ' + esc(song.settledAt.slice(5).replace('-', '/')) : '定着') + '</td></tr>';
    }
    return h + '</tbody></table></div>';
  }

  /* ================= 今日のメニュー ================= */
  var MENU = null;
  function planMenu(mode, total) { MENU = GF.buildMenu(mode, total); location.hash = '#/plan'; }
  route(/^\/plan$/, function () {
    if (!MENU) { location.hash = '#/'; return; }
    var h = '<div class="page-h"><a class="back" href="#/">← ホーム</a></div>'
      + '<div class="page-h"><h1>今日のメニュー（' + MENU.total + '分）</h1><span class="sp"></span><span class="chip">' + (MENU.mode === 'fixed' ? '固定配分' : '時間指定') + '</span></div>'
      + '<p class="muted small" style="margin-top:-8px">曲を軸に、基礎はその補強。合わない項目は「入れ替え」か「外す」で調整してから始めます。</p>'
      + '<div class="menu-list">' + MENU.items.map(function (it, i) {
        return '<div class="mi"><div class="m num">' + it.min + '<small>分</small></div><div style="min-width:0"><div class="row" style="gap:6px">' + catChip(it.cat) + (it.bpm ? '<span class="chip num">♩=' + it.bpm + '</span>' : '') + '</div>'
          + '<div class="t">' + esc(it.targetName) + '</div><div class="n">' + esc(it.note || '') + '</div></div>'
          + '<div class="acts"><button class="iconbtn" data-swap="' + i + '" title="入れ替え" aria-label="入れ替え">⇄</button><button class="iconbtn" data-rm="' + i + '" title="外す" aria-label="外す">×</button></div></div>';
      }).join('') + '</div>'
      + '<div class="row" style="margin-top:16px"><button class="btn pri big sp" id="go"' + (MENU.items.length ? '' : ' disabled') + '>▶ 練習を始める</button></div>';
    app.innerHTML = h;
    $$('[data-swap]').forEach(function (b) { b.onclick = function () { var i = +b.dataset.swap, n = GF.swapItem(MENU, i); if (!n) return toast('入れ替えられる候補がありません'); MENU.items[i] = n; render(); }; });
    $$('[data-rm]').forEach(function (b) { b.onclick = function () { MENU.items.splice(+b.dataset.rm, 1); MENU.total = MENU.items.reduce(function (a, x) { return a + x.min; }, 0); render(); }; });
    $('#go').onclick = function () { A.unlock(); startRun(MENU.items.map(function (x) { return Object.assign({}, x); })); MENU = null; };
  }, 'home');

  /* ================= 練習の実行（タイマー＋メトロノーム） ================= */
  var RUN = null, tick = null, wake = null, autoTimer = null;
  function saveRun() { try { if (RUN) localStorage.setItem('gf_run', JSON.stringify(RUN)); else localStorage.removeItem('gf_run'); } catch (e) {} }
  (function restore() {
    try { var r = JSON.parse(localStorage.getItem('gf_run') || 'null'); if (r && Date.now() - r.createdAt < 6 * 3600000 && !r.ended) RUN = r; } catch (e) {}
  })();
  function newCur(it) { return { accMs: 0, startTs: null, running: false, firstStart: null, done: false, memo: '', extra: 0, finished: false, bpm: it.bpm || A.state().bpm }; }
  function startRun(items, opts) {
    RUN = { items: items, idx: 0, res: items.map(function () { return null; }), createdAt: Date.now(), ended: false, free: !!(opts && opts.free) };
    RUN.cur = newCur(items[0]);
    saveRun();
    location.hash = '#/run';
    setTimeout(function () { startTimer(); }, 50);
  }
  function elapsed() { var c = RUN.cur; return c.accMs + (c.running ? Date.now() - c.startTs : 0); }
  function targetMs() { var it = RUN.items[RUN.idx]; return it.min > 0 ? (it.min + RUN.cur.extra) * 60000 : 0; }
  function startTimer() {
    if (!RUN || RUN.ended) return;
    var c = RUN.cur, it = RUN.items[RUN.idx];
    if (c.running) return;
    c.running = true; c.startTs = Date.now(); if (!c.firstStart) c.firstStart = c.startTs;
    if (it.bpm || c.bpm) A.setBpm(c.bpm || it.bpm);
    if (GF.setting('metAuto') !== false && it.kind !== 'メイン未設定') A.start();
    lockWake(true); saveRun(); paintRun();
  }
  function pauseTimer() {
    var c = RUN.cur; if (!c.running) return;
    c.accMs += Date.now() - c.startTs; c.running = false; c.startTs = null; A.stop(); saveRun(); paintRun();
  }
  function lockWake(on) {
    try {
      if (on && 'wakeLock' in navigator && !wake) navigator.wakeLock.request('screen').then(function (w) { wake = w; w.addEventListener('release', function () { wake = null; }); }).catch(function () {});
      if (!on && wake) { wake.release(); wake = null; }
    } catch (e) {}
  }
  document.addEventListener('visibilitychange', function () { if (!document.hidden && RUN && RUN.cur && RUN.cur.running) lockWake(true); });

  function onTick() {
    if (!RUN || RUN.ended) return;
    var c = RUN.cur, tg = targetMs(), el = elapsed();
    if (tg && !c.finished && el >= tg) {
      c.finished = true; pauseTimer(); c.accMs = Math.min(c.accMs, tg); saveRun(); A.chime(); showFinish(true); return;
    }
    var clock = $('#clock');
    if (clock) {
      clock.textContent = tg ? mmss(tg - el) : mmss(el);
      var bar = $('#ringbar'); if (bar && tg) bar.style.width = Math.min(100, el / tg * 100) + '%';
      var sub = $('#clockSub'); if (sub) sub.textContent = tg ? '経過 ' + mmss(el) + ' ／ ' + (RUN.items[RUN.idx].min + c.extra) + '分' : '経過（時間の指定なし）';
    }
    updatePill();
  }
  setInterval(onTick, 250);

  function updatePill() {
    var p = $('#runPill');
    if (!RUN || RUN.ended || /^#\/run/.test(location.hash)) { p.hidden = true; return; }
    var it = RUN.items[RUN.idx], tg = targetMs(), el = elapsed();
    p.hidden = false; p.textContent = (RUN.cur.running ? '▶ ' : '⏸ ') + '練習中 ' + (tg ? mmss(tg - el) : mmss(el)) + '｜' + it.targetName;
  }

  function doneLabel(it) {
    if (/^S[1-4]$/.test(it.kind)) return ['', 'ゆっくり最後まで弾けた', '60%で止まらず弾けた', '80%で止まらず弾けた', '100%で止まらず弾けた'][it.stage || +it.kind.slice(1)];
    if (it.kind === '通し') return '止まらず最後まで通せた';
    if (it.kind === '課題') return '目標BPMで弾けた';
    if (it.kind === '復習' || it.kind === '維持') return '最後まで通せた';
    return 'うまく弾けた';
  }

  route(/^\/run$/, function () {
    if (!RUN) { location.hash = '#/'; return; }
    if (RUN.ended) return paintSummary();
    paintRun();
  }, 'home');

  function paintRun() {
    if (!/^#\/run/.test(location.hash) || !RUN || RUN.ended) return;
    var it = RUN.items[RUN.idx], c = RUN.cur, task = C.byId[it.targetId], tg = targetMs(), el = elapsed();
    var h = '<div class="run"><div class="stack" style="gap:16px"><section class="card">';
    h += '<div class="run-h"><span>' + (RUN.idx + 1) + ' / ' + RUN.items.length + '</span><div class="prog">' + RUN.items.map(function (x, i) {
      var r = RUN.res[i]; return '<i class="' + (i === RUN.idx ? 'c' : r ? (r.skipped ? 's' : 'd') : '') + '"></i>';
    }).join('') + '</div><button class="btn ghost sm" id="quit">やめる</button></div>';
    h += '<div class="row" style="gap:6px;margin-top:12px">' + catChip(it.cat) + (it.bpm ? '<span class="chip num">目標 ♩=' + it.bpm + '</span>' : '') + (it.kind && it.kind !== '課題' ? '<span class="chip">' + esc(/^S/.test(it.kind) ? GF.STAGES[+it.kind.slice(1)].label : it.kind) + '</span>' : '') + '</div>';
    h += '<div class="run-title">' + esc(it.targetName) + '</div>';
    if (it.note) h += '<div class="run-note">' + esc(it.note) + '</div>';
    h += '<div class="timer"><div class="clock num" id="clock">' + (tg ? mmss(tg - el) : mmss(el)) + '</div><div class="sub" id="clockSub"></div></div>';
    if (tg) h += '<div class="ring"><i id="ringbar" style="width:' + Math.min(100, el / tg * 100) + '%"></i></div>';
    h += '<div class="ctrls">'
      + (c.running ? '<button class="btn big" id="pp">⏸<small>一時停止</small></button>' : '<button class="btn pri big" id="pp">▶<small>' + (c.firstStart ? '再開' : '開始') + '</small></button>')
      + (tg ? '<button class="btn big" id="plus">+1分<small>延長</small></button>' : '<button class="btn big" id="setmin">⏱<small>時間を決める</small></button>')
      + '<button class="btn big" id="next">' + (RUN.idx === RUN.items.length - 1 ? '■' : '⏭') + '<small>' + (c.firstStart ? '終えて次へ' : 'スキップ') + '</small></button>'
      + '</div>';
    h += '<button class="donebtn' + (c.done ? ' on' : '') + '" id="done"><span class="box">' + (c.done ? '✓' : '') + '</span>' + esc(doneLabel(it)) + '</button>';
    if (c.done && it.kind === '課題' && A.state().bpm < it.bpm) h += '<div class="hintline">いまのBPM（' + A.state().bpm + '）は目標（' + it.bpm + '）より遅いので、習得の日数には数えません</div>';
    h += '<div class="row" style="margin-top:10px"><button class="btn ghost sm" id="memoBtn">✎ メモ' + (c.memo ? '（あり）' : '') + '</button>'
      + (!c.firstStart && !RUN.free ? '<button class="btn ghost sm" id="swap">⇄ 入れ替え</button>' : '') + '<span class="sp"></span>'
      + (it.songId ? '<a class="btn ghost sm" href="#/song/' + esc(it.songId) + '">曲の情報</a>' : '') + (task ? '<a class="btn ghost sm" href="#/task/' + esc(task.id) + '">教材の説明</a>' : '') + '</div>';
    h += '</section>';
    // 教材・曲の中身
    h += itemContent(it);
    h += '</div><div class="side"><section class="card">' + metPanel(it) + '</section>';
    if (RUN.items.length > 1) {
      h += '<section class="card" style="margin-top:16px"><div class="ch">このあと</div><div class="menu-list">' + RUN.items.map(function (x, i) {
        var r = RUN.res[i];
        return '<div class="mi' + (i === RUN.idx ? ' cur' : '') + (r && r.skipped ? ' skipped' : r ? ' done' : '') + '" style="padding:8px 10px"><div class="m num" style="font-size:15px;min-width:34px">' + (r && !r.skipped ? '✓' : x.min + '<small>分</small>') + '</div><div style="min-width:0"><div class="t small">' + esc(x.targetName) + '</div></div></div>';
      }).join('') + '</div></section>';
    }
    h += '</div></div>';
    app.innerHTML = h;
    onTick();
    bindMet(app);
    $('#pp').onclick = function () { A.unlock(); RUN.cur.running ? pauseTimer() : startTimer(); };
    if ($('#plus')) $('#plus').onclick = function () { RUN.cur.extra += 1; RUN.cur.finished = false; saveRun(); paintRun(); };
    if ($('#setmin')) $('#setmin').onclick = function () {
      openSheet('<h2>時間を決める<button class="btn ghost sm" data-close>閉じる</button></h2><label class="f">分<input type="number" id="sm" min="1" max="240" value="10" data-autofocus></label><button class="btn pri big wide" id="smGo" style="margin-top:14px">決める</button>', function (s) {
        $('#smGo', s).onclick = function () { var m = Math.round(Number($('#sm', s).value)); if (!(m > 0)) return; RUN.items[RUN.idx].min = m; saveRun(); closeSheet(); paintRun(); };
      });
    };
    $('#next').onclick = function () { if (!RUN.cur.firstStart) return skipItem(); pauseTimer(); showFinish(false); };
    $('#done').onclick = function () { RUN.cur.done = !RUN.cur.done; saveRun(); paintRun(); };
    $('#memoBtn').onclick = function () {
      openSheet('<h2>メモ<button class="btn ghost sm" data-close>閉じる</button></h2><textarea id="mm" placeholder="弾けなかった箇所など" data-autofocus>' + esc(RUN.cur.memo) + '</textarea><button class="btn pri big wide" id="mmGo" style="margin-top:12px">保存</button>', function (s) {
        $('#mmGo', s).onclick = function () { RUN.cur.memo = $('#mm', s).value.trim(); saveRun(); closeSheet(); paintRun(); };
      });
    };
    if ($('#swap')) $('#swap').onclick = function () { var n = GF.swapItem({ items: RUN.items }, RUN.idx); if (!n) return toast('入れ替えられる候補がありません'); A.stop(); RUN.items[RUN.idx] = n; RUN.cur = newCur(n); saveRun(); paintRun(); };
    $('#quit').onclick = function () {
      openSheet('<h2>練習をやめる</h2><p class="small">ここまでの記録は保存されています。いまの項目' + (RUN.cur.firstStart ? '（' + mmss(elapsed()) + '）' : '') + 'はどうしますか？</p><div class="stack">'
        + (RUN.cur.firstStart ? '<button class="btn pri big" id="q1">いまの項目を記録してやめる</button>' : '') + '<button class="btn big" id="q2">記録せずにやめる</button><button class="btn ghost" data-close>続ける</button></div>', function (s) {
        if ($('#q1', s)) $('#q1', s).onclick = function () { closeSheet(); saveCurrent(false); endRun(); };
        $('#q2', s).onclick = function () { closeSheet(); endRun(); };
      });
    };
  }

  function itemContent(it) {
    var task = C.byId[it.targetId], h = '';
    if (task) {
      h += '<section class="card"><div class="ch">' + esc(task.cat) + ' G' + task.grade + '｜教材</div><p class="run-note" style="margin-top:0">' + esc(task.desc) + '</p><div class="dgs">' + task.diagrams.map(GF_DIAG.render).join('') + '</div>'
        + (task.changes ? '<div class="ch" style="margin-top:14px">よく使うチェンジ</div><ul class="changes">' + task.changes.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : '') + '</section>';
    } else if (it.songId) {
      var song = GF.get('songs', it.songId), sec = GF.get('sections', it.targetId);
      if (song) {
        h += '<section class="card"><div class="ch">曲の情報</div>';
        if (sec) h += '<div class="small"><b>' + esc(sec.name) + '</b>' + (sec.bars ? '　小節 ' + esc(sec.bars) : '') + (sec.memo ? '<br>' + esc(sec.memo) : '') + '</div>';
        h += songMeta(song) + '</section>';
        if (it.kind === 'セクション未登録') h += '<section class="card"><a class="btn pri wide" href="#/song/' + esc(song.id) + '">セクションを登録する</a></section>';
      }
    } else if (it.kind === 'メイン未設定') h += '<section class="card"><a class="btn pri wide" href="#/songs">メイン曲を選ぶ</a></section>';
    return h;
  }
  function songMeta(song) {
    var h = '<div class="stack small" style="gap:6px;margin-top:8px">';
    var bits = [];
    if (song.bpm) bits.push('原曲 ♩=' + song.bpm);
    if (song.tuning) bits.push('チューニング ' + song.tuning);
    if (song.capo) bits.push('カポ ' + song.capo);
    if (bits.length) h += '<div class="muted">' + esc(bits.join('　')) + '</div>';
    if (song.chords) h += '<div>使うコード：<b>' + esc(song.chords) + '</b></div>';
    if (song.book) h += '<div>手持ち譜面：' + esc(song.book) + '</div>';
    if (song.links && song.links.length) h += '<div class="links">' + song.links.map(function (l) { return '<a href="' + esc(l.url) + '" target="_blank" rel="noopener">' + esc(l.label || l.url) + '</a>'; }).join('') + '</div>';
    return h + '</div>';
  }

  function skipItem() {
    var it = RUN.items[RUN.idx];
    GF.addLog({ cat: it.cat, kind: it.kind, targetId: it.targetId, targetName: it.targetName, songId: it.songId, start: Date.now(), end: Date.now(), min: 0, bpm: it.bpm, skipped: true, memo: 'スキップ' });
    RUN.res[RUN.idx] = { skipped: true };
    advance();
  }
  function saveCurrent(fromFinish, patch) {
    var it = RUN.items[RUN.idx], c = RUN.cur, el = elapsed();
    var min = patch && patch.min != null ? patch.min : el / 60000;
    var l = GF.addLog({ cat: it.cat, kind: it.kind, targetId: it.targetId, targetName: it.targetName, songId: it.songId, start: c.firstStart || Date.now(), end: Date.now(),
      min: min, bpm: patch && patch.bpm != null ? patch.bpm : A.state().bpm, done: patch && patch.done != null ? patch.done : c.done, memo: patch && patch.memo != null ? patch.memo : c.memo });
    RUN.res[RUN.idx] = { min: l.min, done: l.done, id: l.id };
    return l;
  }
  function advance() {
    clearInterval(autoTimer); A.stop();
    RUN.idx++;
    if (RUN.idx >= RUN.items.length) return endRun();
    RUN.cur = newCur(RUN.items[RUN.idx]);
    saveRun(); paintRun();
  }
  function endRun() {
    A.stop(); lockWake(false); clearInterval(autoTimer);
    if (!RUN) return;
    RUN.ended = true; saveRun();
    var r = RUN; RUN = null; saveRun(); RUN_SUMMARY = r;
    if (/^#\/run/.test(location.hash)) paintSummary(); else updatePill();
  }
  var RUN_SUMMARY = null;
  function paintSummary() {
    var r = RUN_SUMMARY; location.hash !== '#/run' && (location.hash = '#/run');
    if (!r) { location.hash = '#/'; return; }
    var done = r.res.filter(function (x) { return x && !x.skipped; }), mins = done.reduce(function (a, x) { return a + (x.min || 0); }, 0);
    var today = GF.minutesOn(GF.today()), goal = GF.setting('dailyGoal'), st = GF.streak();
    var h = '<section class="card" style="max-width:560px;margin:20px auto;text-align:center"><div style="font-size:44px">' + (today >= goal ? '🎸' : '👍') + '</div><h1 style="font-size:24px;font-weight:900;margin:6px 0 8px">おつかれさま</h1>'
      + '<p class="muted">今回 ' + fmtMin(GF.r1(mins)) + '・今日の合計 <b style="color:var(--ink)">' + fmtMin(today) + '</b></p>'
      + (today >= goal ? '<p style="color:var(--good);font-weight:800">今日の最低' + goal + '分 達成。連続 ' + st.current + '日</p>' : '<p>あと' + GF.r1(goal - today) + '分で今日の最低ラインです</p>')
      + '<div class="menu-list" style="text-align:left;margin:16px 0">' + r.items.map(function (x, i) {
        var res = r.res[i];
        return '<div class="mi' + (res && res.skipped ? ' skipped' : res ? ' done' : '') + '" style="padding:8px 10px"><div class="m num" style="font-size:15px">' + (res && !res.skipped ? GF.r1(res.min) + '<small>分</small>' : '－') + '</div><div><div class="t small">' + esc(x.targetName) + '</div><div class="n">' + (res ? res.skipped ? 'スキップ' : res.done ? '✓ ' + esc(doneLabel(x)) : '' : '未実施') + '</div></div></div>';
      }).join('') + '</div>'
      + GF.notices().slice(0, 3).map(function (n) { return '<div class="notice">' + esc(n.text) + '</div>'; }).join('')
      + '<div class="row"><a class="btn pri big sp" href="#/">ホームへ</a><a class="btn big sp" href="#/stats">記録を見る</a></div></section>';
    app.innerHTML = h;
  }

  function showFinish(auto) {
    var it = RUN.items[RUN.idx], c = RUN.cur, el = elapsed();
    var curBpm = A.state().bpm;
    var html = '<div class="finish" id="finish"><div class="card"><h2>' + (auto ? '時間になりました' : 'この項目を終える') + '</h2>'
      + '<div class="small muted">' + esc(it.targetName) + '</div>'
      + '<button class="donebtn' + (c.done ? ' on' : '') + '" id="fDone"><span class="box">' + (c.done ? '✓' : '') + '</span>' + esc(doneLabel(it)) + '</button>'
      + '<div class="fgrid"><label class="f">時間（分）<input type="number" id="fMin" step="0.1" min="0" value="' + GF.r1(el / 60000) + '"></label><label class="f">BPM<input type="number" id="fBpm" min="40" max="240" value="' + curBpm + '"></label>'
      + '<label class="f full">メモ<input type="text" id="fMemo" value="' + esc(c.memo) + '" placeholder="弾けなかった箇所など"></label></div>'
      + '<button class="btn pri big wide" id="fSave">' + (RUN.idx === RUN.items.length - 1 ? '保存して終わる' : '保存して次へ') + (auto ? ' <span id="fCount">(10)</span>' : '') + '</button>'
      + '<div class="row"><button class="btn sp" id="fMore">+1分 続ける</button>' + (auto ? '' : '<button class="btn sp ghost" id="fBack">戻る</button>') + '</div></div></div>';
    var wrap = document.createElement('div'); wrap.innerHTML = html; document.body.appendChild(wrap.firstChild);
    var box = $('#finish'), n = 10;
    function stopAuto() { clearInterval(autoTimer); var cc = $('#fCount'); if (cc) cc.remove(); }
    box.addEventListener('input', stopAuto); box.addEventListener('pointerdown', function (e) { if (e.target.id !== 'fSave') stopAuto(); });
    $('#fDone').onclick = function () { c.done = !c.done; this.classList.toggle('on', c.done); $('.box', this).textContent = c.done ? '✓' : ''; saveRun(); };
    function close() { stopAuto(); box.remove(); }
    $('#fSave').onclick = function () {
      var min = Number($('#fMin').value), bpm = Number($('#fBpm').value), memo = $('#fMemo').value.trim();
      close();
      var l = saveCurrent(true, { min: isNaN(min) ? null : min, bpm: bpm || null, memo: memo, done: c.done });
      if (l.done) {
        if (/^S/.test(it.kind)) toast('「' + it.targetName.split('｜').pop() + '」を ' + GF.STAGES[+it.kind.slice(1)].label + ' に進めました');
        else if (it.kind === '課題' && l.bpm >= it.bpm) toast('目標BPMで✓。習得まで ' + GF.taskInfo(it.targetId).ok + '/' + GF.setting('masterDays') + '日');
      }
      advance();
    };
    $('#fMore').onclick = function () { close(); c.extra += 1; c.finished = false; saveRun(); startTimer(); };
    if ($('#fBack')) $('#fBack').onclick = function () { close(); };
    if (auto) {
      clearInterval(autoTimer);
      autoTimer = setInterval(function () { n--; var cc = $('#fCount'); if (cc) cc.textContent = '(' + n + ')'; if (n <= 0) { clearInterval(autoTimer); var b = $('#fSave'); if (b) b.click(); } }, 1000);
    }
  }

  /* ---------- メトロノーム（練習画面と♩ボタン共通） ---------- */
  function metPanel(it) {
    var s = A.state();
    var h = '<div class="met"><div class="ch" style="font-size:13px;color:var(--ink-3);font-weight:700;letter-spacing:.06em;margin:0">メトロノーム</div>'
      + '<div class="beats" id="beats">' + beatDots(s.meter) + '</div>'
      + '<div class="bpmrow"><button class="adj s" data-bpm="-5">−5</button><button class="adj" data-bpm="-1">−</button><div class="bpm num" id="bpmV">' + s.bpm + '<small>BPM</small></div><button class="adj" data-bpm="1">＋</button><button class="adj s" data-bpm="5">＋5</button></div>'
      + '<input type="range" min="40" max="240" value="' + s.bpm + '" id="bpmR" aria-label="BPM">';
    var base = it && (it.kind === '課題' ? it.bpm : it.songId ? GF.songBpm(GF.get('songs', it.songId) || {}, GF.get('sections', it.targetId)) : null);
    if (base) h += '<div class="pcts">' + [50, 60, 80, 100].map(function (p) { return '<button class="btn sm" data-pct="' + Math.round(base * p / 100) + '">' + p + '%（' + Math.round(base * p / 100) + '）</button>'; }).join('') + '</div>';
    h += '<button class="btn big wide ' + (s.running ? '' : 'pri') + '" id="metGo">' + (s.running ? '■ 止める' : '▶ 鳴らす') + '</button>'
      + '<div class="row"><select id="meter" aria-label="拍子" style="flex:1">' + A.METERS.map(function (m) { return '<option' + (m === s.meter ? ' selected' : '') + '>' + m + '</option>'; }).join('') + '</select>'
      + '<button class="btn" id="acc" style="flex:1">' + (s.accent ? 'アクセント あり' : 'アクセント なし') + '</button><button class="btn" id="tap" style="flex:1">タップ</button></div>'
      + '<label class="f">音量<input type="range" min="0" max="1" step="0.05" value="' + s.volume + '" id="vol"></label></div>';
    return h;
  }
  function beatDots(meter) { var n = +meter.split('/')[0]; var h = ''; for (var i = 0; i < n; i++) h += '<i class="' + (i === 0 || (meter === '6/8' && i === 3) ? 'a' : '') + '"></i>'; return h; }
  function bindMet(root) {
    function upd() { var s = A.state(); var v = $('#bpmV', root); if (v) v.innerHTML = s.bpm + '<small>BPM</small>'; var r = $('#bpmR', root); if (r) r.value = s.bpm; if (RUN && RUN.cur) { RUN.cur.bpm = s.bpm; } }
    $$('[data-bpm]', root).forEach(function (b) { b.onclick = function () { A.setBpm(A.state().bpm + Number(b.dataset.bpm)); upd(); }; });
    $$('[data-pct]', root).forEach(function (b) { b.onclick = function () { A.setBpm(Number(b.dataset.pct)); upd(); }; });
    var r = $('#bpmR', root); if (r) r.oninput = function () { A.setBpm(r.value); upd(); };
    var g = $('#metGo', root); if (g) g.onclick = function () { A.toggle(); var s = A.state(); g.textContent = s.running ? '■ 止める' : '▶ 鳴らす'; g.classList.toggle('pri', !s.running); };
    var m = $('#meter', root); if (m) m.onchange = function () { A.setMeter(m.value); var bt = $('#beats', root); if (bt) bt.innerHTML = beatDots(m.value); };
    var a = $('#acc', root); if (a) a.onclick = function () { A.setAccent(!A.state().accent); a.textContent = A.state().accent ? 'アクセント あり' : 'アクセント なし'; };
    var t = $('#tap', root); if (t) t.onclick = function () { A.unlock(); A.tap(); upd(); };
    var vl = $('#vol', root); if (vl) vl.oninput = function () { A.setVolume(vl.value); };
  }
  A.onBeat(function (b) { $$('#beats i').forEach(function (el, i) { el.classList.toggle('on', i === b); }); });
  A.onState(function (s) { $('#metFab').classList.toggle('on', s.running); var g = $('#metGo'); if (g) { g.textContent = s.running ? '■ 止める' : '▶ 鳴らす'; g.classList.toggle('pri', !s.running); } });
  $('#metFab').onclick = function () {
    A.unlock();
    openSheet('<h2>メトロノーム<button class="btn ghost sm" data-close>閉じる</button></h2>' + metPanel(RUN && RUN.items[RUN.idx]), function (s) { bindMet(s); });
  };
  // 練習中でない時だけ、閉じたら止めるか聞かない（そのまま鳴らし続ける）

  /* ================= 自由練習 ================= */
  route(/^\/free(?:\/(.+))?$/, function (pre) {
    var cats = GF.CATS4, sel = { cat: '運指', target: null, stage: 1, min: 0 };
    if (pre) {
      var t = C.byId[pre], sec = GF.get('sections', pre), sg = GF.get('songs', pre);
      if (t) { sel.cat = t.cat; sel.target = t.id; }
      else if (sec) { sel.cat = '楽曲'; sel.target = 'sec:' + sec.id; sel.stage = Math.min(4, (sec.stage || 0) + 1); }
      else if (sg) { sel.cat = '楽曲'; sel.target = 'song:' + sg.id; }
    }
    function targetsFor(cat) {
      if (cat === '楽曲') {
        var o = [];
        GF.songs().forEach(function (s) {
          o.push({ v: 'song:' + s.id, l: s.title + '（曲全体・通し）' });
          GF.sectionsOf(s.id).forEach(function (sec) { o.push({ v: 'sec:' + sec.id, l: s.title + '｜' + sec.name }); });
        });
        return o;
      }
      var g = GF.gradeOf(cat);
      return C.forCat(cat).map(function (t) { return { v: t.id, l: 'G' + t.grade + ' ' + t.name + (t.grade > g ? '（未解放）' : '') }; });
    }
    function draw() {
      var ts = targetsFor(sel.cat);
      if (sel.target !== '' && !ts.some(function (x) { return x.v === sel.target; })) sel.target = ts.length ? ts[0].v : '';
      var isSec = /^sec:/.test(sel.target);
      var h = '<div class="page-h"><a class="back" href="#/">← ホーム</a></div><div class="page-h"><h1>自由練習</h1></div>'
        + '<section class="card" style="max-width:620px"><div class="stack">'
        + '<div class="seg" id="fcat">' + cats.map(function (c) { return '<button data-c="' + c + '" class="' + (c === sel.cat ? 'on' : '') + '">' + c + '</button>'; }).join('') + '</div>'
        + '<label class="f">対象<select id="ftg">' + ts.map(function (x) { return '<option value="' + esc(x.v) + '"' + (x.v === sel.target ? ' selected' : '') + '>' + esc(x.l) + '</option>'; }).join('') + '<option value=""' + (sel.target === '' ? ' selected' : '') + '>（指定しない）</option></select></label>'
        + (isSec ? '<label class="f">目指す段階<select id="fst">' + GF.STAGES.slice(1).map(function (s) { return '<option value="' + s.n + '"' + (s.n === sel.stage ? ' selected' : '') + '>' + s.label + '</option>'; }).join('') + '</select></label>' : '')
        + (sel.target === '' ? '<label class="f">内容（任意）<input type="text" id="fname" placeholder="例：コードの耳コピ"></label>' : '')
        + '<label class="f">時間（分）<input type="number" id="fmin" min="0" max="240" value="' + (sel.min || '') + '" placeholder="空欄なら時間を決めずに計る"></label>'
        + '<button class="btn pri big" id="fgo">▶ 始める</button></div></section>';
      app.innerHTML = h;
      $$('#fcat button').forEach(function (b) { b.onclick = function () { sel.cat = b.dataset.c; sel.target = null; sel.min = Number($('#fmin').value) || 0; draw(); }; });
      $('#ftg').onchange = function () { sel.target = this.value; sel.min = Number($('#fmin').value) || 0; if (/^sec:/.test(sel.target)) { var sc = GF.get('sections', sel.target.slice(4)); sel.stage = Math.min(4, ((sc && sc.stage) || 0) + 1); } draw(); };
      if ($('#fst')) $('#fst').onchange = function () { sel.stage = +this.value; };
      $('#fgo').onclick = function () {
        A.unlock();
        var min = Math.round(Number($('#fmin').value) || 0), it;
        if (sel.cat === '楽曲' && /^sec:/.test(sel.target)) {
          var sec = GF.get('sections', sel.target.slice(4)), song = GF.get('songs', sec.songId);
          it = { cat: '楽曲', kind: 'S' + sel.stage, stage: sel.stage, targetId: sec.id, songId: song.id, targetName: song.title + '｜' + sec.name, bpm: GF.stageBpm(song, sec, sel.stage), min: min, note: GF.STAGES[sel.stage].label };
        } else if (sel.cat === '楽曲' && /^song:/.test(sel.target)) {
          var sg = GF.get('songs', sel.target.slice(5)), ph = GF.songPhase(sg);
          var canThrough = ph.phase === 'through' || ph.phase === 'settle';
          it = { cat: '楽曲', kind: canThrough ? '通し' : '維持', targetId: sg.id, songId: sg.id, targetName: sg.title + (canThrough ? '（通し）' : '（曲全体）'), bpm: GF.songBpm(sg), min: min,
            note: canThrough ? '止まらず最後まで弾けたら ✓' : '全セクションが100%になると「通し」に✓できるようになります' };
        } else if (C.byId[sel.target]) {
          var info = GF.taskInfo(sel.target);
          it = { cat: sel.cat, kind: '課題', targetId: sel.target, targetName: info.task.name, bpm: info.target, min: min, note: '習得まで ' + info.ok + '/' + info.need + '日（目標 ♩=' + info.target + '）' };
        } else {
          var nm = ($('#fname') && $('#fname').value.trim()) || sel.cat + 'の自由練習';
          it = { cat: sel.cat, kind: '自由', targetId: '', targetName: nm, bpm: null, min: min };
        }
        startRun([it], { free: true });
      };
    }
    draw();
  }, 'home');

  /* ================= 曲 ================= */
  route(/^\/songs$/, function () {
    var main = GF.mainSong(), ss = GF.songs();
    var h = '<div class="page-h"><h1>曲</h1><span class="sp"></span><button class="btn pri" id="addSong">＋ 曲を追加</button></div>';
    if (!main) h += '<div class="notice">メイン曲を選ぶと、毎日のメニューにその曲の次のセクションが出ます。曲を開いて「メイン曲にする」を押してください。</div>';
    var groups = [['練習中', function (s) { return s.status !== '定着' && s.status !== '休止'; }], ['定着', function (s) { return s.status === '定着'; }], ['休止', function (s) { return s.status === '休止'; }]];
    groups.forEach(function (g) {
      var list = ss.filter(g[1]); if (!list.length) return;
      h += '<h2 class="muted small" style="margin:18px 0 10px;letter-spacing:.06em">' + g[0] + '（' + list.length + '）</h2><div class="songs">';
      list.forEach(function (s) {
        var ph = GF.songPhase(s), isMain = main && main.id === s.id, last = GF.lastPracticed(s.id);
        var secs = GF.sectionsOf(s.id), pct = secs.length ? secs.reduce(function (a, x) { return a + (x.stage || 0); }, 0) / (secs.length * 4) : 0;
        h += '<a class="card song' + (isMain ? ' main' : '') + '" href="#/song/' + esc(s.id) + '"><div class="row nowrap"><div style="min-width:0"><div class="tt">' + esc(s.title) + '</div><div class="ar">' + esc(s.artist) + '</div></div><span class="sp"></span>' + (isMain ? '<span class="chip acc">メイン</span>' : '') + '</div>'
          + '<div class="meter"><i style="width:' + (s.settledAt ? 100 : pct * 100) + '%;background:' + (s.settledAt ? 'var(--good)' : 'var(--c-song)') + '"></i></div>'
          + '<div class="row small muted"><span>' + esc(ph.label) + '</span><span class="sp"></span><span>最終練習：' + esc(ago(last)) + '</span></div></a>';
      });
      h += '</div>';
    });
    app.innerHTML = h;
    $('#addSong').onclick = function () { songForm(null); };
  }, 'songs');

  function songForm(song) {
    var s = song || { title: '', artist: '', bpm: '', tuning: '', capo: '', links: [], book: '', chords: '', status: '練習中' };
    var links = (s.links || []).map(function (l) { return (l.label ? l.label + ' ' : '') + l.url; }).join('\n');
    openSheet('<h2>' + (song ? '曲を編集' : '曲を追加') + '<button class="btn ghost sm" data-close>閉じる</button></h2><div class="fgrid">'
      + '<label class="f full">曲名 *<input type="text" id="sT" value="' + esc(s.title) + '" data-autofocus></label>'
      + '<label class="f full">アーティスト<input type="text" id="sA" value="' + esc(s.artist) + '"></label>'
      + '<label class="f">目標BPM（原曲）<input type="number" id="sB" value="' + esc(s.bpm || '') + '" min="40" max="240"></label>'
      + '<label class="f">ステータス<select id="sS">' + ['練習中', '練習中（メイン）', '定着', '休止'].map(function (x) { return '<option' + (x === s.status ? ' selected' : '') + '>' + x + '</option>'; }).join('') + '</select></label>'
      + '<label class="f">チューニング<input type="text" id="sTu" value="' + esc(s.tuning) + '" placeholder="例：レギュラー"></label>'
      + '<label class="f">カポ<input type="text" id="sC" value="' + esc(s.capo) + '" placeholder="例：2"></label>'
      + '<label class="f full">使うコード（メニューのコード練習で優先）<input type="text" id="sCh" value="' + esc(s.chords) + '" placeholder="例：Am7 D7 Gmaj7"></label>'
      + '<label class="f full">譜面リンク（1行に1つ。「表示名 URL」でも可）<textarea id="sL" placeholder="TAB譜 https://...">' + esc(links) + '</textarea></label>'
      + '<label class="f full">手持ち譜面（書籍名・ページ）<input type="text" id="sBk" value="' + esc(s.book) + '"></label></div>'
      + '<div class="row" style="margin-top:14px">' + (song ? '<button class="btn danger" id="sDel">削除</button>' : '') + '<span class="sp"></span><button class="btn pri big" id="sSave">保存</button></div>', function (root) {
      $('#sSave', root).onclick = function () {
        var title = $('#sT', root).value.trim(); if (!title) return toast('曲名を入れてください');
        var lks = $('#sL', root).value.split('\n').map(function (x) { return x.trim(); }).filter(Boolean).map(function (x) {
          var m = x.match(/^(.*?)\s*(https?:\/\/\S+)$/); return m ? { label: m[1].trim(), url: m[2] } : null;
        }).filter(Boolean);
        var st = $('#sS', root).value;
        var saved = GF.saveSong({ id: song && song.id, title: title, artist: $('#sA', root).value.trim(), bpm: $('#sB', root).value, tuning: $('#sTu', root).value.trim(), capo: $('#sC', root).value.trim(),
          chords: $('#sCh', root).value.trim(), links: lks, book: $('#sBk', root).value.trim(), status: st === '練習中（メイン）' ? '練習中' : st });
        if (st === '練習中（メイン）') GF.setMainSong(saved.id);
        else if (GF.setting('mainSongId') === saved.id && st !== '練習中') GF.setMainSong('');
        closeSheet();
        if (!song) location.hash = '#/song/' + saved.id; else render();
      };
      if ($('#sDel', root)) $('#sDel', root).onclick = function () { if (!confirm('「' + s.title + '」とセクションを削除します。練習ログは残ります。')) return; GF.deleteSong(song.id); closeSheet(); location.hash = '#/songs'; };
    });
  }

  route(/^\/song\/(.+)$/, function (id) {
    var s = GF.get('songs', id); if (!s) { location.hash = '#/songs'; return; }
    var main = GF.mainSong(), isMain = main && main.id === s.id, ph = GF.songPhase(s), secs = GF.sectionsOf(s.id);
    var h = '<div class="page-h"><a class="back" href="#/songs">← 曲</a></div>'
      + '<div class="page-h"><div><h1>' + esc(s.title) + '</h1><div class="muted small">' + esc(s.artist) + '</div></div><span class="sp"></span><span class="chip acc">' + esc(ph.label) + '</span></div>'
      + '<div class="row" style="margin-bottom:16px">' + (isMain ? '<span class="chip acc">メイン曲</span>' : (s.status !== '定着' && s.status !== '休止' ? '<button class="btn pri" id="mkMain">メイン曲にする</button>' : ''))
      + '<button class="btn" id="edit">曲を編集</button><a class="btn" href="#/free/' + esc(s.id) + '">この曲を練習</a></div>';
    h += '<div class="grid two"><section class="card"><div class="ch">進捗マップ<span class="sp"></span><span class="tiny muted">マスをタップして✓／取り消し</span></div>';
    h += secs.length ? pmap(s, false) : '<div class="empty">まだセクションがありません。下の「＋ セクション」から、イントロ・Aメロ・サビ・ソロなどに分けて登録してください。</div>';
    h += '<p class="tiny muted" style="margin:10px 0 0;line-height:1.7">段階：ゆっくり（止まりながらでも最後まで）→ 目標BPMの60% → 80% → 100%で止まらず。全セクションが100%になったら「通し」、通しから' + GF.setting('settleDays') + '日以上空けてもう一度通せたら「定着」。</p></section>';
    h += '<section class="card"><div class="ch">セクション<span class="sp"></span><button class="btn sm" id="addSec">＋ セクション</button></div>';
    if (!secs.length) h += '<div class="empty" style="padding:10px">例：イントロ（1-8小節）／Aメロ／サビ／ソロ</div>';
    secs.forEach(function (sec, i) {
      var b = GF.songBpm(s, sec);
      h += '<div class="secrow"><div style="min-width:0"><div class="nm">' + esc(sec.name) + '</div><div class="sb">' + esc([sec.bars ? '小節 ' + sec.bars : '', b ? '♩=' + b : '目標BPM未設定', GF.STAGES[sec.stage || 0].label, sec.memo].filter(Boolean).join('・')) + '</div></div>'
        + '<div class="acts"><a class="iconbtn" href="#/free/' + esc(sec.id) + '" title="練習" aria-label="練習">▶</a><button class="iconbtn" data-up="' + esc(sec.id) + '"' + (i === 0 ? ' disabled' : '') + ' aria-label="上へ">↑</button><button class="iconbtn" data-dn="' + esc(sec.id) + '"' + (i === secs.length - 1 ? ' disabled' : '') + ' aria-label="下へ">↓</button><button class="iconbtn" data-es="' + esc(sec.id) + '" aria-label="編集">✎</button></div></div>';
    });
    h += '</section></div>';
    h += '<section class="card" style="margin-top:16px"><div class="ch">曲の情報</div>' + songMeta(s) + (s.links && s.links.length || s.chords || s.book || s.bpm ? '' : '<div class="muted small">「曲を編集」で目標BPM・譜面リンク・使うコードを登録できます。</div>') + '</section>';
    var hist = GF.logs().filter(function (l) { return l.songId === s.id && !l.skipped; }).slice(-10).reverse();
    if (hist.length) h += '<section class="card" style="margin-top:16px"><div class="ch">最近の練習</div><div class="logs">' + hist.map(logRow).join('') + '</div></section>';
    app.innerHTML = h;
    if ($('#mkMain')) $('#mkMain').onclick = function () { GF.setMainSong(s.id); toast('メイン曲にしました'); };
    $('#edit').onclick = function () { songForm(s); };
    $('#addSec').onclick = function () { secForm(s, null); };
    $$('[data-es]').forEach(function (b) { b.onclick = function () { secForm(s, GF.get('sections', b.dataset.es)); }; });
    $$('[data-up]').forEach(function (b) { b.onclick = function () { GF.moveSection(b.dataset.up, -1); }; });
    $$('[data-dn]').forEach(function (b) { b.onclick = function () { GF.moveSection(b.dataset.dn, 1); }; });
    bindLogRows(app);
    $$('.pmap td.tap[data-sec]').forEach(function (td) {
      td.onclick = function () {
        var sec = GF.get('sections', td.dataset.sec), k = +td.dataset.st, cur = sec.stage || 0;
        if (cur >= k) { if (confirm('「' + sec.name + '」を ' + (k - 1 ? GF.STAGES[k - 1].label : '未着手') + ' に戻しますか？')) GF.setStage(sec.id, k - 1); }
        else GF.setStage(sec.id, k);
      };
    });
    $$('.pmap td.tap[data-through]').forEach(function (td) {
      td.onclick = function () {
        var p = GF.songPhase(s), which = td.dataset.through;
        if (which === '1' && s.throughAt) { if (confirm('通しの✓を取り消しますか？（定着も取り消されます）')) { if (s.settledAt) GF.undoThrough(s.id); GF.undoThrough(s.id); } return; }
        if (which === '2' && s.settledAt) { if (confirm('定着の✓を取り消しますか？')) GF.undoThrough(s.id); return; }
        if (which === '1') { if (p.phase !== 'through') return toast('全セクションが100%になると通しに✓できます'); GF.markThrough(s.id); toast('通しを記録しました'); return; }
        if (p.phase === 'waiting') return toast('通しから' + GF.setting('settleDays') + '日以上空けてから、もう一度通してください（あと' + p.wait + '日）');
        if (p.phase !== 'settle') return toast('先に「通し」を達成してください');
        GF.markThrough(s.id); toast('定着しました！');
      };
    });
  }, 'songs');

  function secForm(song, sec) {
    var x = sec || { name: '', bars: '', bpm: '', memo: '' };
    openSheet('<h2>' + (sec ? 'セクションを編集' : 'セクションを追加') + '<button class="btn ghost sm" data-close>閉じる</button></h2><div class="fgrid">'
      + '<label class="f full">名前 *<input type="text" id="xN" value="' + esc(x.name) + '" placeholder="イントロ／Aメロ／サビ／ソロ" list="secNames" data-autofocus></label>'
      + '<datalist id="secNames">' + ['イントロ', 'Aメロ', 'Bメロ', 'サビ', 'ソロ', '間奏', 'アウトロ', 'ブリッジ'].map(function (n) { return '<option value="' + n + '">'; }).join('') + '</datalist>'
      + '<label class="f">小節範囲<input type="text" id="xR" value="' + esc(x.bars) + '" placeholder="1-8"></label>'
      + '<label class="f">目標BPM<input type="number" id="xB" value="' + esc(x.bpm || '') + '" placeholder="' + esc(song.bpm ? '曲と同じ（' + song.bpm + '）' : '未設定') + '"></label>'
      + '<label class="f full">メモ（難所など）<input type="text" id="xM" value="' + esc(x.memo) + '"></label></div>'
      + '<div class="row" style="margin-top:14px">' + (sec ? '<button class="btn danger" id="xDel">削除</button>' : '') + '<span class="sp"></span>' + (sec ? '' : '<button class="btn" id="xMore">保存して続けて追加</button>') + '<button class="btn pri big" id="xSave">保存</button></div>', function (root) {
      function save() {
        var n = $('#xN', root).value.trim(); if (!n) { toast('名前を入れてください'); return false; }
        GF.saveSection({ id: sec && sec.id, songId: song.id, name: n, bars: $('#xR', root).value.trim(), bpm: $('#xB', root).value, memo: $('#xM', root).value.trim() });
        return true;
      }
      $('#xSave', root).onclick = function () { if (save()) { closeSheet(); render(); } };
      if ($('#xMore', root)) $('#xMore', root).onclick = function () { if (save()) { toast('追加しました'); secForm(song, null); } };
      if ($('#xDel', root)) $('#xDel', root).onclick = function () { if (confirm('「' + sec.name + '」を削除しますか？')) { GF.deleteSection(sec.id); closeSheet(); render(); } };
    }, function () { render(); });
  }

  /* ================= 教材 ================= */
  route(/^\/lib$/, function () {
    var pct = GF.setting('unlockPct');
    var h = '<div class="page-h"><h1>教材</h1></div><p class="muted small" style="margin-top:-8px">項目ごとに独立してグレードが上がります。目標BPMの✓を異なる' + GF.setting('masterDays') + '日に記録すると「習得」、グレード内の' + pct + '%を習得すると次のグレードが自動で解放されます。</p><div class="catcards">';
    C.CATS.forEach(function (cat) {
      var g = GF.gradeOf(cat), s = GF.gradeStats(cat, g);
      h += '<a class="card catcard" href="#/lib/' + encodeURIComponent(cat) + '">' + catChip(cat) + '<div class="g num">G' + g + '<small>' + (g < 4 ? 'G' + (g + 1) + 'まで ' + s.mastered + '/' + s.total + ' 習得' : '最終グレード') + '</small></div>'
        + '<div class="meter"><i style="width:' + s.pct * 100 + '%;background:' + CAT_COLOR[cat] + '"></i>' + (g < 4 ? '<b style="left:' + pct + '%"></b>' : '') + '</div>'
        + '<div class="small muted">' + C.forCat(cat).filter(function (t) { return GF.taskInfo(t.id).mastered; }).length + ' / ' + C.forCat(cat).length + ' 課題を習得</div></a>';
    });
    h += '</div><section class="card" style="margin-top:16px"><div class="ch">オープンコード・バレーコードについて</div><p class="small" style="margin:0">習得済みとして扱い、課題には入れていません。曲の練習の中で「維持」します。</p></section>';
    app.innerHTML = h;
  }, 'lib');

  route(/^\/lib\/(.+)$/, function (cat) {
    if (C.CATS.indexOf(cat) < 0) { location.hash = '#/lib'; return; }
    var g = GF.gradeOf(cat);
    var h = '<div class="page-h"><a class="back" href="#/lib">← 教材</a></div><div class="page-h"><h1>' + esc(cat) + '</h1><span class="chip acc">いま G' + g + '</span></div>';
    C.GRADES.forEach(function (gr) {
      var s = GF.gradeStats(cat, gr), locked = gr > g;
      h += '<div class="grade-h' + (locked ? ' locked' : '') + '"><h2>G' + gr + '</h2><span class="chip' + (s.mastered === s.total ? ' good' : '') + '">' + s.mastered + '/' + s.total + ' 習得</span>' + (locked ? '<span class="chip">未解放</span>' : '') + '</div><div class="tasks">';
      C.forCat(cat, gr).forEach(function (t) {
        var info = GF.taskInfo(t.id);
        h += '<a class="task' + (locked ? ' locked' : '') + '" href="#/task/' + esc(t.id) + '"><span class="st ' + (info.mastered ? 'm' : info.last ? 'p' : '') + '">' + (info.mastered ? '✓' : info.ok + '/' + info.need) + '</span>'
          + '<div style="min-width:0"><div class="nm">' + esc(t.name) + '</div><div class="sb">♩=' + info.target + '・' + (info.mastered ? '習得 ' + esc(info.row.masteredAt) : '最終練習：' + ago(info.last)) + '</div></div></a>';
      });
      h += '</div>';
    });
    app.innerHTML = h;
  }, 'lib');

  route(/^\/task\/(.+)$/, function (id) {
    var t = C.byId[id]; if (!t) { location.hash = '#/lib'; return; }
    var info = GF.taskInfo(id), g = GF.gradeOf(t.cat), dots = '';
    for (var i = 0; i < info.need; i++) dots += '<i class="' + (i < info.ok ? 'on' : '') + '"></i>';
    var h = '<div class="page-h"><a class="back" href="#/lib/' + encodeURIComponent(t.cat) + '">← ' + esc(t.cat) + '</a></div>'
      + '<div class="page-h"><div><div class="row" style="gap:6px;margin-bottom:6px">' + catChip(t.cat) + '<span class="chip">G' + t.grade + '</span>' + (t.grade > g ? '<span class="chip">未解放</span>' : '') + (info.mastered ? '<span class="chip good">習得 ' + esc(info.row.masteredAt) + '</span>' : '') + '</div><h1>' + esc(t.name) + '</h1></div></div>'
      + '<div class="grid two"><section class="card"><p style="margin-top:0;line-height:1.8">' + esc(t.desc) + '</p><div class="dgs">' + t.diagrams.map(GF_DIAG.render).join('') + '</div>'
      + (t.changes ? '<div class="ch" style="margin-top:16px">よく使うチェンジ</div><ul class="changes">' + t.changes.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : '') + '</section>'
      + '<div class="stack" style="gap:16px"><section class="card"><div class="ch">習得の状況</div><div class="row"><span class="okdots">' + dots + '</span><b>' + info.ok + ' / ' + info.need + '日</b></div>'
      + '<p class="small muted">目標BPMで✓した日：' + esc((info.row.okDates || []).join('、') || 'まだなし') + '</p>'
      + '<div class="set"><div class="l"><b>目標BPM</b><span>教材の推奨は ♩=' + t.bpm + '</span></div><input type="number" id="tb" min="40" max="240" value="' + info.target + '"></div>'
      + '<div class="row" style="margin-top:12px"><a class="btn pri big sp" href="#/free/' + esc(t.id) + '">▶ この課題を練習</a></div>'
      + '<div class="row" style="margin-top:8px"><button class="btn ghost sm" id="tm">' + (info.mastered ? '習得を取り消す' : '習得済みにする（手動）') + '</button></div></section>';
    var bh = GF.bpmHistory().filter(function (e) { return e.id === id; })[0];
    if (bh) h += '<section class="card"><div class="ch">✓したBPMの伸び</div>' + sparkRow(bh) + '</section>';
    h += '</div></div>';
    app.innerHTML = h;
    $('#tb').onchange = function () { GF.setTaskBpm(id, this.value); toast('目標BPMを変更しました'); };
    $('#tm').onclick = function () { GF.setTaskMastered(id, !info.mastered); };
  }, 'lib');

  /* ================= 分析 ================= */
  var STATS = { type: 'week', anchor: null };
  route(/^\/stats$/, function () {
    var a = GF.analytics(STATS.type, STATS.anchor), r = a.range, goal = GF.setting('dailyGoal'), st = GF.streak();
    var h = '<div class="page-h"><h1>分析</h1><span class="sp"></span><div class="seg" id="ptype">' + [['day', '日'], ['week', '週'], ['month', '月'], ['year', '年']].map(function (x) { return '<button data-t="' + x[0] + '" class="' + (x[0] === STATS.type ? 'on' : '') + '">' + x[1] + '</button>'; }).join('') + '</div></div>'
      + '<div class="row" style="margin-bottom:14px"><button class="btn sm" id="prev">←</button><b style="font-size:17px">' + esc(r.label) + '</b><button class="btn sm" id="nxt"' + (r.end >= GF.today() ? ' disabled' : '') + '>→</button><span class="sp"></span>' + (STATS.anchor ? '<button class="btn ghost sm" id="now">今日に戻る</button>' : '') + '<button class="btn sm" id="addLog">＋ 記録を追加</button></div>';
    h += '<div class="kpis"><div class="kpi"><b class="num">' + fmtMin(a.total) + '</b><span>練習時間</span></div>'
      + '<div class="kpi"><b class="num">' + a.okDays + '<small>/' + a.dayCount + '日</small></b><span>' + goal + '分以上の日</span></div>'
      + '<div class="kpi"><b class="num">' + st.current + '<small>日</small></b><span>いまの連続</span></div>'
      + '<div class="kpi"><b class="num">' + st.best + '<small>日</small></b><span>最長の連続</span></div></div>';
    h += '<div class="grid two" style="margin-top:16px"><div class="stack" style="gap:16px">';
    h += '<section class="card"><div class="ch">練習カレンダー</div>' + heat(a, r) + '<div class="legend" style="margin-top:10px"><span><i class="dot" style="background:var(--warn-soft);box-shadow:inset 0 0 0 1.5px var(--warn)"></i>' + goal + '分未満</span><span><i class="dot" style="background:color-mix(in srgb,var(--accent) 30%,var(--surface-2))"></i>' + goal + '分〜</span><span><i class="dot" style="background:var(--accent)"></i>60分〜</span></div></section>';
    h += '<section class="card"><div class="ch">項目別の時間</div>' + catBlock(a) + (STATS.type !== 'day' ? '<div class="chart" style="margin-top:14px">' + trendChart(a) + '</div>' : '') + '</section>';
    h += '<section class="card"><div class="ch">記録' + (a.logs.length ? '（' + a.logs.length + '件）' : '') + '<span class="sp"></span><span class="tiny muted">タップで修正</span></div>' + (a.logs.length ? '<div class="logs">' + a.logs.slice().reverse().slice(0, 80).map(logRow).join('') + '</div>' : '<div class="empty">この期間の記録はありません</div>') + '</section>';
    h += '</div><div class="stack" style="gap:16px">';
    h += '<section class="card"><div class="ch">曲ごとの進捗</div>' + (GF.songs().filter(function (s) { return GF.sectionsOf(s.id).length; }).map(function (s) {
      return '<div style="margin-bottom:14px"><a href="#/song/' + esc(s.id) + '" style="font-weight:800;color:var(--ink);text-decoration:none">' + esc(s.title) + '</a> <span class="chip">' + esc(GF.songPhase(s).label) + '</span>' + pmap(s, true) + '</div>';
    }).join('') || '<div class="empty">セクションを登録した曲がまだありません</div>') + '</section>';
    h += '<section class="card"><div class="ch">習得一覧</div><div class="mastery">' + C.CATS.map(function (cat) {
      return '<div>' + catChip(cat) + ' <span class="small muted">いま G' + GF.gradeOf(cat) + '</span>' + C.GRADES.map(function (gr) {
        return '<div class="gl" style="margin-top:6px"><b>G' + gr + '</b>' + C.forCat(cat, gr).map(function (t) { var i = GF.taskInfo(t.id); return '<a href="#/task/' + t.id + '" title="' + esc(t.name + '：' + i.status) + '"><i class="' + (i.mastered ? 'm' : i.last ? 'p' : '') + '"></i></a>'; }).join('') + '</div>';
      }).join('') + '</div>';
    }).join('') + '<div class="legend"><span><i class="dot" style="background:var(--good)"></i>習得</span><span><i class="dot" style="background:var(--accent-soft);box-shadow:inset 0 0 0 1.5px var(--accent)"></i>練習中</span><span><i class="dot" style="background:var(--surface-2)"></i>未着手</span></div></div></section>';
    var bh = GF.bpmHistory();
    h += '<section class="card"><div class="ch">BPMの推移（✓した記録）</div>' + (bh.length ? bh.slice(0, 12).map(sparkRow).join('') : '<div class="empty">達成✓を付けると、ここにBPMの伸びが出ます</div>') + '</section>';
    var year = GF.parseYmd(r.end).getFullYear(), mo = GF.monthlyOkDays(year), mx = Math.max.apply(null, mo.map(function (x) { return x.days; }).concat([1]));
    h += '<section class="card"><div class="ch">月ごとの達成日数（' + year + '年・' + goal + '分以上）</div><div class="mbars">' + mo.map(function (x) { return '<div title="' + x.month + '月 ' + x.days + '日"><span class="num">' + (x.days || '') + '</span><i style="height:' + (x.days / mx * 70) + 'px"></i><span>' + x.month + '</span></div>'; }).join('') + '</div></section>';
    h += '</div></div>';
    app.innerHTML = h;
    $$('#ptype button').forEach(function (b) { b.onclick = function () { STATS.type = b.dataset.t; render(); }; });
    $('#prev').onclick = function () { STATS.anchor = GF.shiftAnchor(STATS.type, STATS.anchor, -1); render(); };
    $('#nxt').onclick = function () { STATS.anchor = GF.shiftAnchor(STATS.type, STATS.anchor, 1); if (STATS.anchor >= GF.today()) STATS.anchor = null; render(); };
    if ($('#now')) $('#now').onclick = function () { STATS.anchor = null; render(); };
    $('#addLog').onclick = function () { logForm(null, STATS.type === 'day' && STATS.anchor ? STATS.anchor : GF.today()); };
    $$('.heat .c[data-d]').forEach(function (c) { c.onclick = function () { STATS.type = 'day'; STATS.anchor = c.dataset.d === GF.today() ? null : c.dataset.d; render(); }; });
    bindLogRows(app);
  }, 'stats');

  function heatLevel(m, goal) { return m <= 0 ? 'l0' : m < goal ? 'lw' : m < 15 ? 'l1' : m < 30 ? 'l2' : m < 60 ? 'l3' : 'l4'; }
  function heat(a, r) {
    var days = GF.dayTotals(), goal = GF.setting('dailyGoal'), t = GF.today();
    function cell(d, label) {
      var m = days[d] || 0, fut = d > t;
      return '<div class="c ' + heatLevel(m, goal) + (fut ? ' fut' : '') + (d === t ? ' today' : '') + '" data-d="' + d + '" title="' + esc(dayLabel(d) + ' ' + GF.r1(m) + '分') + '">' + (label || '') + '</div>';
    }
    if (r.type === 'year') {
      var s = GF.parseYmd(r.start), off = (s.getDay() + 6) % 7, h = '<div class="yheat">';
      for (var i = 0; i < off; i++) h += '<i style="opacity:0"></i>';
      for (var d = r.start; d <= r.end; d = GF.addDays(d, 1)) {
        var m = days[d] || 0;
        h += '<i class="' + heatLevel(m, goal) + '" style="' + heatStyle(m, goal) + (d > t ? ';opacity:.3' : '') + '" title="' + esc(dayLabel(d) + ' ' + GF.r1(m) + '分') + '"></i>';
      }
      return h + '</div>';
    }
    var head = '<div class="heat" style="grid-template-columns:repeat(7,1fr)">' + '月火水木金土日'.split('').map(function (x) { return '<div class="hd">' + x + '</div>'; }).join('');
    if (r.type === 'month') {
      var st = GF.parseYmd(r.start), lead = (st.getDay() + 6) % 7, hh = head;
      for (var k = 0; k < lead; k++) hh += '<div class="c out"></div>';
      for (var dd = r.start; dd <= r.end; dd = GF.addDays(dd, 1)) hh += cell(dd, String(GF.parseYmd(dd).getDate()));
      return hh + '</div>';
    }
    if (r.type === 'week') {
      var w = head;
      for (var x = r.start; x <= r.end; x = GF.addDays(x, 1)) w += cell(x, String(GF.parseYmd(x).getDate()));
      return w + '</div><div class="row small" style="margin-top:8px;justify-content:space-around">' + (function () { var o = ''; for (var y = r.start; y <= r.end; y = GF.addDays(y, 1)) o += '<span class="num muted" style="flex:1;text-align:center">' + (days[y] ? GF.r1(days[y]) : '·') + '</span>'; return o; })() + '</div>';
    }
    var m0 = days[r.start] || 0;
    return '<div class="row"><div class="heat" style="grid-template-columns:64px"><div class="c ' + heatLevel(m0, goal) + '"></div></div><div><b style="font-size:24px">' + GF.r1(m0) + '分</b><div class="small muted">' + (m0 >= goal ? '最低' + goal + '分 達成' : '最低' + goal + '分に届いていません') + '</div></div></div>';
  }
  function heatStyle(m, goal) {
    var lv = heatLevel(m, goal);
    return lv === 'l0' ? '' : lv === 'lw' ? 'background:var(--warn-soft);box-shadow:inset 0 0 0 1px var(--warn)' : lv === 'l1' ? 'background:color-mix(in srgb,var(--accent) 30%,var(--surface-2))' : lv === 'l2' ? 'background:color-mix(in srgb,var(--accent) 55%,var(--surface-2))' : lv === 'l3' ? 'background:color-mix(in srgb,var(--accent) 80%,var(--surface-2))' : 'background:var(--accent)';
  }
  function catBlock(a) {
    var tot = a.total || 0;
    var h = '<div class="stackbar">' + GF.CATS4.map(function (c) { var v = a.byCat[c] || 0; return v ? '<i style="width:' + (v / tot * 100) + '%;background:' + CAT_COLOR[c] + '" title="' + c + '"></i>' : ''; }).join('') + '</div>';
    h += '<div class="catlist">' + GF.CATS4.map(function (c) { var v = a.byCat[c] || 0; return '<i class="dot" style="background:' + CAT_COLOR[c] + '"></i><span>' + c + '</span><span class="v num">' + fmtMin(GF.r1(v)) + '</span><span class="p num">' + (tot ? Math.round(v / tot * 100) : 0) + '%</span>'; }).join('') + '</div>';
    return h;
  }
  function trendChart(a) {
    var bs = a.buckets, n = bs.length, W = 640, H = 170, pl = 30, pb = 22, pt = 8, iw = W - pl - 6, ih = H - pb - pt;
    var max = Math.max.apply(null, bs.map(function (b) { return b.total; }).concat([GF.setting('dailyGoal')]));
    var nice = max <= 10 ? 10 : max <= 30 ? 30 : max <= 60 ? 60 : Math.ceil(max / 60) * 60;
    var bw = iw / n, o = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="練習時間の推移">';
    [0, 0.5, 1].forEach(function (f) { var y = pt + ih - f * ih; o += '<line x1="' + pl + '" x2="' + (W - 6) + '" y1="' + y + '" y2="' + y + '" style="stroke:var(--line)"/><text x="' + (pl - 4) + '" y="' + (y + 3) + '" text-anchor="end">' + Math.round(nice * f) + '</text>'; });
    if (a.range.type !== 'year') { var gy = pt + ih - GF.setting('dailyGoal') / nice * ih; o += '<line x1="' + pl + '" x2="' + (W - 6) + '" y1="' + gy + '" y2="' + gy + '" style="stroke:var(--warn)" stroke-dasharray="4 3"/>'; }
    bs.forEach(function (b, i) {
      var x = pl + i * bw + bw * 0.15, w = bw * 0.7, y = pt + ih;
      GF.CATS4.forEach(function (c) { var v = b.cats[c] || 0; if (!v) return; var hh = v / nice * ih; y -= hh; o += '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + hh + '" style="fill:' + CAT_COLOR[c] + '"><title>' + esc(b.label + ' ' + c + ' ' + GF.r1(v) + '分') + '</title></rect>'; });
      var showLabel = n <= 12 || i % 5 === 0 || i === n - 1;
      if (showLabel) o += '<text x="' + (x + w / 2) + '" y="' + (H - 6) + '" text-anchor="middle">' + esc(a.range.type === 'week' ? b.label.split('（')[1].replace('）', '') : b.label) + '</text>';
    });
    return o + '</svg>';
  }
  function sparkRow(e) {
    var pts = e.points.slice(-20), vs = pts.map(function (p) { return p.bpm; }), mn = Math.min.apply(null, vs), mx = Math.max.apply(null, vs), W = 110, H = 30;
    var path = pts.map(function (p, i) { var x = pts.length === 1 ? W / 2 : i / (pts.length - 1) * (W - 6) + 3, y = mx === mn ? H / 2 : H - 4 - (p.bpm - mn) / (mx - mn) * (H - 8); return (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1); }).join(' ');
    var last = pts[pts.length - 1];
    return '<div class="spark"><svg viewBox="0 0 ' + W + ' ' + H + '"><path d="' + path + '" fill="none" style="stroke:' + (CAT_COLOR[e.cat] || 'var(--accent)') + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>' + (pts.length === 1 ? '<circle cx="' + W / 2 + '" cy="' + H / 2 + '" r="3" style="fill:' + (CAT_COLOR[e.cat] || 'var(--accent)') + '"/>' : '') + '</svg>'
      + '<div style="min-width:0"><div class="nm">' + esc(e.name) + '</div><div class="tiny muted">' + esc(pts[0].date) + ' → ' + esc(last.date) + '</div></div><div class="v">' + (pts.length > 1 && vs[0] !== last.bpm ? vs[0] + '→' : '') + last.bpm + '</div></div>';
  }

  function logRow(l) {
    return '<button class="log' + (l.skipped ? ' sk' : '') + '" data-log="' + esc(l.id) + '"><span class="tm">' + esc(l.date.slice(5).replace('-', '/')) + '<br>' + esc(GF.hm(l.start)) + '</span>' + catChip(l.cat)
      + '<span class="tg"><div class="x">' + esc(l.targetName || l.cat) + '</div><div class="y">' + esc([l.skipped ? 'スキップ' : '', l.bpm ? '♩=' + l.bpm : '', l.done ? '✓達成' : '', l.memo && !l.skipped ? l.memo : ''].filter(Boolean).join('・')) + '</div></span>'
      + '<span class="mn num">' + (l.skipped ? '－' : GF.r1(l.min) + '分') + '</span></button>';
  }
  function bindLogRows(root) { $$('[data-log]', root).forEach(function (b) { b.onclick = function () { logForm(GF.get('logs', b.dataset.log)); }; }); }

  function logForm(l, date) {
    var isNew = !l, x = l || { date: date || GF.today(), cat: '運指', targetName: '', min: 5, bpm: '', done: false, memo: '' };
    var targetOpts = '<option value="">（自由練習）</option>' + C.tasks.map(function (t) { return '<option value="' + t.id + '" data-cat="' + t.cat + '"' + (x.targetId === t.id ? ' selected' : '') + '>' + esc(t.cat + ' G' + t.grade + ' ' + t.name) + '</option>'; }).join('')
      + GF.songs().map(function (s) { return GF.sectionsOf(s.id).map(function (sec) { return '<option value="sec:' + sec.id + '" data-cat="楽曲"' + (x.targetId === sec.id ? ' selected' : '') + '>' + esc('楽曲 ' + s.title + '｜' + sec.name) + '</option>'; }).join('') + '<option value="song:' + s.id + '" data-cat="楽曲"' + (x.targetId === s.id ? ' selected' : '') + '>' + esc('楽曲 ' + s.title + '（曲全体）') + '</option>'; }).join('');
    openSheet('<h2>' + (isNew ? '記録を追加' : '記録を修正') + '<button class="btn ghost sm" data-close>閉じる</button></h2>'
      + (isNew ? '<p class="small muted" style="margin-top:-6px">アプリを使わずに練習した時の分も、ここから残せます。</p>' : '<p class="small muted" style="margin-top:-6px">' + esc(x.targetName) + '</p>')
      + '<div class="fgrid">' + (isNew ? '<label class="f full">対象<select id="lT">' + targetOpts + '</select></label><label class="f">項目<select id="lC">' + GF.CATS4.map(function (c) { return '<option' + (c === x.cat ? ' selected' : '') + '>' + c + '</option>'; }).join('') + '</select></label>' : '')
      + '<label class="f">日付<input type="date" id="lD" value="' + esc(x.date) + '" max="' + GF.today() + '"></label>'
      + '<label class="f">時間（分）<input type="number" id="lM" step="0.1" min="0" value="' + esc(x.min) + '"></label>'
      + '<label class="f">BPM<input type="number" id="lB" min="40" max="240" value="' + esc(x.bpm || '') + '"></label>'
      + '<label class="f full"><span><input type="checkbox" id="lK"' + (x.done ? ' checked' : '') + '> 達成✓（段階・目標BPMをクリアした）</span></label>'
      + '<label class="f full">メモ<input type="text" id="lN" value="' + esc(x.memo || '') + '"></label></div>'
      + '<div class="row" style="margin-top:14px">' + (isNew ? '' : '<button class="btn danger" id="lDel">削除</button>') + '<span class="sp"></span><button class="btn pri big" id="lSave">保存</button></div>', function (root) {
      if (isNew) $('#lT', root).onchange = function () { var o = this.selectedOptions[0]; if (o && o.dataset.cat) $('#lC', root).value = o.dataset.cat; };
      $('#lSave', root).onclick = function () {
        var d = $('#lD', root).value || GF.today(), min = Number($('#lM', root).value) || 0, bpm = $('#lB', root).value, done = $('#lK', root).checked, memo = $('#lN', root).value.trim();
        if (isNew) {
          var v = $('#lT', root).value, cat = $('#lC', root).value, p = { cat: cat, date: d, min: min, bpm: bpm, done: done, memo: memo, start: GF.parseYmd(d).getTime() + 12 * 3600000 };
          if (C.byId[v]) Object.assign(p, { kind: '課題', targetId: v, targetName: C.byId[v].name, cat: C.byId[v].cat });
          else if (/^sec:/.test(v)) {
            var sec = GF.get('sections', v.slice(4)), song = GF.get('songs', sec.songId), stg = Math.min(4, (sec.stage || 0) + 1);
            Object.assign(p, { cat: '楽曲', kind: 'S' + stg, targetId: sec.id, songId: song.id, targetName: song.title + '｜' + sec.name });
          } else if (/^song:/.test(v)) {
            var sg = GF.get('songs', v.slice(5)), ph = GF.songPhase(sg);
            Object.assign(p, { cat: '楽曲', kind: ph.phase === 'through' || ph.phase === 'settle' ? '通し' : '維持', targetId: sg.id, songId: sg.id, targetName: sg.title });
          } else Object.assign(p, { kind: '自由', targetName: cat + 'の練習（手入力）' });
          GF.addLog(p);
          toast('記録しました');
        } else {
          var patch = { date: d, min: min, bpm: bpm, done: done, memo: memo };
          if (d !== x.date) { var st = new Date(x.start), nd = GF.parseYmd(d); nd.setHours(st.getHours(), st.getMinutes()); patch.start = nd.toISOString(); patch.end = new Date(nd.getTime() + min * 60000).toISOString(); }
          GF.updateLog(x.id, patch);
          toast('修正しました');
        }
        closeSheet(); render();
      };
      if ($('#lDel', root)) $('#lDel', root).onclick = function () { if (confirm('この記録を削除しますか？（段階や習得の✓はそのまま残ります）')) { GF.deleteLog(x.id); closeSheet(); render(); } };
    });
  }

  /* ================= 設定 ================= */
  route(/^\/settings$/, function () {
    var s = GF.status(), cfg = GF.cfg();
    var h = '<div class="page-h"><h1>設定</h1></div><div class="grid two"><div class="stack" style="gap:16px">';
    h += '<section class="card"><div class="ch">同期（スプレッドシート「Guitar Freak」）</div>';
    if (cfg) {
      h += '<div class="set"><div class="l"><b>' + (s.error ? '同期エラー' : s.pending ? '送信待ち ' + s.pending + '件' : '同期済み') + '</b><span>' + (s.syncedAt ? '最終同期 ' + esc(new Date(s.syncedAt).toLocaleString('ja-JP')) : 'まだ同期していません') + (s.error ? '<br>' + esc(s.error.message) : '') + '</span></div><button class="btn pri" id="syncNow">今すぐ同期</button></div>'
        + '<div class="set"><div class="l"><b>この端末の名前</b><span>練習ログの「端末」列に入ります</span></div><input type="text" id="dev" value="' + esc(GF.device()) + '" style="width:140px"></div>'
        + '<div class="row" style="margin-top:10px"><button class="btn ghost sm danger" id="unlink">この端末の同期設定を消す</button></div>';
    } else {
      h += '<div class="setup-box small"><p style="margin-top:0">いまは<b>この端末の中だけ</b>に記録しています。スプレッドシートと同期すると、スマホ・タブレット・PCで同じ記録を使え、Geminiで直接編集もできます。</p>'
        + '<ol><li>スプレッドシートを開き、メニュー「Guitar Freak」→「アプリ設定リンクを表示」</li><li>表示されたリンクをこの端末で開く（それだけで設定完了）</li></ol>'
        + '<p>リンクを開けない場合は、リンクの文字列をそのまま下に貼り付けてください。</p>'
        + '<textarea id="cfgIn" placeholder="https://jimocre2017-cmd.github.io/guitar-freak/#setup=..."></textarea><button class="btn pri" id="cfgSave" style="margin-top:8px">設定する</button></div>';
    }
    h += '</section>';
    h += '<section class="card"><div class="ch">記録と判定</div>'
      + numSet('dailyGoal', '1日の最低時間（分）', 'ストリークと「今日まだ0分」の基準', 1, 120)
      + numSet('warnSong', '曲の放置警告（日）', '最終練習からこの日数でホームに表示', 1, 60)
      + numSet('warnTask', '基礎課題の放置警告（日）', 'スケール・コード・運指', 1, 60)
      + numSet('masterDays', '習得に必要な日数', '目標BPMで✓した、異なる日の数', 1, 14)
      + numSet('unlockPct', '次のグレードを解放する習得率（%）', '', 10, 100)
      + numSet('settleDays', '定着までに空ける日数', '通し達成から', 1, 30)
      + '<div class="set"><div class="l"><b>練習開始でメトロノームを鳴らす</b><span>オフにするとタイマーだけ動きます</span></div><input type="checkbox" id="metAuto"' + (GF.setting('metAuto') !== false ? ' checked' : '') + ' style="width:24px;height:24px"></div></section>';
    h += '</div><div class="stack" style="gap:16px">';
    var alloc = GF.setting('alloc');
    h += '<section class="card"><div class="ch">時間指定モードの配分（%）</div><div style="overflow-x:auto"><table class="alloc"><thead><tr><th>この分数から</th>' + GF.CATS4.map(function (c) { return '<th>' + c + '</th>'; }).join('') + '</tr></thead><tbody>'
      + alloc.map(function (t, i) { return '<tr><td><input type="number" data-a="' + i + '" data-k="min" value="' + t.min + '"></td>' + GF.CATS4.map(function (c) { return '<td><input type="number" step="0.1" data-a="' + i + '" data-k="' + c + '" value="' + (t[c] || 0) + '"></td>'; }).join('') + '</tr>'; }).join('')
      + '</tbody></table></div><p class="tiny muted">曲は残りの時間すべて。例：15分なら 運指2・コード2・スケール4・曲7分。</p>'
      + '<div class="row"><span class="small muted" id="allocPrev"></span><span class="sp"></span><button class="btn sm ghost" id="allocReset">初期値に戻す</button></div></section>';
    var fx = GF.setting('fixed');
    h += '<section class="card"><div class="ch">固定配分モード（分）</div><div class="fgrid">' + GF.CATS4.map(function (c) { return '<label class="f">' + c + '<input type="number" min="0" max="120" data-fx="' + c + '" value="' + (fx[c] || 0) + '"></label>'; }).join('') + '</div></section>';
    var theme = localStorage.getItem('gf_theme') || 'auto';
    h += '<section class="card"><div class="ch">表示</div><div class="seg" id="theme">' + [['auto', '端末に合わせる'], ['light', 'ライト'], ['dark', 'ダーク']].map(function (x) { return '<button data-th="' + x[0] + '" class="' + (x[0] === theme ? 'on' : '') + '">' + x[1] + '</button>'; }).join('') + '</div></section>';
    h += '<section class="card"><div class="ch">バックアップ</div><p class="small muted" style="margin-top:0">同期していない時の保険に。読み込むと、新しい方の記録で上書きします。</p><div class="row"><button class="btn" id="exp">書き出す（JSON）</button><label class="btn">読み込む<input type="file" id="imp" accept="application/json,.json" hidden></label></div></section>';
    h += '<p class="tiny muted" style="text-align:center">Guitar Freak・データはこの端末と、同期先のスプレッドシートだけに保存されます</p>';
    h += '</div></div>';
    app.innerHTML = h;
    if ($('#syncNow')) $('#syncNow').onclick = function () { GF.sync().then(function () { toast('同期しました'); render(); }, function (e) { toast(e.offline ? 'オフラインです' : '同期できませんでした：' + e.message); render(); }); };
    if ($('#dev')) $('#dev').onchange = function () { GF.setDevice(this.value.trim()); toast('保存しました'); };
    if ($('#unlink')) $('#unlink').onclick = function () { if (confirm('この端末の同期設定を消します。端末内の記録は残ります。')) { GF.clearConfig(); render(); } };
    if ($('#cfgSave')) $('#cfgSave').onclick = function () {
      var v = $('#cfgIn').value.trim(), m = v.match(/#setup=(.+)$/), c = null;
      try { c = JSON.parse(m ? decodeURIComponent(m[1]) : v); } catch (e) {}
      if (!c || !c.api || !c.token) return toast('設定リンクを読み取れませんでした');
      GF.setConfig({ api: c.api, token: c.token });
      GF.sync().then(function () { toast('同期しました'); render(); }, function (e) { toast('同期できませんでした：' + e.message); render(); });
    };
    $$('[data-set]').forEach(function (inp) { inp.onchange = function () { var v = Number(inp.value); if (isNaN(v) || v < +inp.min || v > +inp.max) { toast(inp.min + '〜' + inp.max + 'で入れてください'); inp.value = GF.setting(inp.dataset.set); return; } GF.setSetting(inp.dataset.set, v); if (inp.dataset.set === 'unlockPct' || inp.dataset.set === 'masterDays') GF.checkGrades(); toast('保存しました'); }; });
    $('#metAuto').onchange = function () { GF.setSetting('metAuto', this.checked); };
    function allocPreview() { var o = GF.allocFor(15); $('#allocPrev').textContent = '15分 → ' + GF.CATS4.map(function (c) { return c + o[c]; }).join('・'); }
    allocPreview();
    $$('[data-a]').forEach(function (inp) { inp.onchange = function () { var a = GF.setting('alloc'); a[+inp.dataset.a][inp.dataset.k] = Number(inp.value) || 0; GF.setSetting('alloc', a); allocPreview(); }; });
    $('#allocReset').onclick = function () { GF.setSetting('alloc', GF.DEFAULTS.alloc); render(); };
    $$('[data-fx]').forEach(function (inp) { inp.onchange = function () { var f = GF.setting('fixed'); f[inp.dataset.fx] = Math.max(0, Math.round(Number(inp.value) || 0)); GF.setSetting('fixed', f); }; });
    $$('#theme button').forEach(function (b) { b.onclick = function () { localStorage.setItem('gf_theme', b.dataset.th); applyTheme(); render(); }; });
    $('#exp').onclick = function () {
      var blob = new Blob([GF.exportJson()], { type: 'application/json' }), a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = 'guitar-freak-' + GF.today() + '.json'; document.body.appendChild(a); a.click(); a.remove();
    };
    $('#imp').onchange = function () { var f = this.files[0]; if (!f) return; f.text().then(function (t) { try { GF.importJson(t); toast('読み込みました'); } catch (e) { toast(e.message); } }); };
  }, 'settings');
  function numSet(k, label, sub, mn, mx) { return '<div class="set"><div class="l"><b>' + esc(label) + '</b>' + (sub ? '<span>' + esc(sub) + '</span>' : '') + '</div><input type="number" data-set="' + k + '" min="' + mn + '" max="' + mx + '" value="' + GF.setting(k) + '"></div>'; }

  /* ---------- 起動 ---------- */
  if (GF.justSetup()) setTimeout(function () { toast('同期の設定ができました'); }, 400);
  render();
  GF.schedule(400);
})();
