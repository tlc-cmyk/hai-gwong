/**
 * 今日訓導檢查手機櫃 — 純遊戲邏輯（無 DOM、無 Web Audio）。
 * 原創校園儲物櫃電筒記憶玩法。
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.HaiGwongEngine = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var TITLE = "今日訓導檢查手機櫃";
  var FORMS = 4;
  var FORM_NAMES = ["中一", "中二", "中三", "中四"];
  var COLS = 10;
  var ROWS = 12;
  var LOCKER_COUNT = COLS * ROWS;
  var TOTAL_LOCKERS = LOCKER_COUNT * FORMS;
  var EMPTY_PER_FORM = 4;
  var EMPTY_COUNT = EMPTY_PER_FORM * FORMS;
  var PHASE1_SECONDS = 45;
  var PHASE2_SECONDS = 15;
  var POINTS_HIT = 100;
  var POINTS_FALSE = 25;
  var BEST_KEY = "hai-gwong-best-v2";

  var GRADES = {
    perfect: "火眼金睛",
    careful: "細心值日",
    pass: "合格",
    missed: "漏咗幾格",
    wild: "亂點",
    practice: "要再練",
  };

  var BLURBS = {
    perfect: "十六格全中，一格都冇點錯。今早嘅值日真係醒目。",
    careful: "差不多睇晒，只係差少少。已經好穩陣。",
    pass: "有留心照過，記憶都唔差。再熟一次會更準。",
    missed: "有幾格冇交機嘅櫃漏咗。下次可以再慢慢掃多一輪。",
    wild: "點得太多，連有電話嘅格都圈咗。記得先想清楚再點。",
    practice: "呢輪記得唔夠穩。唔緊要，再來一次，慢慢照、慢慢記。",
  };

  function clamp(x, a, b) {
    return x < a ? a : x > b ? b : x;
  }

  function formOf(id) {
    return (id / LOCKER_COUNT) | 0;
  }

  function localOf(id) {
    return id % LOCKER_COUNT;
  }

  function globalId(form, localId) {
    return form * LOCKER_COUNT + localId;
  }

  function lockerLabel(id) {
    var form = formOf(id);
    var name = FORM_NAMES[form] || ("年級" + (form + 1));
    return name + " 第 " + (localOf(id) + 1) + " 格";
  }

  function mulberry32(a) {
    var seed = a >>> 0;
    return function () {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hslToHex(h, s, l) {
    s /= 100;
    l /= 100;
    var c = (1 - Math.abs(2 * l - 1)) * s;
    var hp = ((h % 360) + 360) % 360 / 60;
    var x = c * (1 - Math.abs((hp % 2) - 1));
    var r = 0, g = 0, b = 0;
    if (hp < 1) {
      r = c; g = x;
    } else if (hp < 2) {
      r = x; g = c;
    } else if (hp < 3) {
      g = c; b = x;
    } else if (hp < 4) {
      g = x; b = c;
    } else if (hp < 5) {
      r = x; b = c;
    } else {
      r = c; b = x;
    }
    var m = l - c / 2;
    function hex(v) {
      var n = Math.round((v + m) * 255);
      if (n < 0) n = 0;
      if (n > 255) n = 255;
      var t = n.toString(16);
      return t.length < 2 ? "0" + t : t;
    }
    return "#" + hex(r) + hex(g) + hex(b);
  }

  /**
   * 每個年級 120 個互異、低飽和、非霓虹嘅櫃門顏色，方便喺電筒光下分辨。
   */
  function buildPalette(form) {
    var formIndex = form == null ? 0 : form;
    var out = [];
    var seen = {};
    var hue0 = formIndex * 53;
    for (var i = 0; i < LOCKER_COUNT; i++) {
      var col = i % COLS;
      var row = (i / COLS) | 0;
      var hue = (hue0 + col * 23.3 + row * 4.1 + (col % 2) * 8 + (row % 3) * 1.1) % 360;
      var sat = 28 + (row % 4) * 5 + (col % 3) * 2 + (formIndex % 2);
      var light = 46 + (row % 6) * 3.5 + ((col * 2 + formIndex) % 5);
      if (sat > 50) sat = 50;
      if (light > 70) light = 70;
      if (light < 42) light = 42;
      // 避免同乳白色走廊背景太接近
      var hueDist = Math.abs(((hue - 40 + 180) % 360) - 180);
      if (hueDist < 16 && light > 64 && sat < 30) {
        light -= 10;
        sat += 8;
      }
      var hex = hslToHex(hue, sat, light);
      var guard = 0;
      while (seen[hex] && guard++ < 24) {
        hue = (hue + 9.7) % 360;
        light = 42 + ((light - 42 + 4) % 28);
        sat = 28 + ((sat - 28 + 3) % 20);
        hex = hslToHex(hue, sat, light);
      }
      seen[hex] = 1;
      out.push(hex);
    }
    return out;
  }

  function buildPalettes() {
    var all = [];
    for (var f = 0; f < FORMS; f++) all.push(buildPalette(f));
    return all;
  }

  var PALETTES = buildPalettes();
  var PALETTE = PALETTES[0];

  function shufflePick(rng, count, total) {
    var ids = [];
    var i;
    for (i = 0; i < total; i++) ids.push(i);
    for (i = total - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var tmp = ids[i];
      ids[i] = ids[j];
      ids[j] = tmp;
    }
    return ids.slice(0, count).sort(function (a, b) { return a - b; });
  }

  /**
   * 由畫布尺寸計儲物櫃格位。header 同地板高度由呼叫端預留。
   * play: { x, y, w, h }
   * 10×12 格，配合直立手機畫面；櫃門略高。
   */
  function layoutGrid(play) {
    var area = play || { x: 0, y: 0, w: 360, h: 640 };
    var gutterX = Math.max(1, Math.min(3, area.w * 0.006));
    var gutterY = Math.max(1, Math.min(3, area.h * 0.004));
    var maxW = (area.w - gutterX * (COLS + 1)) / COLS;
    var maxH = (area.h - gutterY * (ROWS + 1)) / ROWS;
    var cellW = maxW;
    var cellH = maxH;
    // 櫃門略高，配合直立 10×12。
    if (cellH < cellW * 1.05) cellH = Math.min(maxH, cellW * 1.2);
    if (cellH > cellW * 1.7) cellH = cellW * 1.5;
    if (cellW < 8) cellW = Math.max(6, maxW);
    if (cellH < 8) cellH = Math.max(6, maxH);
    var gridW = cellW * COLS + gutterX * (COLS + 1);
    var gridH = cellH * ROWS + gutterY * (ROWS + 1);
    var originX = area.x + (area.w - gridW) / 2;
    var originY = area.y + (area.h - gridH) / 2;
    var lockers = [];
    for (var i = 0; i < LOCKER_COUNT; i++) {
      var col = i % COLS;
      var row = (i / COLS) | 0;
      var x = originX + gutterX + col * (cellW + gutterX);
      var y = originY + gutterY + row * (cellH + gutterY);
      // 罅隙夠闊，照進去可以清楚見到打橫擺嘅電話。
      var slitW = Math.max(10, cellW * 0.62);
      var slitH = Math.max(8, cellH * 0.4);
      var slitX = x + (cellW - slitW) / 2;
      var slitY = y + cellH * 0.3;
      lockers.push({
        id: i,
        number: i + 1,
        col: col,
        row: row,
        x: x,
        y: y,
        w: cellW,
        h: cellH,
        slit: { x: slitX, y: slitY, w: slitW, h: slitH },
      });
    }
    return {
      play: { x: area.x, y: area.y, w: area.w, h: area.h },
      cellW: cellW,
      cellH: cellH,
      gutterX: gutterX,
      gutterY: gutterY,
      lockers: lockers,
    };
  }

  function slitCenter(locker) {
    return {
      x: locker.slit.x + locker.slit.w / 2,
      y: locker.slit.y + locker.slit.h / 2,
    };
  }

  function circleHitsSlit(beam, locker) {
    if (!beam || !(beam.radius > 0) || !locker) return false;
    var s = locker.slit;
    var cx = clamp(beam.x, s.x, s.x + s.w);
    var cy = clamp(beam.y, s.y, s.y + s.h);
    var dx = cx - beam.x;
    var dy = cy - beam.y;
    return dx * dx + dy * dy <= beam.radius * beam.radius;
  }

  function suggestedBeamRadius(cellW, cellH) {
    var m = Math.max(cellW || 32, cellH || 40);
    return Math.max(36, Math.min(88, m * 1.55 + 6));
  }

  /**
   * 電筒圓心相對指針上移，避免手指遮住正在照嘅櫃。
   */
  function beamFromPointer(px, py, radius) {
    var r = radius > 0 ? radius : 48;
    return { x: px, y: py - r * 0.72, radius: r };
  }

  function createRound(seed) {
    var s = seed == null ? 1 : seed;
    var rng = mulberry32(typeof s === "number" ? s : hashString(String(s)));
    var emptyIds = [];
    var emptyIdsByForm = [];
    var lockers = [];
    var f, i, k;
    for (f = 0; f < FORMS; f++) {
      var localEmpties = shufflePick(rng, EMPTY_PER_FORM, LOCKER_COUNT);
      emptyIdsByForm.push(localEmpties.slice());
      var emptySet = {};
      for (k = 0; k < localEmpties.length; k++) {
        emptySet[localEmpties[k]] = 1;
        emptyIds.push(globalId(f, localEmpties[k]));
      }
      var palette = PALETTES[f];
      for (i = 0; i < LOCKER_COUNT; i++) {
        lockers.push({
          id: globalId(f, i),
          form: f,
          localId: i,
          number: i + 1,
          col: i % COLS,
          row: (i / COLS) | 0,
          color: palette[i],
          hasPhone: !emptySet[i],
        });
      }
    }
    emptyIds.sort(function (a, b) { return a - b; });
    return {
      seed: s,
      emptyIds: emptyIds,
      emptyIdsByForm: emptyIdsByForm,
      lockers: lockers,
    };
  }

  function hashString(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function formLockers(round, form) {
    var f = clamp(form | 0, 0, FORMS - 1);
    var start = f * LOCKER_COUNT;
    return (round && round.lockers ? round.lockers : []).slice(start, start + LOCKER_COUNT);
  }

  function gradeOf(correct, falseFlags) {
    if (correct === EMPTY_COUNT && falseFlags === 0) return "perfect";
    if (falseFlags >= 8 && falseFlags > correct) return "wild";
    if (correct >= 12 && falseFlags <= 2) return "careful";
    if ((correct >= 10 && falseFlags <= 4) || (correct >= 8 && falseFlags <= 2)) return "pass";
    if (correct >= 6 && falseFlags <= 6) return "missed";
    return "practice";
  }

  function scoreSelection(selectedIds, emptyIds) {
    var selected = {};
    var empties = {};
    var i;
    var sid = selectedIds || [];
    var eid = emptyIds || [];
    for (i = 0; i < sid.length; i++) selected[sid[i]] = 1;
    for (i = 0; i < eid.length; i++) empties[eid[i]] = 1;
    var correct = 0;
    var missed = 0;
    var falseFlags = 0;
    var hits = [];
    var misses = [];
    var falses = [];
    for (i = 0; i < eid.length; i++) {
      if (selected[eid[i]]) {
        correct++;
        hits.push(eid[i]);
      } else {
        missed++;
        misses.push(eid[i]);
      }
    }
    for (i = 0; i < sid.length; i++) {
      if (!empties[sid[i]]) {
        falseFlags++;
        falses.push(sid[i]);
      }
    }
    var raw = correct * POINTS_HIT - falseFlags * POINTS_FALSE;
    var score = raw < 0 ? 0 : raw;
    var key = gradeOf(correct, falseFlags);
    return {
      correct: correct,
      falseFlags: falseFlags,
      missed: missed,
      score: score,
      gradeKey: key,
      grade: GRADES[key],
      blurb: BLURBS[key],
      hitIds: hits,
      missIds: misses,
      falseIds: falses,
    };
  }

  function readBest() {
    try {
      var v = parseInt(root.localStorage.getItem(BEST_KEY), 10);
      return isFinite(v) && v > 0 ? v : 0;
    } catch (e) {
      return 0;
    }
  }

  function writeBest(score) {
    var prev = readBest();
    if (score > prev) {
      try {
        root.localStorage.setItem(BEST_KEY, String(score));
      } catch (e) { /* ignore */ }
      return { best: score, updated: true };
    }
    return { best: prev, updated: false };
  }

  function GameEngine(options) {
    options = options || {};
    this.layout = layoutGrid(options.play || { x: 0, y: 0, w: 640, h: 360 });
    this.beam = null;
    this.reset(options.seed);
  }

  GameEngine.prototype.reset = function (seed) {
    if (seed == null) seed = (Date.now() ^ (Math.floor(Math.random() * 0xffffffff))) >>> 0;
    this.round = createRound(seed);
    this.seed = this.round.seed;
    this.form = 0;
    this.phase = "inspect";
    this.time = 0;
    this.phaseTime = 0;
    this.beam = null;
    this.visited = {};
    this.selected = {};
    this.selectedCount = 0;
    this.result = null;
    this.justEntered = "inspect";
    this.visitEvents = [];
    return this;
  };

  GameEngine.prototype.setPlayfield = function (play) {
    this.layout = layoutGrid(play);
    return this.layout;
  };

  GameEngine.prototype.setForm = function (index) {
    var next = clamp(index | 0, 0, FORMS - 1);
    this.form = next;
    return this.form;
  };

  GameEngine.prototype.nextForm = function () {
    return this.setForm(this.form + 1);
  };

  GameEngine.prototype.prevForm = function () {
    return this.setForm(this.form - 1);
  };

  GameEngine.prototype.formLockers = function () {
    return formLockers(this.round, this.form);
  };

  GameEngine.prototype.lockerGeom = function (id) {
    return this.layout.lockers[localOf(id)] || null;
  };

  GameEngine.prototype.setBeam = function (x, y, radius) {
    if (this.phase !== "inspect") {
      this.beam = null;
      return null;
    }
    var r = radius;
    if (!(r > 0)) r = suggestedBeamRadius(this.layout.cellW, this.layout.cellH);
    this.beam = { x: x, y: y, radius: r };
    this._markVisited();
    return this.beam;
  };

  GameEngine.prototype.clearBeam = function () {
    this.beam = null;
  };

  GameEngine.prototype.setBeamFromPointer = function (px, py, radius) {
    var r = radius;
    if (!(r > 0)) r = suggestedBeamRadius(this.layout.cellW, this.layout.cellH);
    var b = beamFromPointer(px, py, r);
    return this.setBeam(b.x, b.y, b.radius);
  };

  GameEngine.prototype._markVisited = function () {
    if (this.phase !== "inspect" || !this.beam) return;
    var geos = this.layout.lockers;
    var base = this.form * LOCKER_COUNT;
    for (var i = 0; i < geos.length; i++) {
      var gid = base + i;
      if (!this.visited[gid] && circleHitsSlit(this.beam, geos[i])) {
        this.visited[gid] = 1;
        this.visitEvents.push(gid);
      }
    }
  };

  GameEngine.prototype.drainVisitEvents = function () {
    var ev = this.visitEvents;
    this.visitEvents = [];
    return ev;
  };

  GameEngine.prototype.isVisited = function (id) {
    return !!this.visited[id];
  };

  GameEngine.prototype.visitedCount = function () {
    var n = 0;
    for (var k in this.visited) {
      if (this.visited[k]) n++;
    }
    return n;
  };

  GameEngine.prototype.isSelected = function (id) {
    return !!this.selected[id];
  };

  GameEngine.prototype.reveal = function (id) {
    if (this.phase !== "inspect") return null;
    if (id < 0 || id >= TOTAL_LOCKERS) return null;
    if (formOf(id) !== this.form) return null;
    var geo = this.layout.lockers[localOf(id)];
    if (!circleHitsSlit(this.beam, geo)) return null;
    var locker = this.round.lockers[id];
    return { hasPhone: !!locker.hasPhone, number: locker.number, form: locker.form };
  };

  GameEngine.prototype.hitTest = function (x, y) {
    var geos = this.layout.lockers;
    for (var i = 0; i < geos.length; i++) {
      var g = geos[i];
      if (x >= g.x && x <= g.x + g.w && y >= g.y && y <= g.y + g.h) {
        return this.form * LOCKER_COUNT + i;
      }
    }
    return -1;
  };

  GameEngine.prototype.toggleSelect = function (id) {
    if (this.phase !== "select") return false;
    if (id < 0 || id >= TOTAL_LOCKERS) return false;
    if (this.selected[id]) {
      delete this.selected[id];
      this.selectedCount--;
    } else {
      this.selected[id] = 1;
      this.selectedCount++;
    }
    return true;
  };

  GameEngine.prototype.selectedIds = function () {
    var out = [];
    for (var k in this.selected) {
      if (this.selected[k]) out.push(+k);
    }
    out.sort(function (a, b) { return a - b; });
    return out;
  };

  GameEngine.prototype.phaseLimit = function () {
    if (this.phase === "inspect") return PHASE1_SECONDS;
    if (this.phase === "select") return PHASE2_SECONDS;
    return 0;
  };

  GameEngine.prototype.remaining = function () {
    var lim = this.phaseLimit();
    var left = lim - this.phaseTime;
    return left < 0 ? 0 : left;
  };

  GameEngine.prototype.enterSelect = function () {
    this.phase = "select";
    this.phaseTime = 0;
    this.beam = null;
    this.visited = {};
    this.justEntered = "select";
  };

  GameEngine.prototype.enterResult = function () {
    this.phase = "result";
    this.phaseTime = 0;
    this.beam = null;
    this.result = scoreSelection(this.selectedIds(), this.round.emptyIds);
    var rec = writeBest(this.result.score);
    this.result.best = rec.best;
    this.result.bestUpdated = rec.updated;
    this.justEntered = "result";
  };

  GameEngine.prototype.step = function (dt) {
    if (this.phase !== "inspect" && this.phase !== "select") return this.phase;
    if (!(dt > 0)) dt = 0;
    this.time += dt;
    this.phaseTime += dt;
    if (this.phase === "inspect") this._markVisited();
    var lim = this.phaseLimit();
    if (this.phaseTime >= lim) {
      // 用剩餘誤差遞進，避免一次 step 太大跨過兩段
      var overflow = this.phaseTime - lim;
      if (this.phase === "inspect") {
        this.enterSelect();
        if (overflow > 0) this.step(overflow);
      } else {
        this.enterResult();
      }
    }
    return this.phase;
  };

  return {
    TITLE: TITLE,
    FORMS: FORMS,
    FORM_NAMES: FORM_NAMES,
    COLS: COLS,
    ROWS: ROWS,
    LOCKER_COUNT: LOCKER_COUNT,
    TOTAL_LOCKERS: TOTAL_LOCKERS,
    EMPTY_PER_FORM: EMPTY_PER_FORM,
    EMPTY_COUNT: EMPTY_COUNT,
    PHASE1_SECONDS: PHASE1_SECONDS,
    PHASE2_SECONDS: PHASE2_SECONDS,
    POINTS_HIT: POINTS_HIT,
    POINTS_FALSE: POINTS_FALSE,
    BEST_KEY: BEST_KEY,
    GRADES: GRADES,
    BLURBS: BLURBS,
    PALETTE: PALETTE,
    PALETTES: PALETTES,
    clamp: clamp,
    formOf: formOf,
    localOf: localOf,
    globalId: globalId,
    lockerLabel: lockerLabel,
    mulberry32: mulberry32,
    hslToHex: hslToHex,
    buildPalette: buildPalette,
    buildPalettes: buildPalettes,
    layoutGrid: layoutGrid,
    slitCenter: slitCenter,
    circleHitsSlit: circleHitsSlit,
    suggestedBeamRadius: suggestedBeamRadius,
    beamFromPointer: beamFromPointer,
    createRound: createRound,
    formLockers: formLockers,
    gradeOf: gradeOf,
    scoreSelection: scoreSelection,
    readBest: readBest,
    writeBest: writeBest,
    GameEngine: GameEngine,
  };
});
