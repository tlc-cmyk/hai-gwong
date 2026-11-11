/**
 * 隙光晨檢 — 無介面引擎測試（無需瀏覽器、無需 Web Audio）。
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

test("grid is 10×12 = 120 lockers", () => {
  assert.equal(E.COLS, 10);
  assert.equal(E.ROWS, 12);
  assert.equal(E.LOCKER_COUNT, 120);
});

test("each round has exactly 8 empty lockers and 112 phones", () => {
  for (const seed of [1, 2, 7, 99, 20261111]) {
    const round = E.createRound(seed);
    assert.equal(round.lockers.length, 120);
    assert.equal(round.emptyIds.length, 8);
    const emptySet = new Set(round.emptyIds);
    assert.equal(emptySet.size, 8);
    let phones = 0;
    let empties = 0;
    for (const locker of round.lockers) {
      if (locker.hasPhone) phones++;
      else empties++;
      if (emptySet.has(locker.id)) assert.equal(locker.hasPhone, false);
      else assert.equal(locker.hasPhone, true);
    }
    assert.equal(phones, 112);
    assert.equal(empties, 8);
  }
});

test("empty locker positions change with the seed", () => {
  const a = E.createRound(11).emptyIds.join(",");
  const b = E.createRound(12).emptyIds.join(",");
  const c = E.createRound(11).emptyIds.join(",");
  assert.equal(a, c);
  assert.notEqual(a, b);
});

test("120 locker colours are unique", () => {
  const palette = E.PALETTE;
  assert.equal(palette.length, 120);
  const set = new Set(palette);
  assert.equal(set.size, 120, "duplicate hex in palette");
  for (const hex of palette) {
    assert.match(hex, /^#[0-9a-f]{6}$/);
  }
  const rebuilt = E.buildPalette();
  assert.equal(new Set(rebuilt).size, 120);
});

test("phase durations are 30s then 10s", () => {
  assert.equal(E.PHASE1_SECONDS, 30);
  assert.equal(E.PHASE2_SECONDS, 10);
  const eng = new E.GameEngine({ seed: 3, play: { x: 0, y: 0, w: 400, h: 640 } });
  assert.equal(eng.phase, "inspect");
  assert.equal(eng.phaseLimit(), 30);
  eng.step(29.5);
  assert.equal(eng.phase, "inspect");
  assert.ok(eng.remaining() > 0.4 && eng.remaining() < 0.6);
  eng.step(0.5);
  assert.equal(eng.phase, "select");
  assert.equal(eng.phaseLimit(), 10);
  assert.ok(eng.remaining() <= 10 && eng.remaining() > 9.4);
  eng.step(9.9);
  assert.equal(eng.phase, "select");
  eng.step(0.2);
  assert.equal(eng.phase, "result");
});

test("peeking reveals correctly only in phase 1 when the beam covers the locker", () => {
  const eng = new E.GameEngine({ seed: 42, play: { x: 0, y: 0, w: 400, h: 640 } });
  const emptyId = eng.round.emptyIds[0];
  const phoneId = eng.round.lockers.find((l) => l.hasPhone).id;
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
});

test("phase 2 cannot reveal contents even with a beam set", () => {
  const eng = new E.GameEngine({ seed: 8, play: { x: 0, y: 0, w: 400, h: 640 } });
  const id = eng.round.emptyIds[3];
  const c = E.slitCenter(eng.lockerGeom(id));
  eng.setBeam(c.x, c.y, 30);
  assert.equal(eng.reveal(id).hasPhone, false);

  eng.step(30);
  assert.equal(eng.phase, "select");
  // Force a beam object as a hostile/stale pointer
  eng.beam = { x: c.x, y: c.y, radius: 80 };
  assert.equal(eng.reveal(id), null);
  assert.equal(eng.setBeam(c.x, c.y, 80), null);
  assert.equal(eng.beam, null);
  assert.equal(eng.reveal(id), null);
});

test("visited ticks do not reveal contents and clear when phase 2 starts", () => {
  const eng = new E.GameEngine({ seed: 5, play: { x: 0, y: 0, w: 400, h: 640 } });
  const id = eng.round.emptyIds[1];
  const c = E.slitCenter(eng.lockerGeom(id));
  eng.setBeam(c.x, c.y, 28);
  assert.equal(eng.isVisited(id), true);
  // Another locker far away should not be visited
  const far = id === 0 ? 119 : 0;
  const farC = E.slitCenter(eng.lockerGeom(far));
  const dx = farC.x - c.x;
  const dy = farC.y - c.y;
  if (dx * dx + dy * dy > 40 * 40) {
    assert.equal(eng.isVisited(far), false);
  }
  eng.step(30);
  assert.equal(eng.phase, "select");
  assert.equal(eng.isVisited(id), false);
});

test("cannot toggle in phase 1; toggle and untap work in phase 2", () => {
  const eng = new E.GameEngine({ seed: 9, play: { x: 0, y: 0, w: 400, h: 640 } });
  assert.equal(eng.toggleSelect(0), false);
  eng.step(30);
  assert.equal(eng.toggleSelect(0), true);
  assert.equal(eng.isSelected(0), true);
  assert.equal(eng.toggleSelect(0), true);
  assert.equal(eng.isSelected(0), false);
  eng.toggleSelect(3);
  eng.toggleSelect(7);
  assert.deepEqual(eng.selectedIds(), [3, 7]);
});

test("scoring: perfect flags of all 8 with no extras is the top grade", () => {
  const empties = [2, 15, 28, 40, 61, 77, 99, 118];
  const result = E.scoreSelection(empties, empties);
  assert.equal(result.correct, 8);
  assert.equal(result.falseFlags, 0);
  assert.equal(result.missed, 0);
  assert.equal(result.score, 800);
  assert.equal(result.grade, "火眼金睛");
  assert.equal(E.gradeOf(8, 0), "perfect");
});

test("scoring: flagging none is 0 and the lowest grade", () => {
  const empties = [1, 2, 3, 4, 5, 6, 7, 8];
  const result = E.scoreSelection([], empties);
  assert.equal(result.correct, 0);
  assert.equal(result.falseFlags, 0);
  assert.equal(result.missed, 8);
  assert.equal(result.score, 0);
  assert.equal(result.grade, "要再練");
  assert.equal(E.gradeOf(0, 0), "practice");
});

test("scoring: false flags are counted and penalised", () => {
  const empties = [1, 2, 3, 4, 5, 6, 7, 8];
  // 6 hits, 2 misses, 1 false
  const result = E.scoreSelection([1, 2, 3, 4, 5, 6, 50], empties);
  assert.equal(result.correct, 6);
  assert.equal(result.falseFlags, 1);
  assert.equal(result.missed, 2);
  assert.equal(result.score, 6 * 100 - 25);
  assert.equal(result.grade, "細心值日");
  assert.deepEqual(result.falseIds, [50]);
  assert.deepEqual(result.missIds, [7, 8]);
});

test("grade bands cover careful, pass, missed and wild", () => {
  assert.equal(E.GRADES[E.gradeOf(7, 0)], "細心值日");
  assert.equal(E.GRADES[E.gradeOf(6, 1)], "細心值日");
  assert.equal(E.GRADES[E.gradeOf(8, 1)], "細心值日");
  assert.equal(E.GRADES[E.gradeOf(5, 2)], "合格");
  assert.equal(E.GRADES[E.gradeOf(4, 0)], "合格");
  assert.equal(E.GRADES[E.gradeOf(3, 1)], "漏咗幾格");
  assert.equal(E.GRADES[E.gradeOf(2, 5)], "亂點");
  assert.equal(E.GRADES[E.gradeOf(0, 8)], "亂點");
  assert.equal(E.GRADES[E.gradeOf(1, 0)], "要再練");
  assert.equal(E.GRADES[E.gradeOf(2, 1)], "要再練");
});

test("scan-and-memory bot that inspects all empties then flags them scores top", () => {
  const eng = new E.GameEngine({ seed: 2026, play: { x: 10, y: 20, w: 360, h: 600 } });
  const radius = E.suggestedBeamRadius(eng.layout.cellW, eng.layout.cellH);
  const empties = eng.round.emptyIds.slice();
  assert.equal(empties.length, 8);

  // Sweep every empty locker with the torch and confirm the peek.
  for (const id of empties) {
    const c = E.slitCenter(eng.lockerGeom(id));
    eng.setBeam(c.x, c.y, radius);
    const seen = eng.reveal(id);
    assert.ok(seen, "bot should peek empty locker " + (id + 1));
    assert.equal(seen.hasPhone, false);
    eng.step(0.2);
  }
  // Also confirm a phone locker peeks as having a phone
  const phoneId = eng.round.lockers.find((l) => l.hasPhone).id;
  const pc = E.slitCenter(eng.lockerGeom(phoneId));
  eng.setBeam(pc.x, pc.y, radius);
  assert.equal(eng.reveal(phoneId).hasPhone, true);

  eng.step(eng.remaining() + 0.01);
  assert.equal(eng.phase, "select");
  // Memory: flag exactly the empties inspected earlier
  for (const id of empties) {
    const ok = eng.toggleSelect(id);
    assert.equal(ok, true);
  }
  // Contents must stay hidden in the tap window
  for (const id of empties) {
    assert.equal(eng.reveal(id), null);
  }

  eng.step(E.PHASE2_SECONDS + 0.01);
  assert.equal(eng.phase, "result");
  assert.equal(eng.result.correct, 8);
  assert.equal(eng.result.falseFlags, 0);
  assert.equal(eng.result.missed, 0);
  assert.equal(eng.result.score, 800);
  assert.equal(eng.result.grade, "火眼金睛");
});

test("hit-testing finds the locker under a point", () => {
  const eng = new E.GameEngine({ seed: 1, play: { x: 0, y: 0, w: 400, h: 640 } });
  const g = eng.lockerGeom(37);
  assert.equal(eng.hitTest(g.x + g.w / 2, g.y + g.h / 2), 37);
  assert.equal(eng.hitTest(-10, -10), -1);
});

test("beamFromPointer offsets the light above the finger", () => {
  const beam = E.beamFromPointer(100, 200, 50);
  assert.equal(beam.x, 100);
  assert.ok(beam.y < 200, "beam should sit above the pointer");
  assert.equal(beam.radius, 50);
  assert.ok(Math.abs(beam.y - (200 - 50 * 0.72)) < 1e-9);
});

console.log("\n" + passed + " tests passed");
