#!/usr/bin/env node
/* Off-device smoke test: seeds four weeks of training, runs the core maths,
 * then renders all three widget sizes through the mock Scriptable API. */

const fs = require('fs');
const path = require('path');
const { install, dump } = require('./mock-scriptable');

const ROOT = path.join(__dirname, '..');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

let failures = 0;
function check(name, cond, extra) {
  console.log((cond ? '  ok   ' : '  FAIL ') + name + (extra ? '  ' + extra : ''));
  if (!cond) failures++;
}

/* ---------------------------------------------------------------- seed --- */

function seedState() {
  const core = {};
  new Function('exports', fs.readFileSync(path.join(ROOT, 'src/core.js'), 'utf8') +
    '\nObject.assign(exports,{emptyState,migrate,weekKey,todayKey,addDays,weeklyRollup,' +
    'weekSummary,personalRecords,suggestNext,exerciseHistory,sessionTotals,exIndex,e1rm,' +
    'setVolume,fmtVolume,fmtWeight,fmtPct,MUSCLES});')(core);

  const s = core.emptyState();
  const today = core.todayKey();
  const thisWeek = core.weekKey(today);

  // four weeks of a simple upper/lower split, loads creeping up each week
  const plan = [
    [['bench', 60], ['row-bb', 50], ['ohp', 35], ['curl', 20]],
    [['squat', 80], ['rdl', 60], ['legcurl', 30], ['calf', 60]],
  ];
  for (let wk = 3; wk >= 0; wk--) {
    const weekStart = core.addDays(thisWeek, -7 * wk);
    plan.forEach((day, di) => {
      const date = core.addDays(weekStart, di * 2);
      if (date > today) return;
      s.sessions.push({
        id: 'seed-' + wk + '-' + di,
        date: date,
        note: '',
        entries: day.map(([exId, base]) => ({
          exId: exId,
          sets: [
            { w: base * 0.5, r: 8, warm: true },
            { w: base + (3 - wk) * 2.5, r: 8 },
            { w: base + (3 - wk) * 2.5, r: 8 },
            { w: base + (3 - wk) * 2.5, r: 7 },
          ],
        })),
      });
    });
  }
  return { core: core, state: core.migrate(s) };
}

/* ---------------------------------------------------------- core checks --- */

console.log('\ncore maths');
const { core, state } = seedState();

const sum = core.weekSummary(state);
check('weekly volume is positive', sum.volume > 0, core.fmtVolume(sum.volume) + ' kg');
check('week-over-week delta computed', sum.delta !== null, core.fmtPct(sum.delta));
check('delta is an increase (loads went up)', sum.delta > 0);
check('hard sets exclude warm-ups', sum.sets === 24, sum.sets + ' sets');
check('history has 9 buckets', sum.history.length === 9);
check('muscles get partial credit from helpers',
  (sum.muscles.find((m) => m.id === 'triceps') || {}).sets > 0);

const bench = core.exerciseHistory(state, 'bench');
check('exercise history ordered newest first', bench.length === 4 && bench[0].date > bench[3].date);
check('e1RM rises across the block', bench[0].e1rm > bench[3].e1rm,
  core.fmtWeight(bench[3].e1rm) + ' -> ' + core.fmtWeight(bench[0].e1rm));

const sug = core.suggestNext(state, 'bench');
check('suggestion produced', !!sug && !!sug.text, sug && sug.text);

const cleared = JSON.parse(JSON.stringify(state));
cleared.sessions.find((x) => x.entries.some((e) => e.exId === 'bench'))
  .entries.find((e) => e.exId === 'bench').sets.forEach((st) => { if (!st.warm) st.r = 8; });
const sug2 = core.suggestNext(cleared, 'bench');
check('clearing the rep range triggers a weight jump', sug2.kind === 'weight', sug2.text);

const prs = core.personalRecords(state);
check('personal records built', prs.length >= 4, prs.length + ' exercises');

const bwState = core.migrate(core.emptyState());
bwState.settings.bodyweight = 70;
bwState.sessions.push({ id: 'bw', date: core.todayKey(), entries: [
  { exId: 'pullup', sets: [{ w: 5, r: 8 }] }] });
const bwVol = core.weekSummary(bwState).volume;
check('bodyweight movements use bodyweight + added load', Math.round(bwVol) === 600,
  Math.round(bwVol) + ' (70*1 + 5) * 8');

/* -------------------------------------------------------- widget render --- */

console.log('\nwidget render (mocked Scriptable)');
const bundle = fs.readFileSync(path.join(ROOT, 'dist/Proverload.js'), 'utf8');

async function renderFamily(family, st) {
  const g = {};
  install(g, { '/docs/proverload/data.json': JSON.stringify(st) });
  g.config = { runsInWidget: true, runsInAccessoryWidget: false, widgetFamily: family };
  const names = Object.keys(g);
  const fn = new AsyncFunction(names.join(','), bundle);
  await fn.apply(null, names.map((n) => g[n]));
  return g.__widget;
}

/** Every explicit width found anywhere in the tree — stacks pinned via
 * `.size`, and drawn chart images (their pixel size doubles as their
 * imageSize on the real widget). Used to catch anything wider than the
 * safe content budget before it ever reaches a device. */
function widths(node, out) {
  out = out || [];
  if (node.props && node.props.size) out.push(node.props.size.width);
  if (node.type === 'image' && node.img && node.img.size) out.push(node.img.size.width);
  (node.children || []).forEach((c) => widths(c, out));
  return out;
}
const SAFE_W = { small: 110, medium: 260, large: 260 };

/** Rough rendered height of the whole tree: text ≈ font-size × 1.25 line
 * height (a standard approximation for system fonts, and if anything an
 * underestimate — real line heights only run a bit taller), explicit
 * `.size` heights are authoritative, horizontal stacks take their tallest
 * child, vertical stacks (the ListWidget default, and anything not marked
 * `h`) sum their children. Flexible `addSpacer()` (no argument) doesn't add
 * height here since it only consumes whatever room is already free.
 * Approximate, but it catches gross regressions before a device does. */
function estimateHeight(n) {
  if (n.type === 'text') return (n.fontSize || 12) * 1.25;
  if (n.type === 'spacer') return n.size || 0;
  if (n.type === 'image') return n.img.size.height;
  const kids = (n.children || []).map(estimateHeight);
  if (n.props && n.props.size && n.props.size.height) return n.props.size.height;
  if (n.props && n.props.axis === 'h') return Math.max(0, ...kids);
  return kids.reduce((a, b) => a + b, 0);
}
const SAFE_H = { small: 118, medium: 118, large: 285 };

(async () => {
  for (const fam of ['small', 'medium', 'large']) {
    let w = null, err = null;
    try { w = await renderFamily(fam, state); } catch (e) { err = e; }
    check(fam + ' widget renders', !!w && !err, err ? String(err) : '');
    if (w) {
      const maxW = Math.max(0, ...widths(w.node));
      check(fam + ' widget: nothing wider than the safe content budget',
        maxW <= SAFE_W[fam], 'widest element ' + maxW + 'pt, budget ' + SAFE_W[fam] + 'pt');
      const h = estimateHeight(w.node);
      check(fam + ' widget: estimated height fits the frame',
        h <= SAFE_H[fam], 'estimated ' + h.toFixed(0) + 'pt, budget ' + SAFE_H[fam] + 'pt');
    }
    if (w && process.env.DUMP) console.log(dump(w.node));
  }

  // Stress test: a custom exercise with a pathologically long name should
  // still clip, not stretch the layout — this is exactly what a real user
  // typing "Chest Supported Incline Dumbbell Row Machine (left arm only)"
  // would trigger.
  const longState = JSON.parse(JSON.stringify(state));
  const longId = 'stress-long-name';
  longState.exercises.push({
    id: longId, name: 'Chest Supported Incline Dumbbell Row Machine (left arm only, controlled tempo)',
    primary: 'back', secondary: [], inc: 2, repMin: 8, repMax: 12, bw: false, bwf: 1, archived: false,
  });
  longState.sessions[0].entries.push({ exId: longId, sets: [{ w: 200, r: 5 }, { w: 200, r: 5 }] });
  for (const fam of ['medium', 'large']) {
    let w = null, err = null;
    try { w = await renderFamily(fam, longState); } catch (e) { err = e; }
    check(fam + ' widget survives a pathologically long exercise name', !!w && !err, err ? String(err) : '');
    if (w) {
      const maxW = Math.max(0, ...widths(w.node));
      check(fam + ' widget: long name still fits the safe content budget',
        maxW <= SAFE_W[fam], 'widest element ' + maxW + 'pt, budget ' + SAFE_W[fam] + 'pt');
      const h = estimateHeight(w.node);
      check(fam + ' widget: long name doesn\'t push height over budget either',
        h <= SAFE_H[fam], 'estimated ' + h.toFixed(0) + 'pt, budget ' + SAFE_H[fam] + 'pt');
    }
  }

  let emptyW = null, emptyErr = null;
  try { emptyW = await renderFamily('medium', core.migrate(core.emptyState())); }
  catch (e) { emptyErr = e; }
  check('empty database renders a friendly widget', !!emptyW && !emptyErr,
    emptyErr ? String(emptyErr) : '');

  if (process.env.DUMP) {
    console.log('\n--- medium widget tree ---');
    console.log(dump((await renderFamily('medium', state)).node));
  }

  console.log('\n' + (failures ? failures + ' FAILURE(S)' : 'all checks passed') + '\n');
  process.exit(failures ? 1 : 0);
})();
