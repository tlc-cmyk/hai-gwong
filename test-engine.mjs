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

test("title is 今日訓導檢查手機櫃", () => {
  assert.equal(E.TITLE, "今日訓導檢查手機櫃");
});

test("four forms of 10×12 = 120 lockers each", () => {
  assert.equal(E.FORMS, 4);
  assert.deepEqual(E.FORM_NAMES, ["中一", "中二", "中三", "中四"]);
  assert.equal(E.COLS, 10);
  assert.equal(E.ROWS, 12);
  assert.equal(E.LOCKER_COUNT, 120);
  assert.equal(E.TOTAL_LOCKERS, 480);
  assert.equal(E.EMPTY_PER_FORM, 4);
  assert.equal(E.EMPTY_COUNT, 16);
});

test("each round has 4 empty lockers per form, 16 total, no overlap", () => {
  for (const seed of [1, 2, 7, 99, 20261111]) {
    const round = E.createRound(seed);
    assert.equal(round.lockers.length, 480);
    assert.equal(round.emptyIds.length, 16);
    assert.equal(new Set(round.emptyIds).size, 16, "duplicate empty ids");
    assert.equal(round.emptyIdsByForm.length, 4);
    let phones = 0;
    let empties = 0;
    const emptySet = new Set(round.emptyIds);
    for (let f = 0; f < 4; f++) {
      const local = round.emptyIdsByForm[f];
      assert.equal(local.length, 4, "form " + f + " empty count");
      assert.equal(new Set(local).size, 4);
      for (const loc of local) {
        assert.ok(loc >= 0 && loc < 120);
        assert.ok(emptySet.has(E.globalId(f, loc)));
      }
    }
    for (const locker of round.lockers) {
      if (locker.hasPhone) phones++;
      else empties++;
      if (emptySet.has(locker.id)) assert.equal(locker.hasPhone, false);
      else assert.equal(locker.hasPhone, true);
    }
    assert.equal(phones, 464);
    assert.equal(empties, 16);
  }
});

test("empty locker positions change with the seed and stay stable for the same seed", () => {
  const a = E.createRound(11).emptyIds.join(",");
  const b = E.createRound(12).emptyIds.join(",");
  const c = E.createRound(11).emptyIds.join(",");
  assert.equal(a, c);
  assert.notEqual(a, b);
});

test("locker colours are unique within each form wall", () => {
  assert.equal(E.PALETTES.length, 4);
  for (let f = 0; f < 4; f++) {
    const palette = E.PALETTES[f];
    assert.equal(palette.length, 120);
    const set = new Set(palette);
    assert.equal(set.size, 120, "duplicate hex in form " + f);
    for (const hex of palette) {
      assert.match(hex, /^#[0-9a-f]{6}$/);
    }
    const rebuilt = E.buildPalette(f);
    assert.equal(new Set(rebuilt).size, 120);
  }
});

test("phase durations are 45s then 15s and are shared across pages", () => {
  assert.equal(E.PHASE1_SECONDS, 45);
  assert.equal(E.PHASE2_SECONDS, 15);
  const eng = new E.GameEngine({ seed: 3, play: { x: 0, y: 0, w: 640, h: 360 } });
  assert.equal(eng.phase, "inspect");
  assert.equal(eng.phaseLimit(), 45);
  assert.equal(eng.form, 0);
  eng.step(20);
  assert.equal(eng.phase, "inspect");
  eng.setForm(2);
  assert.equal(eng.form, 2);
  assert.equal(eng.phase, "inspect");
  assert.ok(eng.remaining() > 24.9 && eng.remaining() < 25.1);
  eng.step(24.5);
  assert.equal(eng.phase, "inspect");
  assert.ok(eng.remaining() > 0.4 && eng.remaining() < 0.6);
  eng.setForm(3);
  eng.step(0.5);
  assert.equal(eng.phase, "select");
  assert.equal(eng.form, 3, "form is kept when entering select");
  assert.equal(eng.phaseLimit(), 15);
  assert.ok(eng.remaining() <= 15 && eng.remaining() > 14.4);
  eng.setForm(0);
  eng.step(14.9);
  assert.equal(eng.phase, "select");
  eng.step(0.2);
  assert.equal(eng.phase, "result");
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

  eng.step(45);
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
  const farLocal = E.localOf(id) === 0 ? 119 : 0;
  const far = E.globalId(eng.form, farLocal);
  const farC = E.slitCenter(eng.lockerGeom(far));
  const dx = farC.x - c.x;
  const dy = farC.y - c.y;
  if (dx * dx + dy * dy > 40 * 40) {
    assert.equal(eng.isVisited(far), false);
  }
  eng.step(45);
  assert.equal(eng.phase, "select");
  assert.equal(eng.isVisited(id), false);
});

test("cannot toggle in phase 1; toggle and untap work in phase 2 across forms", () => {
  const eng = new E.GameEngine({ seed: 9, play: { x: 0, y: 0, w: 640, h: 360 } });
  assert.equal(eng.toggleSelect(0), false);
  eng.step(45);
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

test("scoring: perfect flags of all 16 with no extras is the top grade", () => {
  const empties = [2, 15, 28, 40, 121, 133, 150, 170, 241, 260, 280, 300, 361, 380, 400, 470];
  const result = E.scoreSelection(empties, empties);
  assert.equal(result.correct, 16);
  assert.equal(result.falseFlags, 0);
  assert.equal(result.missed, 0);
  assert.equal(result.score, 1600);
  assert.equal(result.grade, "火眼金睛");
  assert.equal(E.gradeOf(16, 0), "perfect");
});

test("scoring: flagging none is 0 and the lowest grade", () => {
  const empties = [1, 2, 3, 4, 121, 122, 123, 124, 241, 242, 243, 244, 361, 362, 363, 364];
  const result = E.scoreSelection([], empties);
  assert.equal(result.correct, 0);
  assert.equal(result.falseFlags, 0);
  assert.equal(result.missed, 16);
  assert.equal(result.score, 0);
  assert.equal(result.grade, "要再練");
  assert.equal(E.gradeOf(0, 0), "practice");
});

test("scoring: false flags are counted and penalised", () => {
  const empties = [1, 2, 3, 4, 121, 122, 123, 124, 241, 242, 243, 244, 361, 362, 363, 364];
  // 12 hits, 4 misses, 2 false
  const result = E.scoreSelection(
    [1, 2, 3, 4, 121, 122, 123, 124, 241, 242, 243, 244, 50, 200],
    empties
  );
  assert.equal(result.correct, 12);
  assert.equal(result.falseFlags, 2);
  assert.equal(result.missed, 4);
  assert.equal(result.score, 12 * 100 - 2 * 25);
  assert.equal(result.grade, "細心值日");
  assert.deepEqual(result.falseIds, [50, 200]);
  assert.deepEqual(result.missIds, [361, 362, 363, 364]);
});

test("grade bands cover careful, pass, missed and wild for the 16-empty totals", () => {
  assert.equal(E.GRADES[E.gradeOf(15, 0)], "細心值日");
  assert.equal(E.GRADES[E.gradeOf(12, 2)], "細心值日");
  assert.equal(E.GRADES[E.gradeOf(16, 2)], "細心值日");
  assert.equal(E.GRADES[E.gradeOf(16, 1)], "細心值日");
  assert.equal(E.GRADES[E.gradeOf(10, 4)], "合格");
  assert.equal(E.GRADES[E.gradeOf(8, 0)], "合格");
  assert.equal(E.GRADES[E.gradeOf(8, 2)], "合格");
  assert.equal(E.GRADES[E.gradeOf(11, 3)], "合格");
  assert.equal(E.GRADES[E.gradeOf(6, 1)], "漏咗幾格");
  assert.equal(E.GRADES[E.gradeOf(7, 6)], "漏咗幾格");
  assert.equal(E.GRADES[E.gradeOf(2, 9)], "亂點");
  assert.equal(E.GRADES[E.gradeOf(0, 16)], "亂點");
  assert.equal(E.GRADES[E.gradeOf(5, 0)], "要再練");
  assert.equal(E.GRADES[E.gradeOf(4, 2)], "要再練");
});

test("scan-and-memory bot that inspects all empties on all forms then flags them scores top", () => {
  const eng = new E.GameEngine({ seed: 2026, play: { x: 10, y: 20, w: 640, h: 360 } });
  const radius = E.suggestedBeamRadius(eng.layout.cellW, eng.layout.cellH);
  const empties = eng.round.emptyIds.slice();
  assert.equal(empties.length, 16);
  const perForm = [0, 0, 0, 0];
  for (const id of empties) perForm[E.formOf(id)]++;
  assert.deepEqual(perForm, [4, 4, 4, 4]);

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
  assert.equal(eng.result.correct, 16);
  assert.equal(eng.result.falseFlags, 0);
  assert.equal(eng.result.missed, 0);
  assert.equal(eng.result.score, 1600);
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

test("lockerLabel names the form and number", () => {
  assert.equal(E.lockerLabel(16), "中一 第 17 格");
  assert.equal(E.lockerLabel(E.globalId(1, 16)), "中二 第 17 格");
  assert.equal(E.lockerLabel(E.globalId(3, 0)), "中四 第 1 格");
});

test("best-score key is v2 so old 8-empty scores are not reused", () => {
  assert.equal(E.BEST_KEY, "hai-gwong-best-v2");
});

test("beamFromPointer offsets the light above the finger", () => {
  const beam = E.beamFromPointer(100, 200, 50);
  assert.equal(beam.x, 100);
  assert.ok(beam.y < 200, "beam should sit above the pointer");
  assert.equal(beam.radius, 50);
  assert.ok(Math.abs(beam.y - (200 - 50 * 0.72)) < 1e-9);
});

console.log("\n" + passed + " tests passed");
