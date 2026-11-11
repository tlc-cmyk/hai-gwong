/**
 * 今日訓導檢查手機櫃 — 原創 Web Audio 音效（即時合成，無取樣檔）。
 */
(function (root) {
  "use strict";

  var STORAGE_KEY = "hai-gwong-mute";
  var ctx = null;
  var master = null;
  var muted = false;
  var hum = null;

  try {
    muted = root.localStorage.getItem(STORAGE_KEY) === "1";
  } catch (e) {
    muted = false;
  }

  function now() {
    return ctx ? ctx.currentTime : 0;
  }

  function ensure() {
    if (!ctx) {
      var AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.8;
      master.connect(ctx.destination);
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  function setMuted(v) {
    muted = !!v;
    if (master) {
      var t = now();
      master.gain.cancelScheduledValues(t);
      master.gain.setTargetAtTime(muted ? 0 : 0.8, t, 0.04);
    }
    try {
      root.localStorage.setItem(STORAGE_KEY, muted ? "1" : "0");
    } catch (e) { /* ignore */ }
    if (muted) stopHum();
  }

  function isMuted() {
    return muted;
  }

  function tone(type, freq, t, dur, vol, a, d) {
    if (!ensure()) return;
    var osc = ctx.createOscillator();
    osc.type = type || "sine";
    osc.frequency.setValueAtTime(freq, t);
    var g = ctx.createGain();
    var peak = vol == null ? 0.12 : vol;
    var attack = a == null ? 0.01 : a;
    var decay = d == null ? dur : d;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(attack + 0.01, decay));
    osc.connect(g);
    g.connect(master);
    osc.start(t);
    osc.stop(t + Math.max(attack + 0.02, decay) + 0.02);
  }

  function noiseBurst(t, dur, freq, q, vol, type) {
    if (!ensure()) return;
    var n = Math.max(1, Math.floor(ctx.sampleRate * Math.max(0.04, dur + 0.04)));
    var buf = ctx.createBuffer(1, n, ctx.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
    var src = ctx.createBufferSource();
    src.buffer = buf;
    var filt = ctx.createBiquadFilter();
    filt.type = type || "lowpass";
    filt.frequency.setValueAtTime(freq, t);
    if (q) filt.Q.setValueAtTime(q, t);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol || 0.08), t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filt);
    filt.connect(g);
    g.connect(master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  /** 柔和電筒低鳴，只在檢查階段亮燈時使用。 */
  function startHum() {
    if (muted || hum || !ensure()) return;
    var t = now();
    var noiseN = Math.max(1, Math.floor(ctx.sampleRate * 1.2));
    var buf = ctx.createBuffer(1, noiseN, ctx.sampleRate);
    var data = buf.getChannelData(0);
    var acc = 0;
    for (var i = 0; i < noiseN; i++) {
      acc = acc * 0.97 + (Math.random() * 2 - 1) * 0.03;
      data[i] = acc;
    }
    var src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    var filt = ctx.createBiquadFilter();
    filt.type = "lowpass";
    filt.frequency.value = 420;
    filt.Q.value = 0.4;
    var osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = 164;
    var gN = ctx.createGain();
    var gO = ctx.createGain();
    gN.gain.value = 0.0001;
    gO.gain.value = 0.0001;
    gN.gain.setTargetAtTime(0.035, t, 0.12);
    gO.gain.setTargetAtTime(0.012, t, 0.12);
    src.connect(filt);
    filt.connect(gN);
    osc.connect(gO);
    gN.connect(master);
    gO.connect(master);
    src.start(t);
    osc.start(t);
    hum = { src: src, osc: osc, gN: gN, gO: gO };
  }

  function stopHum() {
    if (!hum) return;
    var t = now();
    try {
      hum.gN.gain.cancelScheduledValues(t);
      hum.gO.gain.cancelScheduledValues(t);
      hum.gN.gain.setTargetAtTime(0.0001, t, 0.08);
      hum.gO.gain.setTargetAtTime(0.0001, t, 0.08);
      var src = hum.src;
      var osc = hum.osc;
      setTimeout(function () {
        try { src.stop(); } catch (e) { /* already stopped */ }
        try { osc.stop(); } catch (e2) { /* already stopped */ }
      }, 220);
    } catch (e) { /* ignore */ }
    hum = null;
  }

  /** 首次照到一格時嘅輕微喀一聲。 */
  function peekTick() {
    if (muted || !ensure()) return;
    var t = now();
    tone("triangle", 1180, t, 0.04, 0.045, 0.004, 0.05);
    tone("sine", 620, t, 0.05, 0.02, 0.004, 0.06);
  }

  /** 點選／取消點選。 */
  function selectTap(on) {
    if (muted || !ensure()) return;
    var t = now();
    if (on) {
      tone("sine", 392, t, 0.07, 0.08, 0.005, 0.08);
      tone("triangle", 588, t + 0.01, 0.06, 0.04, 0.005, 0.07);
      noiseBurst(t, 0.04, 900, 0.7, 0.03, "lowpass");
    } else {
      tone("sine", 330, t, 0.06, 0.06, 0.005, 0.07);
      noiseBurst(t, 0.035, 700, 0.6, 0.02, "lowpass");
    }
  }

  /** 階段轉換用嘅溫和校鐘。 */
  function schoolBell() {
    if (muted || !ensure()) return;
    var t = now();
    tone("sine", 784, t, 0.55, 0.09, 0.012, 0.62);
    tone("sine", 1175, t + 0.02, 0.45, 0.05, 0.012, 0.5);
    tone("sine", 659, t + 0.22, 0.7, 0.08, 0.015, 0.75);
    tone("sine", 988, t + 0.24, 0.5, 0.04, 0.015, 0.55);
  }

  /** 每階段最後數秒嘅輕促提示，愈接近結束愈高少少。 */
  function urgency(secondsLeft) {
    if (muted || !ensure()) return;
    var t = now();
    var n = Math.max(1, Math.min(5, Math.ceil(secondsLeft)));
    var f = 520 + (5 - n) * 36;
    tone("sine", f, t, 0.09, 0.055, 0.005, 0.1);
    tone("triangle", f * 2, t, 0.06, 0.018, 0.004, 0.07);
  }

  /** 結果短句：好成績溫暖上揚，普通成績柔和，唔刺耳。 */
  function resultSting(gradeKey) {
    if (muted || !ensure()) return;
    var t = now();
    if (gradeKey === "perfect") {
      tone("sine", 523, t, 0.22, 0.09, 0.01, 0.24);
      tone("sine", 659, t + 0.1, 0.24, 0.08, 0.01, 0.26);
      tone("sine", 784, t + 0.2, 0.28, 0.09, 0.012, 0.34);
      tone("sine", 1046, t + 0.32, 0.45, 0.07, 0.012, 0.5);
    } else if (gradeKey === "careful" || gradeKey === "pass") {
      tone("sine", 494, t, 0.2, 0.08, 0.01, 0.22);
      tone("sine", 659, t + 0.12, 0.28, 0.08, 0.01, 0.32);
      tone("sine", 784, t + 0.26, 0.36, 0.07, 0.012, 0.4);
    } else if (gradeKey === "missed") {
      tone("sine", 440, t, 0.22, 0.07, 0.012, 0.26);
      tone("sine", 392, t + 0.16, 0.32, 0.06, 0.012, 0.36);
    } else {
      tone("sine", 349, t, 0.24, 0.06, 0.014, 0.28);
      tone("sine", 294, t + 0.18, 0.38, 0.055, 0.014, 0.42);
    }
  }

  function unlock() {
    ensure();
  }

  root.HaiGwongAudio = {
    ensure: ensure,
    unlock: unlock,
    setMuted: setMuted,
    isMuted: isMuted,
    startHum: startHum,
    stopHum: stopHum,
    peekTick: peekTick,
    selectTap: selectTap,
    schoolBell: schoolBell,
    urgency: urgency,
    resultSting: resultSting,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
