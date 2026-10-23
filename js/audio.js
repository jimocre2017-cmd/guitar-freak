/* Guitar Freak 音まわり：メトロノーム（Web Audio、先読みスケジューラ）と終了音
 * 音はすべてその場で合成するので、オフラインでも鳴る。
 */
var GF_AUDIO = (function () {
  'use strict';
  var ctx = null, master = null;
  function ac() {
    if (!ctx) {
      var C = window.AudioContext || window.webkitAudioContext;
      if (!C) return null;
      ctx = new C();
      master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function click(time, level) { // level: 2=小節頭, 1=中アクセント, 0=通常
    var c = ac(); if (!c) return;
    var o = c.createOscillator(), g = c.createGain();
    o.type = 'square';
    o.frequency.value = level === 2 ? 1760 : level === 1 ? 1320 : 990;
    var v = (level === 2 ? 0.5 : level === 1 ? 0.35 : 0.25) * met.volume;
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(Math.max(v, 0.0002), time + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.045);
    o.connect(g); g.connect(master);
    o.start(time); o.stop(time + 0.06);
  }

  /* ---------- メトロノーム ---------- */
  var METERS = { '2/4': { n: 2, acc: [2, 0] }, '3/4': { n: 3, acc: [2, 0, 0] }, '4/4': { n: 4, acc: [2, 0, 0, 0] }, '6/8': { n: 6, acc: [2, 0, 0, 1, 0, 0] }, '5/4': { n: 5, acc: [2, 0, 0, 1, 0] } };
  var met = { bpm: 80, meter: '4/4', accent: true, volume: 0.8, running: false, beat: 0, next: 0, timer: null, cbs: [] };

  // 1クリック＝1拍。6/8 は「8分音符＝BPM」で6つ刻み、1拍目と4拍目にアクセント
  function interval() { return 60 / met.bpm; }

  function scheduler() {
    var c = ac(); if (!c) return;
    while (met.next < c.currentTime + 0.12) {
      var m = METERS[met.meter] || METERS['4/4'];
      var b = met.beat % m.n;
      var lvl = met.accent ? m.acc[b] : 0;
      click(met.next, lvl);
      (function (beat, t) {
        var delay = Math.max(0, (t - c.currentTime) * 1000);
        setTimeout(function () { met.cbs.forEach(function (f) { try { f(beat, m.n); } catch (e) {} }); }, delay);
      })(b, met.next);
      met.next += interval();
      met.beat++;
    }
  }

  function start() {
    var c = ac(); if (!c) return false;
    if (met.running) return true;
    met.running = true; met.beat = 0; met.next = c.currentTime + 0.06;
    scheduler();
    met.timer = setInterval(scheduler, 25);
    emit();
    return true;
  }
  function stop() {
    met.running = false; clearInterval(met.timer); met.timer = null; emit();
  }
  function setBpm(v) { met.bpm = Math.max(40, Math.min(240, Math.round(Number(v) || 80))); emit(); }
  function setMeter(m) { if (METERS[m]) { met.meter = m; met.beat = 0; emit(); } }
  function setAccent(a) { met.accent = !!a; emit(); }
  function setVolume(v) { met.volume = Math.max(0, Math.min(1, Number(v))); }

  var stateCbs = [];
  function emit() { var s = state(); stateCbs.forEach(function (f) { try { f(s); } catch (e) {} }); }
  function state() { return { bpm: met.bpm, meter: met.meter, accent: met.accent, running: met.running, volume: met.volume }; }

  // タップテンポ
  var taps = [];
  function tap() {
    var t = performance.now();
    if (taps.length && t - taps[taps.length - 1] > 2000) taps = [];
    taps.push(t); if (taps.length > 6) taps.shift();
    if (taps.length >= 2) {
      var sum = 0; for (var i = 1; i < taps.length; i++) sum += taps[i] - taps[i - 1];
      setBpm(60000 / (sum / (taps.length - 1)));
    }
    return met.bpm;
  }

  /* ---------- 終了の合図 ---------- */
  function chime() {
    var c = ac(); if (!c) return;
    var t = c.currentTime + 0.02;
    [880, 1175, 1568].forEach(function (f, i) {
      var o = c.createOscillator(), g = c.createGain();
      o.type = 'sine'; o.frequency.value = f;
      var st = t + i * 0.16;
      g.gain.setValueAtTime(0.0001, st);
      g.gain.exponentialRampToValueAtTime(0.5, st + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, st + 0.5);
      o.connect(g); g.connect(master); o.start(st); o.stop(st + 0.55);
    });
    try { if (navigator.vibrate) navigator.vibrate([200, 100, 200]); } catch (e) {}
  }

  return {
    unlock: ac,
    start: start, stop: stop, toggle: function () { return met.running ? (stop(), false) : start(); },
    setBpm: setBpm, setMeter: setMeter, setAccent: setAccent, setVolume: setVolume,
    tap: tap, state: state,
    onState: function (f) { stateCbs.push(f); },
    onBeat: function (f) { met.cbs.push(f); },
    METERS: Object.keys(METERS),
    chime: chime
  };
})();
