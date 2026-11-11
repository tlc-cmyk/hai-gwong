/**
 * 今日訓導檢查手機櫃 — 畫面、操作同遊戲循環。
 * 美術為原創扁平描邊校園風，並非複製其他遊戲嘅角色或場景。
 * 以手機橫向為主；直立時會提示「請將手機橫過來玩」，並以橫向舞台入畫。
 */
(function () {
  "use strict";

  var E = window.HaiGwongEngine;
  var Audio = window.HaiGwongAudio;

  var canvas = document.getElementById("stage");
  var ctx = canvas.getContext("2d");
  var app = document.getElementById("app");
  var hud = document.getElementById("hud");
  var hudTime = document.getElementById("hud-time");
  var hudMeta = document.getElementById("hud-meta");
  var pageNav = document.getElementById("page-nav");
  var btnPagePrev = document.getElementById("btn-page-prev");
  var btnPageNext = document.getElementById("btn-page-next");
  var pageTabs = pageNav ? Array.prototype.slice.call(pageNav.querySelectorAll(".page-tab")) : [];
  var screenTitle = document.getElementById("screen-title");
  var screenResult = document.getElementById("screen-result");
  var rotateHint = document.getElementById("rotate-hint");
  var btnStart = document.getElementById("btn-start");
  var btnRetry = document.getElementById("btn-retry");
  var btnHome = document.getElementById("btn-home");
  var muteBtns = [
    document.getElementById("btn-mute-play"),
    document.getElementById("btn-mute-title"),
    document.getElementById("btn-mute-result"),
  ];

  var screen = "title";
  var eng = new E.GameEngine({ seed: 1 });
  var dpr = 1;
  var screenW = 640;
  var screenH = 360;
  var viewW = 640;
  var viewH = 360;
  var stage = { x: 0, y: 0, w: 640, h: 360, portrait: false, banner: 0 };
  var safe = { top: 0, bottom: 0, left: 0, right: 0 };
  var pointer = { x: 0, y: 0, active: false, seen: false, id: null };
  var swipe = {
    tracking: false,
    startX: 0,
    startY: 0,
    startT: 0,
    fromNav: false,
    committed: false,
  };
  var ignoreUntilUp = false;
  var lastSecond = -1;
  var lastTs = 0;
  var titleSeed = 20261111;
  var slideFrom = 0;
  var slideOffset = 0;
  var slideStart = 0;
  var wheelLock = 0;
  var SLIDE_MS = 220;

  var ink = "#2c241c";
  var cream = "#f3ead8";
  var cream2 = "#f7f1e6";
  var olive = "#3f5c3d";
  var wall = "#efe6d2";
  var floorCol = "#e6d8bc";

  function nowMs() {
    return (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
  }

  function resize() {
    var w = app.clientWidth || window.innerWidth;
    var h = app.clientHeight || window.innerHeight;
    dpr = Math.max(1, Math.min(2.5, window.devicePixelRatio || 1));
    screenW = Math.max(1, w);
    screenH = Math.max(1, h);
    canvas.width = Math.round(screenW * dpr);
    canvas.height = Math.round(screenH * dpr);
    canvas.style.width = screenW + "px";
    canvas.style.height = screenH + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    var dummy = document.createElement("div");
    dummy.style.cssText = "position:absolute;visibility:hidden;pointer-events:none;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px);padding-left:env(safe-area-inset-left,0px);padding-right:env(safe-area-inset-right,0px);";
    document.body.appendChild(dummy);
    var s = getComputedStyle(dummy);
    safe.top = parseFloat(s.paddingTop) || 0;
    safe.bottom = parseFloat(s.paddingBottom) || 0;
    safe.left = parseFloat(s.paddingLeft) || 0;
    safe.right = parseFloat(s.paddingRight) || 0;
    dummy.remove();
    var probe = document.getElementById("safe-probe");
    if (probe) safe.top = Math.max(safe.top, probe.getBoundingClientRect().height || 0);

    computeStage();
    viewW = stage.w;
    viewH = stage.h;
    layoutPlayfield();
    layoutChrome();
    updateRotateHint();
    syncPageNav();
  }

  function computeStage() {
    var portrait = screenH > screenW + 1;
    var banner = portrait ? Math.max(40, Math.min(58, screenH * 0.09) + safe.top) : 0;
    if (!portrait) {
      stage = { x: 0, y: 0, w: screenW, h: screenH, portrait: false, banner: 0 };
      return;
    }
    var availW = screenW;
    var availH = Math.max(80, screenH - banner);
    var aspect = 16 / 9;
    var w, h;
    if (availW / availH > aspect) {
      h = availH;
      w = h * aspect;
    } else {
      w = availW;
      h = w / aspect;
    }
    stage = {
      x: (screenW - w) / 2,
      y: banner + (availH - h) / 2,
      w: w,
      h: h,
      portrait: true,
      banner: banner,
    };
  }

  function headerHeight() {
    return Math.max(36, Math.min(56, viewH * 0.11));
  }

  function navHeight() {
    return Math.max(36, Math.min(48, viewH * 0.1)) + (stage.portrait ? 0 : safe.bottom);
  }

  function hudOffset() {
    return (stage.portrait ? 6 : safe.top) + 36;
  }

  function layoutPlayfield() {
    var top = hudOffset() + 2;
    if (screen === "title") {
      top = (stage.portrait ? 8 : safe.top) + Math.max(72, viewH * 0.28);
    }
    var head = screen === "title" ? 0 : headerHeight();
    var nav = screen === "title" ? Math.max(24, viewH * 0.06) : navHeight();
    var y = top + head;
    var h = viewH - y - nav;
    if (h < 90) {
      head = Math.max(28, head * 0.7);
      y = top + head;
      h = viewH - y - Math.max(28, nav * 0.75);
    }
    var padX = Math.max(8, (stage.portrait ? 8 : Math.max(safe.left, safe.right)), viewW * 0.02);
    eng.setPlayfield({
      x: padX,
      y: y,
      w: Math.max(80, viewW - padX * 2),
      h: Math.max(80, h),
    });
  }

  function layoutChrome() {
    var left = stage.x + (stage.portrait ? 0 : safe.left);
    var right = screenW - (stage.x + stage.w) + (stage.portrait ? 0 : safe.right);
    var top = stage.y + (stage.portrait ? 4 : 0);
    hud.style.left = left + "px";
    hud.style.right = right + "px";
    hud.style.top = top + "px";
    hud.style.paddingTop = (stage.portrait ? 4 : (6 + safe.top)) + "px";

    var bottom = screenH - (stage.y + stage.h);
    pageNav.style.left = left + "px";
    pageNav.style.right = right + "px";
    pageNav.style.bottom = Math.max(0, bottom) + "px";
    pageNav.style.paddingBottom = ((stage.portrait ? 6 : 8) + (stage.portrait ? 0 : safe.bottom)) + "px";
  }

  function updateRotateHint() {
    rotateHint.classList.toggle("hidden", !stage.portrait);
  }

  function formatTime(sec) {
    var s = Math.max(0, Math.ceil(sec - 1e-9));
    var m = (s / 60) | 0;
    var r = s % 60;
    return m + ":" + (r < 10 ? "0" : "") + r;
  }

  function formatNums(ids) {
    if (!ids || !ids.length) return "無";
    return ids.map(function (id) { return E.lockerLabel(id); }).join("、");
  }

  function syncMuteLabels() {
    var muted = Audio.isMuted();
    muteBtns.forEach(function (btn) {
      if (!btn) return;
      if (btn.classList.contains("icon-btn")) {
        btn.textContent = muted ? "靜" : "聲";
        btn.setAttribute("aria-label", muted ? "開啟聲音" : "靜音");
      } else {
        btn.textContent = muted ? "聲音：關" : "聲音：開";
      }
    });
  }

  function syncPageNav() {
    var form = eng.form;
    pageTabs.forEach(function (tab) {
      var f = +tab.getAttribute("data-form");
      tab.classList.toggle("is-active", f === form);
      tab.setAttribute("aria-current", f === form ? "page" : "false");
    });
    if (btnPagePrev) btnPagePrev.disabled = form <= 0;
    if (btnPageNext) btnPageNext.disabled = form >= E.FORMS - 1;
  }

  function showScreen(name) {
    screen = name;
    app.classList.toggle("is-title", name === "title");
    app.classList.toggle("is-result", name === "result");
    screenTitle.classList.toggle("hidden", name !== "title");
    screenResult.classList.toggle("hidden", name !== "result");
    hud.classList.toggle("hidden", name !== "play");
    pageNav.classList.toggle("hidden", name !== "play");
    layoutPlayfield();
    layoutChrome();
    syncPageNav();
  }

  function goForm(index, animate) {
    var cur = eng.form;
    var next = E.clamp(index | 0, 0, E.FORMS - 1);
    if (next === cur) {
      syncPageNav();
      return;
    }
    if (animate) {
      slideFrom = cur < next ? 1 : -1;
      slideOffset = slideFrom;
      slideStart = nowMs();
    } else {
      slideOffset = 0;
      slideFrom = 0;
    }
    eng.setForm(next);
    if (screen === "play" && eng.phase === "inspect" && pointer.seen) {
      eng.setBeamFromPointer(pointer.x, pointer.y);
    }
    syncPageNav();
  }

  function startRound(keepSeed) {
    Audio.unlock();
    var seed = keepSeed ? eng.seed : ((Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0);
    eng.reset(seed);
    slideOffset = 0;
    layoutPlayfield();
    pointer.active = false;
    pointer.seen = false;
    ignoreUntilUp = false;
    lastSecond = -1;
    showScreen("play");
    Audio.stopHum();
    refreshHud();
  }

  function refreshHud() {
    if (screen !== "play") return;
    var phaseLabel = eng.phase === "inspect" ? "檢查" : "點選";
    var left = eng.remaining();
    hudTime.textContent = phaseLabel + " " + formatTime(left);
    hudTime.classList.toggle("urgent", left <= 5 && (eng.phase === "inspect" || eng.phase === "select"));
    var formName = E.FORM_NAMES[eng.form] || "";
    if (eng.phase === "inspect") {
      var visited = eng.visitedCount();
      hudMeta.textContent = pointer.seen
        ? (formName + "　已照 " + visited + " 格")
        : (formName + "　移動電筒照櫃隙");
    } else if (eng.phase === "select") {
      hudMeta.textContent = formName + "　已點選 " + eng.selectedCount + " 格";
    } else {
      hudMeta.textContent = formName;
    }
  }

  function fillResult() {
    var r = eng.result;
    if (!r) return;
    document.getElementById("result-grade").textContent = r.grade;
    document.getElementById("result-score").textContent = "分數 " + r.score;
    document.getElementById("result-counts").textContent =
      "查中 " + r.correct + "　誤報 " + r.falseFlags + "　漏查 " + r.missed +
      "　（共 " + E.EMPTY_COUNT + " 格違規）";
    document.getElementById("result-list").innerHTML =
      "查中：" + formatNums(r.hitIds) +
      "<br>誤報：" + formatNums(r.falseIds) +
      "<br>漏查：" + formatNums(r.missIds);
    var best = r.best || 0;
    var bestEl = document.getElementById("result-best");
    if (r.bestUpdated) bestEl.textContent = "自我最佳更新　" + best;
    else if (best > 0) bestEl.textContent = "自我最佳　" + best;
    else bestEl.textContent = "";
    document.getElementById("result-blurb").textContent = r.blurb || "";
  }

  function goResult() {
    Audio.stopHum();
    fillResult();
    showScreen("result");
    if (eng.result) Audio.resultSting(eng.result.gradeKey);
  }

  /* ---------- drawing helpers ---------- */

  function roundRect(x, y, w, h, r) {
    var rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function mixHex(a, b, t) {
    function p(hex) {
      return [
        parseInt(hex.slice(1, 3), 16),
        parseInt(hex.slice(3, 5), 16),
        parseInt(hex.slice(5, 7), 16),
      ];
    }
    var A = p(a), B = p(b);
    function h(v) {
      var n = Math.round(v);
      var s = n.toString(16);
      return s.length < 2 ? "0" + s : s;
    }
    return "#" + h(A[0] + (B[0] - A[0]) * t) + h(A[1] + (B[1] - A[1]) * t) + h(A[2] + (B[2] - A[2]) * t);
  }

  function strokeInk(w) {
    ctx.strokeStyle = ink;
    ctx.lineWidth = w == null ? 1.4 : w;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
  }

  function drawBackground() {
    ctx.fillStyle = cream;
    ctx.fillRect(0, 0, viewW, viewH);
    ctx.strokeStyle = "rgba(44,36,28,0.06)";
    ctx.lineWidth = 1;
    var i;
    for (i = 0; i < 8; i++) {
      var y = (viewH / 8) * i + 10;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(viewW, y);
      ctx.stroke();
    }
  }

  function drawFloor() {
    var play = eng.layout.play;
    var y = play.y + play.h + 2;
    var h = viewH - y;
    ctx.fillStyle = floorCol;
    ctx.fillRect(0, y, viewW, h);
    strokeInk(1.5);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(viewW, y);
    ctx.stroke();
    ctx.strokeStyle = "rgba(44,36,28,0.18)";
    ctx.lineWidth = 1;
    var planks = 5;
    var i;
    for (i = 1; i < planks; i++) {
      var py = y + (h / planks) * i;
      ctx.beginPath();
      ctx.moveTo(0, py);
      ctx.lineTo(viewW, py);
      ctx.stroke();
    }
    for (i = 1; i < 10; i++) {
      var x = (viewW / 10) * i;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, viewH);
      ctx.stroke();
    }
  }

  function drawHeader(lit, formIndex) {
    var play = eng.layout.play;
    var top = hudOffset() + 2;
    var y = top;
    var h = play.y - y;
    var x = play.x;
    var w = play.w;
    if (h <= 8) return;
    var form = formIndex == null ? eng.form : formIndex;
    var signLabel = (E.FORM_NAMES[form] || "") + "級 儲物櫃";

    ctx.fillStyle = lit ? wall : "#3a3228";
    ctx.fillRect(0, Math.max(0, y - 8), viewW, h + 10);

    var cx = x + Math.min(36, w * 0.08);
    var cy = y + h * 0.52;
    var cr = Math.max(9, Math.min(h * 0.32, 15));
    ctx.beginPath();
    ctx.arc(cx, cy, cr, 0, Math.PI * 2);
    ctx.fillStyle = lit ? cream2 : "#2e2820";
    ctx.fill();
    strokeInk(lit ? 1.4 : 1);
    ctx.strokeStyle = lit ? ink : "rgba(247,241,230,0.38)";
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx, cy - cr * 0.55);
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + cr * 0.42, cy + cr * 0.12);
    ctx.strokeStyle = lit ? ink : "rgba(247,241,230,0.38)";
    ctx.lineWidth = lit ? 1.3 : 1;
    ctx.stroke();

    var sw = Math.min(200, w * 0.42);
    var sh = Math.max(18, h * 0.5);
    var sx = x + w / 2 - sw / 2;
    var sy = y + h * 0.28;
    ctx.strokeStyle = lit ? ink : "rgba(247,241,230,0.28)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(sx + 16, y + 2);
    ctx.lineTo(sx + 16, sy);
    ctx.moveTo(sx + sw - 16, y + 2);
    ctx.lineTo(sx + sw - 16, sy);
    ctx.stroke();
    roundRect(sx, sy, sw, sh, 4);
    ctx.fillStyle = lit ? olive : "#243226";
    ctx.fill();
    ctx.strokeStyle = lit ? ink : "rgba(247,241,230,0.3)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = lit ? cream2 : "rgba(247,241,230,0.45)";
    ctx.font = '700 ' + Math.max(11, Math.min(15, sh * 0.5)) + 'px "PingFang HK","PingFang TC","Noto Sans TC",sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(signLabel, sx + sw / 2, sy + sh / 2 + 0.5);

    var nw = Math.min(78, w * 0.16);
    var nh = Math.max(20, h * 0.58);
    var nx = x + w - nw - 2;
    var ny = y + h * 0.22;
    roundRect(nx, ny, nw, nh, 3);
    ctx.fillStyle = lit ? "#f3efe2" : "#2c281f";
    ctx.fill();
    ctx.strokeStyle = lit ? ink : "rgba(247,241,230,0.25)";
    ctx.lineWidth = 1.3;
    ctx.stroke();
    if (lit) {
      ctx.fillStyle = olive;
      ctx.font = '700 8px "PingFang HK","PingFang TC","Noto Sans TC",sans-serif';
      ctx.textAlign = "center";
      ctx.fillText("通告", nx + nw / 2, ny + 8);
      ctx.strokeStyle = "rgba(44,36,28,0.45)";
      ctx.lineWidth = 1;
      var lineY;
      for (lineY = ny + 13; lineY < ny + nh - 5; lineY += 5) {
        ctx.beginPath();
        ctx.moveTo(nx + 6, lineY);
        ctx.lineTo(nx + nw - 6, lineY);
        ctx.stroke();
      }
    }
  }

  function drawPhone(slit) {
    var pw = Math.max(5, slit.w * 0.7);
    var ph = Math.max(8, slit.h * 0.55);
    var px = slit.x + slit.w / 2 - pw / 2;
    var py = slit.y + slit.h * 0.28;
    roundRect(px, py, pw, ph, Math.max(1, pw * 0.16));
    ctx.fillStyle = "#2a3038";
    ctx.fill();
    ctx.strokeStyle = "#111";
    ctx.lineWidth = 0.7;
    ctx.stroke();
    var sw = pw * 0.7;
    var sh = ph * 0.55;
    roundRect(px + (pw - sw) / 2, py + ph * 0.16, sw, sh, 0.6);
    ctx.fillStyle = "#dce8c8";
    ctx.fill();
    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(px + pw * 0.35, py + ph * 0.08, pw * 0.3, Math.max(0.7, ph * 0.04));
  }

  function drawLocker(geo, locker, mode) {
    var x = geo.x, y = geo.y, w = geo.w, h = geo.h;
    var lit = mode === "lit" || mode === "select" || mode === "result" || mode === "title";
    var fill = lit ? locker.color : mixHex(locker.color, "#16130f", 0.9);
    var r = Math.min(3.5, w * 0.12, h * 0.1);
    roundRect(x, y, w, h, r);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = lit ? ink : "rgba(44,36,28,0.38)";
    ctx.lineWidth = lit ? 1.25 : 1;
    ctx.stroke();

    if (lit) {
      ctx.fillStyle = "rgba(44,36,28,0.08)";
      ctx.fillRect(x + 1, y + h * 0.78, w - 2, h * 0.22 - 1);
    }

    if (lit && h > 22) {
      ctx.strokeStyle = "rgba(44,36,28,0.28)";
      ctx.lineWidth = 0.8;
      var v;
      for (v = 0; v < 2; v++) {
        ctx.beginPath();
        ctx.moveTo(x + w * 0.16, y + 4 + v * 3);
        ctx.lineTo(x + w * 0.4, y + 4 + v * 3);
        ctx.stroke();
      }
    }

    var hx = x + w * 0.78;
    var hy = y + h * 0.48;
    var hw = Math.max(2, w * 0.07);
    var hh = Math.max(5, h * 0.16);
    roundRect(hx, hy, hw, hh, 1);
    ctx.fillStyle = lit ? mixHex(locker.color, "#2c241c", 0.25) : "rgba(20,16,12,0.5)";
    ctx.fill();
    if (lit) {
      ctx.strokeStyle = ink;
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }

    var s = geo.slit;
    var crackW = Math.max(1.4, Math.min(2.4, w * 0.07));
    var crackX = s.x + s.w / 2 - crackW / 2;
    var crackY = y + h * 0.22;
    var crackH = h * 0.62;
    if (lit && mode === "lit") {
      var pr = Math.min(3, s.w * 0.25);
      roundRect(s.x, s.y, s.w, s.h, pr);
      ctx.fillStyle = "#16110c";
      ctx.fill();
      ctx.save();
      roundRect(s.x, s.y, s.w, s.h, pr);
      ctx.clip();
      if (locker.hasPhone) drawPhone(s);
      else {
        ctx.strokeStyle = "rgba(247,241,230,0.28)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(s.x + 2, s.y + s.h * 0.32);
        ctx.lineTo(s.x + s.w - 2, s.y + s.h * 0.32);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(s.x + s.w / 2, s.y + s.h * 0.22, Math.max(1.2, s.w * 0.12), Math.PI, 0);
        ctx.stroke();
      }
      ctx.restore();
      ctx.strokeStyle = ink;
      ctx.lineWidth = 1.1;
      roundRect(s.x, s.y, s.w, s.h, pr);
      ctx.stroke();
    } else {
      ctx.fillStyle = lit ? "rgba(28,22,16,0.72)" : "rgba(8,6,4,0.8)";
      ctx.fillRect(crackX, crackY, crackW, crackH);
    }

    var showNum = lit || mode === "dim";
    if (showNum) {
      ctx.fillStyle = lit ? ink : "rgba(247,241,230,0.16)";
      var fs = Math.max(7, Math.min(11, w * 0.28, h * 0.22));
      ctx.font = '700 ' + fs + 'px "PingFang HK","PingFang TC","Noto Sans TC",sans-serif';
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText(String(locker.number), x + 2.5, y + 2);
    }

    if (mode === "lit" || mode === "dim") {
      if (eng.isVisited(locker.id)) {
        ctx.beginPath();
        ctx.arc(x + w - 5.2, y + 5.5, 2.6, 0, Math.PI * 2);
        ctx.fillStyle = lit ? cream2 : "rgba(247,241,230,0.55)";
        ctx.fill();
        ctx.strokeStyle = lit ? olive : "rgba(247,241,230,0.7)";
        ctx.lineWidth = 1.1;
        ctx.stroke();
      }
    }

    if (mode === "select" && eng.isSelected(locker.id)) {
      roundRect(x + 1.2, y + 1.2, w - 2.4, h - 2.4, Math.max(1, r - 1));
      ctx.strokeStyle = olive;
      ctx.lineWidth = 2.8;
      ctx.stroke();
      var mr = Math.max(5, Math.min(w, h) * 0.2);
      ctx.beginPath();
      ctx.arc(x + w / 2, y + h * 0.68, mr, 0, Math.PI * 2);
      ctx.fillStyle = cream2;
      ctx.fill();
      ctx.strokeStyle = ink;
      ctx.lineWidth = 1.1;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x + w / 2, y + h * 0.68, mr * 0.52, 0, Math.PI * 2);
      ctx.fillStyle = olive;
      ctx.fill();
    }

    if (mode === "result" && eng.result) {
      var rlt = eng.result;
      var isHit = rlt.hitIds.indexOf(locker.id) >= 0;
      var isFalse = rlt.falseIds.indexOf(locker.id) >= 0;
      var isMiss = rlt.missIds.indexOf(locker.id) >= 0;
      if (isHit || isFalse || isMiss) {
        roundRect(x + 1.2, y + 1.2, w - 2.4, h - 2.4, Math.max(1, r - 1));
        ctx.lineWidth = 2.2;
        if (isHit) ctx.strokeStyle = olive;
        else if (isFalse) ctx.strokeStyle = "#8a4a3a";
        else {
          ctx.setLineDash([3, 2]);
          ctx.strokeStyle = "#6a5a2a";
        }
        ctx.stroke();
        ctx.setLineDash([]);
        var markY = y + h * 0.62;
        var markX = x + w / 2;
        ctx.font = '700 ' + Math.max(8, Math.min(13, w * 0.32)) + 'px "PingFang HK","PingFang TC",sans-serif';
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        if (isHit) {
          ctx.fillStyle = olive;
          ctx.fillText("✓", markX, markY);
        } else if (isFalse) {
          ctx.fillStyle = "#8a4a3a";
          ctx.fillText("×", markX, markY);
        } else {
          ctx.fillStyle = "#6a5a2a";
          ctx.fillText("漏", markX, markY);
        }
      }
    }
  }

  function lockersOf(form) {
    var round = (screen === "title") ? E.createRound(titleSeed) : eng.round;
    return E.formLockers(round, form);
  }

  function drawLockers(mode, form) {
    var geos = eng.layout.lockers;
    var lockers = lockersOf(form == null ? eng.form : form);
    for (var i = 0; i < geos.length; i++) {
      drawLocker(geos[i], lockers[i], mode);
    }
  }

  function drawWorld(mode, form) {
    var f = form == null ? eng.form : form;
    drawBackground();
    if (mode !== "title") drawHeader(mode !== "dim", f);
    drawLockers(mode, f);
    drawFloor();
  }

  function drawTorch(px, py, beam) {
    if (!beam) return;
    ctx.save();
    ctx.translate(px, py);
    ctx.scale(0.86, 0.86);

    ctx.fillStyle = olive;
    strokeInk(1.3);
    roundRect(-6, 9, 12, 18, 4);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#e8c39a";
    roundRect(-7, -2, 14, 12, 4);
    ctx.fill();
    ctx.stroke();

    var f;
    for (f = -2; f <= 2; f++) {
      if (f === 0) continue;
      ctx.beginPath();
      ctx.ellipse(f * 2.8, 1.5, 1.8, 3.6, 0, 0, Math.PI * 2);
      ctx.fillStyle = "#e8c39a";
      ctx.fill();
      ctx.stroke();
    }

    ctx.fillStyle = "#3a332c";
    roundRect(-4.5, -22, 9, 18, 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#d8d0c0";
    roundRect(-6, -28, 12, 8, 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(0, -28, 5.6, 2.1, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#f6e7b0";
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }

  function drawBeamOverlay(beam) {
    var g = ctx.createRadialGradient(beam.x, beam.y, beam.radius * 0.1, beam.x, beam.y, beam.radius);
    g.addColorStop(0, "rgba(255, 236, 190, 0.2)");
    g.addColorStop(0.55, "rgba(255, 214, 150, 0.08)");
    g.addColorStop(1, "rgba(20, 14, 8, 0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(beam.x, beam.y, beam.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 224, 170, 0.5)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(beam.x, beam.y, beam.radius + 3, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255, 210, 140, 0.18)";
    ctx.lineWidth = 6;
    ctx.stroke();
  }

  function drawStickTeacher() {
    var play = eng.layout.play;
    var x = play.x + 28;
    var y = play.y + play.h + 8;
    ctx.save();
    ctx.translate(x, y);
    ctx.beginPath();
    ctx.arc(0, -28, 6, 0, Math.PI * 2);
    ctx.fillStyle = "#e8c39a";
    ctx.fill();
    strokeInk(1.3);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -22);
    ctx.lineTo(0, -8);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -18);
    ctx.lineTo(10, -12);
    ctx.lineTo(16, -18);
    ctx.stroke();
    ctx.fillStyle = "#3a332c";
    roundRect(13, -28, 5, 11, 1);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#f6e7b0";
    ctx.beginPath();
    ctx.arc(15.5, -29, 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(-6, 4);
    ctx.moveTo(0, -8);
    ctx.lineTo(6, 4);
    ctx.stroke();
    ctx.restore();
  }

  function updateSlide() {
    if (!slideFrom && !slideOffset) return 0;
    var t = (nowMs() - slideStart) / SLIDE_MS;
    if (t >= 1) {
      slideOffset = 0;
      slideFrom = 0;
      return 0;
    }
    if (t < 0) t = 0;
    var eased = 1 - Math.pow(1 - t, 3);
    slideOffset = slideFrom * (1 - eased);
    return slideOffset;
  }

  function drawTitleScene() {
    var liveRound = eng.round;
    var livePhase = eng.phase;
    var liveForm = eng.form;
    eng.round = E.createRound(titleSeed);
    eng.phase = "title";
    eng.form = 0;
    drawWorld("title", 0);
    drawStickTeacher();
    eng.round = liveRound;
    eng.phase = livePhase;
    eng.form = liveForm;
  }

  function drawPlayWall(mode, form, ox) {
    ctx.save();
    ctx.translate(ox, 0);
    drawWorld(mode, form);
    ctx.restore();
  }

  function drawPlay() {
    var off = updateSlide();
    var shift = off * viewW;
    var incoming = off > 0 ? eng.form - 1 : (off < 0 ? eng.form + 1 : -1);
    var mode;
    if (eng.phase === "inspect") mode = "dim";
    else if (eng.phase === "select") mode = "select";
    else mode = "result";

    if (incoming >= 0 && incoming < E.FORMS && shift) {
      drawPlayWall(mode === "inspect" ? "dim" : mode, incoming, shift + (off > 0 ? -viewW : viewW));
    }

    if (eng.phase === "inspect") {
      drawPlayWall("dim", eng.form, shift);
      if (eng.beam && pointer.seen) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(eng.beam.x + shift, eng.beam.y, eng.beam.radius, 0, Math.PI * 2);
        ctx.clip();
        ctx.translate(shift, 0);
        drawWorld("lit", eng.form);
        ctx.restore();
        var beam = { x: eng.beam.x + shift, y: eng.beam.y, radius: eng.beam.radius };
        drawBeamOverlay(beam);
        if (pointer.active || pointer.seen) drawTorch(pointer.x + shift, pointer.y, eng.beam);
      }
    } else {
      drawPlayWall(mode, eng.form, shift);
    }
  }

  function drawLetterbox() {
    ctx.fillStyle = cream;
    ctx.fillRect(0, 0, screenW, screenH);
    if (stage.portrait) {
      if (stage.banner > 0) {
        ctx.fillStyle = cream;
        ctx.fillRect(0, 0, screenW, stage.banner);
        ctx.strokeStyle = ink;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, stage.banner);
        ctx.lineTo(screenW, stage.banner);
        ctx.stroke();
      }
      // dim bars around the landscape stage
      ctx.fillStyle = "#e4d8be";
      if (stage.x > 0) {
        ctx.fillRect(0, stage.y, stage.x, stage.h);
        ctx.fillRect(stage.x + stage.w, stage.y, screenW - (stage.x + stage.w), stage.h);
      }
    }
  }

  function render() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, screenW, screenH);
    drawLetterbox();
    ctx.save();
    ctx.beginPath();
    ctx.rect(stage.x, stage.y, stage.w, stage.h);
    ctx.clip();
    ctx.translate(stage.x, stage.y);
    if (screen === "title") drawTitleScene();
    else drawPlay();
    ctx.restore();
  }

  /* ---------- loop & input ---------- */

  function tick(ts) {
    if (!lastTs) lastTs = ts;
    var dt = Math.min(0.05, (ts - lastTs) / 1000);
    lastTs = ts;

    if (screen === "play" && (eng.phase === "inspect" || eng.phase === "select")) {
      var prevPhase = eng.phase;
      eng.step(dt);
      var visits = eng.drainVisitEvents();
      if (visits.length) {
        Audio.peekTick();
        if (eng.phase === "inspect" && pointer.seen) Audio.startHum();
      }
      if (prevPhase === "inspect" && eng.phase === "select") {
        Audio.stopHum();
        Audio.schoolBell();
        ignoreUntilUp = pointer.active;
        lastSecond = -1;
      }
      if (eng.phase === "result" && prevPhase !== "result") {
        goResult();
      } else {
        var left = eng.remaining();
        var sec = Math.ceil(left - 1e-9);
        if ((eng.phase === "inspect" || eng.phase === "select") && sec <= 5 && sec >= 1 && sec !== lastSecond) {
          lastSecond = sec;
          Audio.urgency(sec);
        }
        refreshHud();
      }
    }
    render();
    requestAnimationFrame(tick);
  }

  function canvasPoint(ev) {
    var rect = canvas.getBoundingClientRect();
    return {
      x: ev.clientX - rect.left - stage.x,
      y: ev.clientY - rect.top - stage.y,
    };
  }

  function inNavZone(pt) {
    var play = eng.layout.play;
    return pt.y >= play.y + play.h - 4 || pt.y <= play.y - 2;
  }

  function inSideMargin(pt) {
    var play = eng.layout.play;
    return pt.x <= play.x + 18 || pt.x >= play.x + play.w - 18;
  }

  function applyBeam(pt) {
    pointer.x = pt.x;
    pointer.y = pt.y;
    pointer.seen = true;
    if (screen === "play" && eng.phase === "inspect") {
      eng.setBeamFromPointer(pt.x, pt.y);
      Audio.startHum();
    }
  }

  function considerSwipe(pt, ev, isUp) {
    if (!swipe.tracking || swipe.committed) return false;
    var dx = pt.x - swipe.startX;
    var dy = pt.y - swipe.startY;
    var dt = nowMs() - swipe.startT;
    var absX = Math.abs(dx);
    var absY = Math.abs(dy);
    var isFlick = dt < 320 && absX > 64 && absX > absY * 2;
    var isPan = swipe.fromNav && absX > 48 && absX > absY * 1.15;
    var isSelectSwipe = eng.phase === "select" && absX > 52 && absX > absY * 1.2;
    if (!(isFlick || isPan || isSelectSwipe)) return false;
    var dir = dx < 0 ? 1 : -1;
    var next = eng.form + dir;
    if (next < 0 || next >= E.FORMS) return false;
    swipe.committed = true;
    goForm(next, true);
    refreshHud();
    return true;
  }

  function onPointerDown(ev) {
    if (screen !== "play") return;
    ev.preventDefault();
    try { canvas.setPointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
    pointer.active = true;
    pointer.id = ev.pointerId;
    var pt = canvasPoint(ev);
    swipe.tracking = true;
    swipe.startX = pt.x;
    swipe.startY = pt.y;
    swipe.startT = nowMs();
    swipe.fromNav = inNavZone(pt) || inSideMargin(pt);
    swipe.committed = false;
    if (eng.phase === "inspect") {
      applyBeam(pt);
    }
  }

  function onPointerMove(ev) {
    var pt = canvasPoint(ev);
    if (screen === "play" && swipe.tracking && (pointer.active || ev.pointerType === "mouse" && ev.buttons)) {
      considerSwipe(pt, ev, false);
    }
    if (screen === "play" && eng.phase === "inspect") {
      if (ev.pointerType === "mouse" || pointer.active) applyBeam(pt);
    } else if (screen === "play" && eng.phase === "select" && ev.pointerType === "mouse") {
      pointer.x = pt.x;
      pointer.y = pt.y;
    }
  }

  function onPointerUp(ev) {
    if (pointer.id != null && ev.pointerId !== pointer.id && ev.type !== "pointerleave") return;
    var pt = canvasPoint(ev);
    var swiped = false;
    if (swipe.tracking) swiped = considerSwipe(pt, ev, true) || swipe.committed;
    if (screen === "play" && eng.phase === "select" && !swiped && !ignoreUntilUp) {
      var id = eng.hitTest(pt.x, pt.y);
      var moved = Math.hypot(pt.x - swipe.startX, pt.y - swipe.startY);
      if (id >= 0 && moved < 18) {
        var turningOn = !eng.isSelected(id);
        eng.toggleSelect(id);
        Audio.selectTap(turningOn);
        refreshHud();
      }
    }
    pointer.active = false;
    pointer.id = null;
    swipe.tracking = false;
    swipe.committed = false;
    if (ignoreUntilUp) ignoreUntilUp = false;
  }

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);
  canvas.addEventListener("contextmenu", function (e) { e.preventDefault(); });

  canvas.addEventListener("mousemove", function (ev) {
    if (screen === "play" && eng.phase === "inspect") applyBeam(canvasPoint(ev));
  });

  canvas.addEventListener("wheel", function (ev) {
    if (screen !== "play") return;
    ev.preventDefault();
    var t = nowMs();
    if (t - wheelLock < 260) return;
    var delta = Math.abs(ev.deltaX) > Math.abs(ev.deltaY) ? ev.deltaX : ev.deltaY;
    if (Math.abs(delta) < 8) return;
    wheelLock = t;
    if (delta > 0) goForm(eng.form + 1, true);
    else goForm(eng.form - 1, true);
    refreshHud();
  }, { passive: false });

  if (pageNav) {
    pageNav.addEventListener("wheel", function (ev) {
      if (screen !== "play") return;
      ev.preventDefault();
      var t = nowMs();
      if (t - wheelLock < 260) return;
      var delta = Math.abs(ev.deltaX) > Math.abs(ev.deltaY) ? ev.deltaX : ev.deltaY;
      if (Math.abs(delta) < 8) return;
      wheelLock = t;
      if (delta > 0) goForm(eng.form + 1, true);
      else goForm(eng.form - 1, true);
      refreshHud();
    }, { passive: false });
  }

  window.addEventListener("keydown", function (ev) {
    if (screen !== "play") return;
    if (ev.key === "ArrowLeft" || ev.key === "Left") {
      ev.preventDefault();
      goForm(eng.form - 1, true);
      refreshHud();
    } else if (ev.key === "ArrowRight" || ev.key === "Right") {
      ev.preventDefault();
      goForm(eng.form + 1, true);
      refreshHud();
    } else if (ev.key === "1" || ev.key === "2" || ev.key === "3" || ev.key === "4") {
      goForm(+ev.key - 1, true);
      refreshHud();
    }
  });

  btnStart.addEventListener("click", function () {
    Audio.unlock();
    startRound(false);
  });
  btnRetry.addEventListener("click", function () {
    Audio.unlock();
    startRound(false);
  });
  btnHome.addEventListener("click", function () {
    Audio.stopHum();
    showScreen("title");
  });

  pageTabs.forEach(function (tab) {
    tab.addEventListener("click", function () {
      goForm(+tab.getAttribute("data-form"), true);
      refreshHud();
    });
  });
  if (btnPagePrev) {
    btnPagePrev.addEventListener("click", function () {
      goForm(eng.form - 1, true);
      refreshHud();
    });
  }
  if (btnPageNext) {
    btnPageNext.addEventListener("click", function () {
      goForm(eng.form + 1, true);
      refreshHud();
    });
  }

  muteBtns.forEach(function (btn) {
    if (!btn) return;
    btn.addEventListener("click", function () {
      Audio.unlock();
      Audio.setMuted(!Audio.isMuted());
      if (Audio.isMuted()) Audio.stopHum();
      else if (screen === "play" && eng.phase === "inspect" && pointer.seen) Audio.startHum();
      syncMuteLabels();
    });
  });

  window.addEventListener("resize", resize);
  window.addEventListener("orientationchange", function () { setTimeout(resize, 80); });

  resize();
  eng.reset(titleSeed);
  layoutPlayfield();
  showScreen("title");
  syncMuteLabels();
  requestAnimationFrame(tick);
})();
