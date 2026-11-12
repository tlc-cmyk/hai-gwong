/**
 * 今日訓導檢查手機櫃 — 無介面引擎測試（無需瀏覽器、無需 Web Audio）。
 */
import { createRequire } from "node:module";
import assert from "node:assert/strict";

const require = createRequire(import.meta.url);
const E = require("./engine.js");

let passed = 0;

function test(name, fn) {
  fn();
  passed++;
  console.log("ok  " + name);
}

test("title is 蘇SIR：今日訓導檢查手機櫃", () => {
  assert.equal(E.TITLE, "蘇SIR：今日訓導檢查手機櫃");
});

test("six forms of 10×16 = 160 lockers each", () => {
  assert.equal(E.FORMS, 6);
  assert.deepEqual(E.FORM_NAMES, ["中一", "中二", "中三", "中四", "中五", "中六"]);
  assert.equal(E.COLS, 10);
  assert.equal(E.ROWS, 16);
  assert.equal(E.LOCKER_COUNT, 160);
  assert.equal(E.TOTAL_LOCKERS, 960);
  assert.equal(E.EMPTY_COUNT, 60);
});

test("each round has 60 empty lockers randomly spread across forms, no overlap", () => {
  let sawUneven = false;
  for (const seed of [1, 2, 7, 99, 20261111, 3, 8, 15, 42, 2026]) {
    const round = E.createRound(seed);
    assert.equal(round.lockers.length, 960);
    assert.equal(round.emptyIds.length, 60);
    assert.equal(new Set(round.emptyIds).size, 60, "duplicate empty ids");
    assert.equal(round.emptyIdsByForm.length, 6);
    let phones = 0;
    let empties = 0;
    const emptySet = new Set(round.emptyIds);
    const counts = [];
    for (let f = 0; f < 6; f++) {
      const local = round.emptyIdsByForm[f];
      assert.ok(local.length >= 1, "form " + f + " should have at least one empty");
      assert.equal(new Set(local).size, local.length);
      counts.push(local.length);
      for (const loc of local) {
        assert.ok(loc >= 0 && loc < 160);
        assert.ok(emptySet.has(E.globalId(f, loc)));
      }
    }
    assert.equal(counts.reduce((a, b) => a + b, 0), 60);
    if (counts.some((n) => n !== counts[0])) sawUneven = true;
    for (const locker of round.lockers) {
      if (locker.hasPhone) phones++;
      else empties++;
      if (emptySet.has(locker.id)) assert.equal(locker.hasPhone, false);
      else assert.equal(locker.hasPhone, true);
    }
    assert.equal(phones, 900);
    assert.equal(empties, 60);
  }
  assert.equal(sawUneven, true, "empty lockers should not be a fixed count per form");
});

test("empty locker positions change with the seed and stay stable for the same seed", () => {
  const a = E.createRound(11).emptyIds.join(",");
  const b = E.createRound(12).emptyIds.join(",");
  const c = E.createRound(11).emptyIds.join(",");
  assert.equal(a, c);
  assert.notEqual(a, b);
});

test("locker colours are unique within each form wall", () => {
  assert.equal(E.PALETTES.length, 6);
  for (let f = 0; f < 6; f++) {
    const palette = E.PALETTES[f];
    assert.equal(palette.length, 160);
    const set = new Set(palette);
    assert.equal(set.size, 160, "duplicate hex in form " + f);
    for (const hex of palette) {
      assert.match(hex, /^#[0-9a-f]{6}$/);
    }
    const rebuilt = E.buildPalette(f);
    assert.equal(new Set(rebuilt).size, 160);
  }
});

test("phase durations are 60s then 20s and are shared across pages", () => {
  assert.equal(E.PHASE1_SECONDS, 60);
  assert.equal(E.PHASE2_SECONDS, 20);
  const eng = new E.GameEngine({ seed: 3, play: { x: 0, y: 0, w: 640, h: 360 } });
  assert.equal(eng.phase, "inspect");
  assert.equal(eng.phaseLimit(), 60);
  assert.equal(eng.form, 0);
  eng.step(20);
  assert.equal(eng.phase, "inspect");
  eng.setForm(2);
  assert.equal(eng.form, 2);
  assert.equal(eng.phase, "inspect");
  assert.ok(eng.remaining() > 39.9 && eng.remaining() < 40.1);
  eng.step(39.5);
  assert.equal(eng.phase, "inspect");
  assert.ok(eng.remaining() > 0.4 && eng.remaining() < 0.6);
  eng.setForm(3);
  eng.step(0.5);
  assert.equal(eng.phase, "select");
  assert.equal(eng.form, 3, "form is kept when entering select");
  assert.equal(eng.phaseLimit(), 20);
  assert.ok(eng.remaining() <= 20 && eng.remaining() > 19.4);
  eng.setForm(0);
  eng.step(19.9);
  assert.equal(eng.phase, "select");
  eng.step(0.2);
  assert.equal(eng.phase, "result");
});

test("timeline progress covers 60s inspect then 20s select in one 80s line", () => {
  const eng = new E.GameEngine({ seed: 3, play: { x: 0, y: 0, w: 640, h: 360 } });
  assert.equal(eng.roundDuration(), 80);
  assert.equal(eng.roundElapsed(), 0);
  assert.equal(eng.timelineProgress(), 0);
  eng.step(30);
  assert.equal(eng.phase, "inspect");
  assert.ok(Math.abs(eng.roundElapsed() - 30) < 1e-9);
  assert.ok(Math.abs(eng.timelineProgress() - 30 / 80) < 1e-9);
  eng.step(30);
  assert.equal(eng.phase, "select");
  assert.ok(Math.abs(eng.roundElapsed() - 60) < 1e-6);
  assert.ok(Math.abs(eng.timelineProgress() - 0.75) < 1e-6);
  eng.step(10);
  assert.equal(eng.phase, "select");
  assert.ok(Math.abs(eng.roundElapsed() - 70) < 1e-6);
  assert.ok(Math.abs(eng.timelineProgress() - 70 / 80) < 1e-6);
  eng.setForm(4);
  assert.equal(eng.form, 4);
  assert.ok(Math.abs(eng.timelineProgress() - 70 / 80) < 1e-6, "changing page does not reset the timeline");
  eng.step(10);
  assert.equal(eng.phase, "result");
  assert.equal(eng.roundElapsed(), 80);
  assert.equal(eng.timelineProgress(), 1);
});

test("swiping pages does not reset timers or reshuffle lockers mid-round", () => {
  const eng = new E.GameEngine({ seed: 77, play: { x: 0, y: 0, w: 640, h: 360 } });
  const empties = eng.round.emptyIds.slice();
  const seed = eng.seed;
  eng.step(8.25);
  const time = eng.time;
  const phaseTime = eng.phaseTime;
  eng.setForm(1);
  eng.nextForm();
  eng.prevForm();
  eng.setForm(3);
  eng.setForm(0);
  assert.equal(eng.seed, seed);
  assert.deepEqual(eng.round.emptyIds, empties);
  assert.equal(eng.phase, "inspect");
  assert.ok(Math.abs(eng.time - time) < 1e-9);
  assert.ok(Math.abs(eng.phaseTime - phaseTime) < 1e-9);
  // Visiting a locker on form 0, then swiping away and back, keeps the visit
  const gid = empties.find((id) => E.formOf(id) === 0);
  const c = E.slitCenter(eng.lockerGeom(gid));
  eng.setBeam(c.x, c.y, 30);
  assert.equal(eng.isVisited(gid), true);
  eng.setForm(2);
  assert.equal(eng.isVisited(gid), true, "visits persist across pages");
  assert.equal(eng.reveal(gid), null, "cannot peek a locker on another page");
  eng.setForm(0);
  assert.equal(eng.isVisited(gid), true);
});

test("peeking reveals correctly only in phase 1 when the beam covers the locker on the current form", () => {
  const eng = new E.GameEngine({ seed: 42, play: { x: 0, y: 0, w: 640, h: 360 } });
  const emptyId = eng.round.emptyIds[0];
  eng.setForm(E.formOf(emptyId));
  const phoneId = eng.round.lockers.find((l) => l.hasPhone && l.form === eng.form).id;
  const emptyGeo = eng.lockerGeom(emptyId);
  const phoneGeo = eng.lockerGeom(phoneId);
  const emptyC = E.slitCenter(emptyGeo);
  const phoneC = E.slitCenter(phoneGeo);

  assert.equal(eng.reveal(emptyId), null, "no beam, no peek");

  eng.setBeam(emptyC.x, emptyC.y, 24);
  const peekedEmpty = eng.reveal(emptyId);
  assert.ok(peekedEmpty);
  assert.equal(peekedEmpty.hasPhone, false);

  // Far away beam should not reveal a different locker
  assert.equal(eng.reveal(phoneId), null);

  eng.setBeam(phoneC.x, phoneC.y, 24);
  const peekedPhone = eng.reveal(phoneId);
  assert.ok(peekedPhone);
  assert.equal(peekedPhone.hasPhone, true);

  // Small beam slightly off the slit should not reveal
  eng.setBeam(phoneC.x + 80, phoneC.y + 80, 10);
  assert.equal(eng.reveal(phoneId), null);

  // A locker on another form sharing the same cell geometry cannot be peeked
  const otherForm = (eng.form + 1) % 4;
  const otherId = E.globalId(otherForm, E.localOf(emptyId));
  eng.setBeam(emptyC.x, emptyC.y, 40);
  assert.equal(eng.reveal(otherId), null);
});

test("phase 2 cannot reveal contents even with a beam set", () => {
  const eng = new E.GameEngine({ seed: 8, play: { x: 0, y: 0, w: 640, h: 360 } });
  const id = eng.round.emptyIds[3];
  eng.setForm(E.formOf(id));
  const c = E.slitCenter(eng.lockerGeom(id));
  eng.setBeam(c.x, c.y, 30);
  assert.equal(eng.reveal(id).hasPhone, false);

  eng.step(60);
  assert.equal(eng.phase, "select");
  // Force a beam object as a hostile/stale pointer
  eng.beam = { x: c.x, y: c.y, radius: 80 };
  assert.equal(eng.reveal(id), null);
  assert.equal(eng.setBeam(c.x, c.y, 80), null);
  assert.equal(eng.beam, null);
  assert.equal(eng.reveal(id), null);
});

test("visited ticks do not reveal contents and clear when phase 2 starts", () => {
  const eng = new E.GameEngine({ seed: 5, play: { x: 0, y: 0, w: 640, h: 360 } });
  const id = eng.round.emptyIds[1];
  eng.setForm(E.formOf(id));
  const c = E.slitCenter(eng.lockerGeom(id));
  eng.setBeam(c.x, c.y, 28);
  assert.equal(eng.isVisited(id), true);
  const farLocal = E.localOf(id) === 0 ? 159 : 0;
  const far = E.globalId(eng.form, farLocal);
  const farC = E.slitCenter(eng.lockerGeom(far));
  const dx = farC.x - c.x;
  const dy = farC.y - c.y;
  if (dx * dx + dy * dy > 40 * 40) {
    assert.equal(eng.isVisited(far), false);
  }
  eng.step(60);
  assert.equal(eng.phase, "select");
  assert.equal(eng.isVisited(id), false);
});

test("cannot toggle in phase 1; toggle and untap work in phase 2 across forms", () => {
  const eng = new E.GameEngine({ seed: 9, play: { x: 0, y: 0, w: 640, h: 360 } });
  assert.equal(eng.toggleSelect(0), false);
  eng.step(60);
  assert.equal(eng.toggleSelect(0), true);
  assert.equal(eng.isSelected(0), true);
  assert.equal(eng.toggleSelect(0), true);
  assert.equal(eng.isSelected(0), false);
  const a = E.globalId(0, 3);
  const b = E.globalId(2, 7);
  eng.setForm(0);
  eng.toggleSelect(a);
  eng.setForm(2);
  eng.toggleSelect(b);
  assert.deepEqual(eng.selectedIds(), [a, b].sort((x, y) => x - y));
});

test("scoring: perfect flags of all 60 with no extras is the top grade", () => {
  const empties = Array.from({ length: 60 }, (_, i) => i);
  const result = E.scoreSelection(empties, empties);
  assert.equal(result.correct, 60);
  assert.equal(result.falseFlags, 0);
  assert.equal(result.missed, 0);
  assert.equal(result.score, 6000);
  assert.equal(result.grade, "火眼金睛");
  assert.equal(E.gradeOf(60, 0), "perfect");
});

test("scoring: flagging none is 0 and the lowest grade", () => {
  const empties = Array.from({ length: 60 }, (_, i) => i);
  const result = E.scoreSelection([], empties);
  assert.equal(result.correct, 0);
  assert.equal(result.falseFlags, 0);
  assert.equal(result.missed, 60);
  assert.equal(result.score, 0);
  assert.equal(result.grade, "要再練");
  assert.equal(E.gradeOf(0, 0), "practice");
});

test("scoring: false flags are counted and penalised", () => {
  const empties = Array.from({ length: 60 }, (_, i) => i);
  // 45 hits, 15 misses, 2 false
  const result = E.scoreSelection(
    Array.from({ length: 45 }, (_, i) => i).concat([200, 201]),
    empties
  );
  assert.equal(result.correct, 45);
  assert.equal(result.falseFlags, 2);
  assert.equal(result.missed, 15);
  assert.equal(result.score, 45 * 100 - 2 * 25);
  assert.equal(result.grade, "細心值日");
  assert.deepEqual(result.falseIds, [200, 201]);
  assert.deepEqual(result.missIds, Array.from({ length: 15 }, (_, i) => i + 45));
});

test("grade bands cover careful, pass, missed and wild for the 60-empty totals", () => {
  assert.equal(E.GRADES[E.gradeOf(59, 0)], "細心值日");
  assert.equal(E.GRADES[E.gradeOf(45, 2)], "細心值日");
  assert.equal(E.GRADES[E.gradeOf(60, 2)], "細心值日");
  assert.equal(E.GRADES[E.gradeOf(60, 1)], "細心值日");
  assert.equal(E.GRADES[E.gradeOf(38, 4)], "合格");
  assert.equal(E.GRADES[E.gradeOf(30, 0)], "合格");
  assert.equal(E.GRADES[E.gradeOf(30, 2)], "合格");
  assert.equal(E.GRADES[E.gradeOf(40, 3)], "合格");
  assert.equal(E.GRADES[E.gradeOf(23, 1)], "漏咗幾格");
  assert.equal(E.GRADES[E.gradeOf(25, 6)], "漏咗幾格");
  assert.equal(E.GRADES[E.gradeOf(2, 31)], "亂點");
  assert.equal(E.GRADES[E.gradeOf(0, 60)], "亂點");
  assert.equal(E.GRADES[E.gradeOf(22, 0)], "要再練");
  assert.equal(E.GRADES[E.gradeOf(10, 2)], "要再練");
});

test("scan-and-memory bot that inspects all empties on all forms then flags them scores top", () => {
  const eng = new E.GameEngine({ seed: 2026, play: { x: 10, y: 20, w: 640, h: 360 } });
  const radius = E.suggestedBeamRadius(eng.layout.cellW, eng.layout.cellH);
  const empties = eng.round.emptyIds.slice();
  assert.equal(empties.length, 60);
  const perForm = [0, 0, 0, 0, 0, 0];
  for (const id of empties) perForm[E.formOf(id)]++;
  assert.equal(perForm.reduce((a, b) => a + b, 0), 60);
  assert.ok(perForm.every((n) => n >= 1), "bot seed should still spread empties across forms");

  // Sweep every empty locker on every form with the torch and confirm the peek.
  for (const id of empties) {
    eng.setForm(E.formOf(id));
    const c = E.slitCenter(eng.lockerGeom(id));
    eng.setBeam(c.x, c.y, radius);
    const seen = eng.reveal(id);
    assert.ok(seen, "bot should peek empty locker " + E.lockerLabel(id));
    assert.equal(seen.hasPhone, false);
    eng.step(0.2);
  }
  // Also confirm a phone locker peeks as having a phone
  const phone = eng.round.lockers.find((l) => l.hasPhone);
  eng.setForm(phone.form);
  const pc = E.slitCenter(eng.lockerGeom(phone.id));
  eng.setBeam(pc.x, pc.y, radius);
  assert.equal(eng.reveal(phone.id).hasPhone, true);

  eng.step(eng.remaining() + 0.01);
  assert.equal(eng.phase, "select");
  // Memory: flag exactly the empties inspected earlier, switching pages as needed
  for (const id of empties) {
    eng.setForm(E.formOf(id));
    const ok = eng.toggleSelect(id);
    assert.equal(ok, true);
  }
  // Contents must stay hidden in the tap window
  for (const id of empties) {
    eng.setForm(E.formOf(id));
    assert.equal(eng.reveal(id), null);
  }

  eng.step(E.PHASE2_SECONDS + 0.01);
  assert.equal(eng.phase, "result");
  assert.equal(eng.result.correct, 60);
  assert.equal(eng.result.falseFlags, 0);
  assert.equal(eng.result.missed, 0);
  assert.equal(eng.result.score, 6000);
  assert.equal(eng.result.grade, "火眼金睛");
});

test("hit-testing finds the locker under a point on the current form", () => {
  const eng = new E.GameEngine({ seed: 1, play: { x: 0, y: 0, w: 640, h: 360 } });
  const g = eng.lockerGeom(37);
  assert.equal(eng.hitTest(g.x + g.w / 2, g.y + g.h / 2), 37);
  eng.setForm(3);
  assert.equal(eng.hitTest(g.x + g.w / 2, g.y + g.h / 2), E.globalId(3, 37));
  assert.equal(eng.hitTest(-10, -10), -1);
});

test("lockerCode and lockerLabel follow 1A01–6D40 from the top", () => {
  // First and last of each letter group on 中一
  assert.equal(E.lockerCode(0, 0), "1A01");
  assert.equal(E.lockerCode(0, 9), "1A10");
  assert.equal(E.lockerCode(0, 10), "1A11");
  assert.equal(E.lockerCode(0, 39), "1A40");
  assert.equal(E.lockerCode(0, 40), "1B01");
  assert.equal(E.lockerCode(0, 79), "1B40");
  assert.equal(E.lockerCode(0, 80), "1C01");
  assert.equal(E.lockerCode(0, 119), "1C40");
  assert.equal(E.lockerCode(0, 120), "1D01");
  assert.equal(E.lockerCode(0, 159), "1D40");
  // Same pattern on the other forms
  assert.equal(E.lockerCode(1, 0), "2A01");
  assert.equal(E.lockerCode(1, 159), "2D40");
  assert.equal(E.lockerCode(2, 0), "3A01");
  assert.equal(E.lockerCode(2, 159), "3D40");
  assert.equal(E.lockerCode(3, 0), "4A01");
  assert.equal(E.lockerCode(3, 159), "4D40");
  assert.equal(E.lockerCode(4, 0), "5A01");
  assert.equal(E.lockerCode(4, 159), "5D40");
  assert.equal(E.lockerCode(5, 0), "6A01");
  assert.equal(E.lockerCode(5, 159), "6D40");
  assert.equal(E.lockerCode(1, 56), "2B17");
  assert.equal(E.lockerCode(2, 96), "3C17");
  assert.equal(E.lockerCode(4, 56), "5B17");
  assert.equal(E.lockerCode(5, 96), "6C17");

  // lockerLabel(formIndex, lockerIndex)
  assert.equal(E.lockerLabel(0, 0), "中一 1A01");
  assert.equal(E.lockerLabel(1, 56), "中二 2B17");
  assert.equal(E.lockerLabel(2, 80), "中三 3C01");
  assert.equal(E.lockerLabel(3, 159), "中四 4D40");
  assert.equal(E.lockerLabel(4, 0), "中五 5A01");
  assert.equal(E.lockerLabel(5, 159), "中六 6D40");

  // lockerLabel(globalId) still works for result lists
  assert.equal(E.lockerLabel(0), "中一 1A01");
  assert.equal(E.lockerLabel(E.globalId(1, 56)), "中二 2B17");
  assert.equal(E.lockerLabel(E.globalId(3, 0)), "中四 4A01");
  assert.equal(E.lockerLabel(E.globalId(5, 0)), "中六 6A01");
});

test("best-score key is v5 so old 24-empty scores are not reused", () => {
  assert.equal(E.BEST_KEY, "hai-gwong-best-v5");
});

test("beamFromPointer offsets the light above the finger", () => {
  const beam = E.beamFromPointer(100, 200, 50);
  assert.equal(beam.x, 100);
  assert.ok(beam.y < 200, "beam should sit above the pointer");
  assert.equal(beam.radius, 50);
  assert.ok(Math.abs(beam.y - (200 - 50 * 0.72)) < 1e-9);
});

test("player name must be a class 1A–6D and a number 1–40", () => {
  assert.equal(E.PLAYER_NAME_MAX, 12);
  assert.equal(E.PLAYER_NAME_KEY, "hai-gwong-player-name");
  assert.equal(E.CLASS_CODES.length, 24);
  assert.equal(E.CLASS_CODES[0], "1A");
  assert.equal(E.CLASS_CODES[23], "6D");
  assert.equal(E.formatPlayerName("1A", 1), "1A01");
  assert.equal(E.formatPlayerName("6d", 40), "6D40");
  assert.equal(E.formatPlayerName("1E", 1), "");
  assert.equal(E.formatPlayerName("1A", 0), "");
  assert.equal(E.formatPlayerName("1A", 41), "");
  assert.equal(E.normalizePlayerName("  1a7  "), "1A07");
  assert.equal(E.normalizePlayerName("6D40"), "6D40");
  assert.equal(E.normalizePlayerName("   "), "");
  assert.equal(E.normalizePlayerName(null), "");
  assert.equal(E.normalizePlayerName(undefined), "");
  assert.equal(E.normalizePlayerName("小明"), "小明");
  assert.equal(E.isValidPlayerName(""), false);
  assert.equal(E.isValidPlayerName("   "), false);
  assert.equal(E.isValidPlayerName("小明"), false);
  assert.equal(E.isValidPlayerName("A"), false);
  assert.equal(E.isValidPlayerName("1A"), false);
  assert.equal(E.isValidPlayerName("1A00"), false);
  assert.equal(E.isValidPlayerName("1A01"), true);
  assert.equal(E.isValidPlayerName("1a1"), true);
  assert.equal(E.isValidPlayerName("  1A40  "), true);
  assert.equal(E.isValidPlayerName("1A41"), false);
  assert.equal(E.isValidPlayerName("7A01"), false);
  assert.equal(E.isValidPlayerName("1E01"), false);
  assert.deepEqual(E.parsePlayerName("2C09"), { classCode: "2C", number: 9 });
  assert.equal(E.parsePlayerName("值班同學"), null);
});

test("rankScores orders by score desc then earlier created_at and keeps top 20", () => {
  const rows = [
    { player_name: "晚到", score: 6000, created_at: "2026-11-12T03:00:00.000Z" },
    { player_name: "早到", score: 6000, created_at: "2026-11-12T01:00:00.000Z" },
    { player_name: "中游", score: 800, created_at: "2026-11-12T02:00:00.000Z" },
    { player_name: "低分甲", score: 100, created_at: "2026-11-12T04:00:00.000Z" },
    { player_name: "低分乙", score: 100, created_at: "2026-11-12T03:30:00.000Z" },
  ];
  for (let i = 0; i < 22; i++) {
    const mm = i < 10 ? "0" + i : String(i);
    rows.push({ player_name: "第" + (i + 6), score: 50 - i, created_at: "2026-11-12T06:" + mm + ":00.000Z" });
  }
  assert.equal(rows.length, 27);
  assert.equal(E.LEADERBOARD_LIMIT, 20);
  const ranked = E.rankScores(rows);
  assert.equal(ranked.length, 20);
  assert.equal(ranked[0].rank, 1);
  assert.equal(ranked[0].player_name, "早到");
  assert.equal(ranked[1].player_name, "晚到");
  assert.equal(ranked[2].player_name, "中游");
  assert.equal(ranked[3].player_name, "低分乙");
  assert.equal(ranked[4].player_name, "低分甲");
  assert.equal(ranked[19].rank, 20);
  assert.equal(ranked[19].score, 36);
  assert.equal(E.isSameScoreRow(ranked[0], {
    player_name: "早到",
    score: 6000,
    created_at: "2026-11-12T01:00:00.000Z",
  }), true);
  assert.equal(E.isSameScoreRow(ranked[0], ranked[1]), false);
  assert.deepEqual(E.rankScores([], 20), []);
});

console.log("\n" + passed + " tests passed");

