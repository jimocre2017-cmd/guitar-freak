/* Guitar Freak 図の描画（指板図・コードダイアグラム・運指TAB）— すべてSVG文字列を返す */
var GF_DIAG = (function () {
  'use strict';
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  /* ---------- 指板図（横向き。上が1弦） ---------- */
  function scale(d) {
    var notes = GF_CURRICULUM.scaleNotes(d);
    var fs = notes.map(function (n) { return n.f; });
    var minF = Math.min.apply(null, fs), maxF = Math.max.apply(null, fs);
    var lo = Math.max(0, minF - (minF > 0 ? 1 : 0)), hi = Math.max(maxF, lo + 4);
    var showNut = lo === 0;
    var cols = hi - lo + (showNut ? 1 : 0); // 0フレットは開放弦の列
    var W = 44, H = 22, padL = 24, padT = 14, padB = 22;
    var width = padL + cols * W + 10, height = padT + 5 * H + padB;
    var x0 = padL;
    function fx(f) { // 音を置くx（フレットの間）
      if (showNut) return f === 0 ? x0 + W * 0.5 : x0 + W + (f - 1) * W + W / 2;
      return x0 + (f - lo - 1) * W + W / 2;
    }
    var frets = showNut ? hi : hi - lo;
    var o = '<svg class="fb" viewBox="0 0 ' + width + ' ' + height + '" style="max-width:' + Math.round(width * 1.35) + 'px" role="img" aria-label="' + esc(d.title || '指板図') + '">';
    var boardX = showNut ? x0 + W : x0, boardW = (showNut ? hi : hi - lo) * W;
    o += '<rect x="' + boardX + '" y="' + padT + '" width="' + boardW + '" height="' + (5 * H) + '" fill="var(--board)" rx="3"/>';
    // インレイ
    [3, 5, 7, 9, 12, 15, 17].forEach(function (m) {
      if (m <= lo || m > hi) return;
      var cx = fx(m);
      if (m === 12) {
        o += '<circle cx="' + cx + '" cy="' + (padT + 1.5 * H) + '" r="4" fill="var(--inlay)"/><circle cx="' + cx + '" cy="' + (padT + 3.5 * H) + '" r="4" fill="var(--inlay)"/>';
      } else o += '<circle cx="' + cx + '" cy="' + (padT + 2.5 * H) + '" r="4" fill="var(--inlay)"/>';
    });
    // フレット線
    for (var i = 0; i <= frets; i++) {
      var x = boardX + i * W;
      var nut = showNut && i === 0;
      o += '<line x1="' + x + '" y1="' + padT + '" x2="' + x + '" y2="' + (padT + 5 * H) + '" stroke="var(--fret)" stroke-width="' + (nut ? 4 : 1.5) + '"/>';
    }
    // 弦
    for (var s = 1; s <= 6; s++) {
      var y = padT + (s - 1) * H;
      o += '<line x1="' + (showNut ? x0 : boardX) + '" y1="' + y + '" x2="' + (boardX + boardW) + '" y2="' + y + '" stroke="var(--string)" stroke-width="' + (0.8 + s * 0.25) + '"/>';
      o += '<text x="8" y="' + (y + 4) + '" class="fbl">' + s + '</text>';
    }
    // フレット番号
    for (var f = Math.max(1, lo + 1); f <= hi; f++) {
      o += '<text x="' + fx(f) + '" y="' + (padT + 5 * H + 16) + '" text-anchor="middle" class="fbn' + ([3, 5, 7, 9, 12, 15].indexOf(f) >= 0 ? ' on' : '') + '">' + f + '</text>';
    }
    // 音
    notes.forEach(function (n) {
      var cx = fx(n.f), cy = padT + (n.s - 1) * H;
      o += '<circle cx="' + cx + '" cy="' + cy + '" r="8.5" fill="' + (n.root ? 'var(--root)' : 'var(--dot)') + '"/>';
      if (n.root) o += '<text x="' + cx + '" y="' + (cy + 4) + '" text-anchor="middle" class="fbr">R</text>';
    });
    return o + '</svg>';
  }

  /* ---------- コードダイアグラム（縦向き。左が6弦） ---------- */
  function parseFrets(s) {
    var a = s.indexOf(',') >= 0 ? s.split(',') : s.split('');
    return a.map(function (x) { return x === 'x' || x === 'X' ? -1 : Number(x); });
  }
  function chord(d) {
    var fr = parseFrets(d.frets), fg = String(d.fingers || '').split('').map(Number);
    var pressed = fr.filter(function (f) { return f > 0; });
    var maxF = pressed.length ? Math.max.apply(null, pressed) : 0, minF = pressed.length ? Math.min.apply(null, pressed) : 0;
    var base = d.base || (maxF <= 4 ? 1 : minF);
    var rows = Math.max(4, maxF - base + 1);
    var W = 18, H = 22, padL = 22, padT = 34, width = padL + 5 * W + 22, height = padT + rows * H + 14;
    var o = '<svg class="cd" viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="' + esc(d.name) + '">';
    o += '<text x="' + (padL + 2.5 * W) + '" y="13" text-anchor="middle" class="cdn">' + esc(d.name) + '</text>';
    for (var r = 0; r <= rows; r++) {
      var y = padT + r * H;
      o += '<line x1="' + padL + '" y1="' + y + '" x2="' + (padL + 5 * W) + '" y2="' + y + '" stroke="var(--fret)" stroke-width="' + (r === 0 && base === 1 ? 4 : 1.4) + '"/>';
    }
    for (var s = 0; s < 6; s++) {
      var x = padL + s * W;
      o += '<line x1="' + x + '" y1="' + padT + '" x2="' + x + '" y2="' + (padT + rows * H) + '" stroke="var(--string)" stroke-width="1.3"/>';
      var f = fr[s];
      if (f === -1) o += '<text x="' + x + '" y="' + (padT - 7) + '" text-anchor="middle" class="cdx">×</text>';
      else if (f === 0) o += '<circle cx="' + x + '" cy="' + (padT - 11) + '" r="4.5" fill="none" stroke="var(--ink-2)" stroke-width="1.5"/>';
    }
    if (base > 1) o += '<text x="' + (padL + 5 * W + 6) + '" y="' + (padT + H / 2 + 4) + '" class="cdb">' + base + 'f</text>';
    // バレー（同じ指・同じフレットが2弦以上）
    var barre = {};
    fr.forEach(function (f, s) { if (f > 0 && fg[s]) { var k = fg[s] + ':' + f; (barre[k] = barre[k] || []).push(s); } });
    Object.keys(barre).forEach(function (k) {
      var ss = barre[k]; if (ss.length < 2) return;
      var f = Number(k.split(':')[1]), y = padT + (f - base + 0.5) * H;
      var a = Math.min.apply(null, ss), b = Math.max.apply(null, ss);
      o += '<rect x="' + (padL + a * W - 7) + '" y="' + (y - 7) + '" width="' + ((b - a) * W + 14) + '" height="14" rx="7" fill="var(--dot)"/>';
    });
    fr.forEach(function (f, s) {
      if (f <= 0) return;
      var x = padL + s * W, y = padT + (f - base + 0.5) * H;
      o += '<circle cx="' + x + '" cy="' + y + '" r="7.5" fill="var(--dot)"/>';
      if (fg[s]) o += '<text x="' + x + '" y="' + (y + 4) + '" text-anchor="middle" class="cdf">' + fg[s] + '</text>';
    });
    return o + '</svg>';
  }

  /* ---------- 運指TAB ---------- */
  function parseSteps(str) {
    return str.trim().split(/\s+/).map(function (tok) {
      if (tok === '|') return { bar: true };
      return { notes: tok.split('+').map(function (n) { var p = n.split(':'); return { s: Number(p[0]), f: p[1], h: p[2] || '' }; }) };
    });
  }
  function tabView(d) {
    var steps = parseSteps(d.steps);
    var per = 16, lines = [], cur = [], count = 0;
    steps.forEach(function (st) {
      if (!st.bar && count >= per) { lines.push(cur); cur = []; count = 0; }
      if (st.bar && !cur.length) return;
      cur.push(st); if (!st.bar) count++;
    });
    if (cur.length) lines.push(cur);
    return lines.map(function (line) {
      var CW = 30, H = 14, padL = 20, padT = 8;
      var width = padL + line.reduce(function (w, st) { return w + (st.bar ? 12 : Math.max(CW, maxLen(st) * 8 + 12)); }, 0) + 8;
      var height = padT + 5 * H + 26;
      var o = '<svg class="tab" viewBox="0 0 ' + width + ' ' + height + '" width="' + width + '" height="' + height + '" role="img" aria-label="TAB">';
      for (var s = 1; s <= 6; s++) {
        var y = padT + (s - 1) * H;
        o += '<line x1="' + padL + '" y1="' + y + '" x2="' + (width - 8) + '" y2="' + y + '" stroke="var(--line-strong)" stroke-width="1"/>';
      }
      o += '<text x="4" y="' + (padT + 2.5 * H + 4) + '" class="tabt">T</text>';
      var x = padL;
      line.forEach(function (st) {
        if (st.bar) { o += '<line x1="' + (x + 6) + '" y1="' + padT + '" x2="' + (x + 6) + '" y2="' + (padT + 5 * H) + '" stroke="var(--ink-3)" stroke-width="1.5"/>'; x += 12; return; }
        var w = Math.max(CW, maxLen(st) * 8 + 12), cx = x + w / 2;
        var hs = [];
        st.notes.forEach(function (n) {
          var y = padT + (n.s - 1) * H, label = String(n.f);
          var tw = label.length * 7.5 + 6;
          o += '<rect x="' + (cx - tw / 2) + '" y="' + (y - 7) + '" width="' + tw + '" height="14" fill="var(--surface)"/>';
          o += '<text x="' + cx + '" y="' + (y + 4) + '" text-anchor="middle" class="tabn">' + esc(label) + '</text>';
          if (n.h) hs.push(n.h);
        });
        if (hs.length) o += '<text x="' + cx + '" y="' + (padT + 5 * H + 18) + '" text-anchor="middle" class="tabh">' + esc(hs.join('')) + '</text>';
        x += w;
      });
      return o + '</svg>';
    }).join('');
  }
  function maxLen(st) { return st.notes.reduce(function (m, n) { return Math.max(m, String(n.f).length); }, 1); }

  function render(d) {
    var body = d.type === 'scale' ? scale(d) : d.type === 'chord' ? chord(d) : tabView(d);
    // テーマの色（CSS変数）を確実に効かせるため、属性ではなく style で指定する
    body = body.replace(/(fill|stroke)="var\((--[\w-]+)\)"/g, 'style="$1:var($2)"');
    var title = d.type === 'chord' ? '' : '<div class="dg-t">' + esc(d.title || '') + '</div>';
    return '<figure class="dg dg-' + d.type + '">' + title + body + '</figure>';
  }

  return { render: render, scale: scale, chord: chord, tab: tabView };
})();
