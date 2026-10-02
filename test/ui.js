#!/usr/bin/env node
/* Runs the WebView UI against a stub DOM and a stub native bridge, so every
 * view and sheet is actually executed before it reaches a phone. */

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let failures = 0;
function check(name, cond, extra) {
  console.log((cond ? '  ok   ' : '  FAIL ') + name + (extra ? '  ' + extra : ''));
  if (!cond) failures++;
}

/* ------------------------------------------------------------ dom stub --- */

function el(tag) {
  return {
    tag: tag || 'div', innerHTML: '', textContent: '', value: '', checked: false,
    dataset: {}, style: {}, selectionStart: 0,
    classList: { toggle() {}, add() {}, remove() {}, contains() { return false; } },
    focus() {}, setSelectionRange() {},
  };
}

const nodes = {
  '#title': el(), '#subtitle': el(), '#head-action': el(),
  '#main': el(), '#sheet-root': el(),
};
const navButtons = ['log', 'week', 'lifts', 'more'].map(function (t) {
  const b = el('button'); b.dataset.tab = t; return b;
});
const handlers = {};

const documentStub = {
  querySelector: function (sel) {
    if (nodes[sel]) return nodes[sel];
    // fields created inside sheets — served on demand so form code can run
    if (!nodes.__dyn) nodes.__dyn = {};
    if (sel.charAt(0) === '#') return (nodes.__dyn[sel] = nodes.__dyn[sel] || el('input'));
    if (sel.indexOf('[data-act="picker-q"]') === 0) return null;
    return null;
  },
  querySelectorAll: function (sel) { return sel === 'nav button' ? navButtons : []; },
  getElementById: function (id) { return documentStub.querySelector('#' + id); },
  addEventListener: function (type, fn) { handlers[type] = fn; },
};

/* --------------------------------------------------------- bridge stub --- */

const nativeCalls = [];
let dbFile = null;

const late = [];

function pump(windowStub) {
  /* Drain one queued request the way Scriptable's evaluateJavaScript would.
   * When the queue is empty the UI parks our callback until the next request;
   * `late` catches whatever it hands us after this call has already returned. */
  let raw = null, returned = false;
  if (late.length) {
    raw = late.shift();                       // keep parked messages in order
  } else {
    windowStub.__nextRequest(function (v) { if (returned) late.push(v); else raw = v; });
    returned = true;
  }
  if (raw == null) return false;
  const msg = JSON.parse(raw);
  nativeCalls.push(msg.action);
  let data = {};
  if (msg.action === 'load') data = { state: dbFile, storage: 'iCloud Drive' };
  if (msg.action === 'save') { dbFile = msg.payload.state; data = { savedAt: 'now' }; }
  windowStub.__resolve(msg.id, JSON.stringify({ ok: true, data: data }));
  return true;
}

/* ----------------------------------------------------------------- run --- */

const core = fs.readFileSync(path.join(ROOT, 'src/core.js'), 'utf8');
const ui = fs.readFileSync(path.join(ROOT, 'src/ui/ui.js'), 'utf8');

const seeded = (function () {
  const c = {};
  new Function('exports', core + '\nObject.assign(exports,{emptyState,migrate,todayKey,addDays});')(c);
  const s = c.emptyState();
  const t = c.todayKey();
  [0, 2, 7, 9, 14, 16].forEach(function (back, i) {
    s.sessions.push({
      id: 'seed' + i, date: c.addDays(t, -back), note: '',
      entries: [
        { exId: 'bench', sets: [{ w: 40, r: 10, warm: true }, { w: 60, r: 8 }, { w: 60, r: 8 }, { w: 60, r: 7 }] },
        { exId: 'row-bb', sets: [{ w: 50, r: 10 }, { w: 50, r: 10 }] },
      ],
    });
  });
  return c.migrate(s);
})();
dbFile = JSON.parse(JSON.stringify(seeded));

const windowStub = { scrollTo: function () {} };
const scope = {
  window: windowStub, document: documentStub,
  setTimeout: function (fn) { fn(); return 0; },   // run debounces immediately
  clearTimeout: function () {},
  Promise: Promise, JSON: JSON, Math: Math, Date: Date, console: console,
  parseInt: parseInt, parseFloat: parseFloat, isFinite: isFinite, String: String,
  Object: Object, Array: Array, Error: Error,
};
const names = Object.keys(scope);
new Function(names.join(','), core + '\n' + ui).apply(null, names.map(function (n) { return scope[n]; }));

const flush = function () { return new Promise(function (r) { setImmediate(r); }); };
async function drain() {
  for (let i = 0; i < 6; i++) {
    while (pump(windowStub)) {}
    await flush();
  }
}

function clickTab(tab) {
  const b = navButtons.find(function (x) { return x.dataset.tab === tab; });
  handlers.click({ target: { closest: function () { return b; } } });
}
function clickAct(props) {
  const e = el('button');
  Object.assign(e.dataset, props);
  handlers.click({ target: { closest: function () { return e; } } });
  return e;
}
function typeInto(act, value, extra) {
  const t = Object.assign(el('input'), { value: value, dataset: Object.assign({ act: act }, extra) });
  handlers.input({ target: t });
}
async function attempt(fn) {
  try { fn(); await drain(); return null; } catch (e) { return e; }
}

(async function () {
  console.log('\nui bridge');
  await drain();
  check('ui asked the native side to load', nativeCalls[0] === 'load');
  check('log view rendered', nodes['#main'].innerHTML.length > 200,
    nodes['#main'].innerHTML.length + ' chars');
  check('log view lists the logged exercise', nodes['#main'].innerHTML.indexOf('Bench Press') >= 0);

  console.log('\nviews');
  for (const tab of ['week', 'lifts', 'more', 'log']) {
    nodes['#main'].innerHTML = '';
    const e = await attempt(function () { clickTab(tab); });
    check(tab + ' view renders', !e && nodes['#main'].innerHTML.length > 100,
      e ? String(e.stack ? e.stack.split('\n').slice(0, 2).join(' | ') : e) : '');
  }

  console.log('\nsheets and edits');
  let e;

  e = await attempt(function () { clickAct({ act: 'pick-ex' }); });
  check('exercise picker opens', !e && nodes['#sheet-root'].innerHTML.indexOf('Lat Pulldown') >= 0,
    e ? String(e) : '');

  e = await attempt(function () { clickAct({ act: 'add-ex', ex: 'latpull' }); });
  check('adding an exercise saves and opens the set editor',
    !e && nativeCalls.indexOf('save') >= 0 && nodes['#sheet-root'].innerHTML.indexOf('Add set') >= 0,
    e ? String(e) : '');

  const findLat = function () {
    const s = dbFile.sessions.find(function (x) { return x.entries.some(function (en) { return en.exId === 'latpull'; }); });
    return s && s.entries.find(function (en) { return en.exId === 'latpull'; });
  };

  e = await attempt(function () {
    typeInto('set-w', '55', { k: '0' });
    typeInto('set-r', '9', { k: '0' });
  });
  let lat = findLat();
  check('typing weight and reps persists', !e && lat && lat.sets[0].w === 55 && lat.sets[0].r === 9,
    e ? String(e) : JSON.stringify(lat && lat.sets[0]));

  const before = lat.sets.length;
  e = await attempt(function () { clickAct({ act: 'set-add' }); });
  lat = findLat();
  check('add set carries the last weight forward',
    !e && lat.sets.length === before + 1 && lat.sets[lat.sets.length - 1].w === lat.sets[before - 1].w,
    e ? String(e) : '');

  e = await attempt(function () { clickAct({ act: 'set-warm', k: '0' }); });
  lat = findLat();
  check('warm-up toggle flips', !e && lat.sets[0].warm === true, e ? String(e) : '');

  e = await attempt(function () { clickAct({ act: 'close-sheet' }); clickTab('lifts'); clickAct({ act: 'lift', ex: 'bench' }); });
  check('lift detail opens with history and per-exercise settings',
    !e && nodes['#sheet-root'].innerHTML.indexOf('Smallest jump') >= 0, e ? String(e) : '');

  e = await attempt(function () { clickAct({ act: 'close-sheet' }); clickTab('more'); clickAct({ act: 'new-ex' }); });
  check('new exercise form opens', !e && nodes['#sheet-root'].innerHTML.indexOf('Create exercise') >= 0,
    e ? String(e) : '');

  e = await attempt(function () {
    documentStub.querySelector('#nx-name').value = 'Chest Supported Row';
    documentStub.querySelector('#nx-muscle').value = 'back';
    documentStub.querySelector('#nx-min').value = '10';
    documentStub.querySelector('#nx-max').value = '15';
    documentStub.querySelector('#nx-inc').value = '2.5';
    clickAct({ act: 'nx-save' });
  });
  const custom = dbFile.exercises.filter(function (x) { return x.name === 'Chest Supported Row'; });
  check('custom exercise is created and saved', !e && custom.length === 1, e ? String(e) : '');

  e = await attempt(function () { clickAct({ act: 'close-sheet' }); clickTab('log'); clickAct({ act: 'day', d: '1' }); });
  check('date navigation works on an empty day', !e, e ? String(e) : '');

  e = await attempt(function () { clickAct({ act: 'copy-last' }); });
  check('repeat-last-session copies the previous workout with reps cleared',
    !e && nodes['#main'].innerHTML.indexOf('Bench Press') >= 0 &&
    nodes['#main'].innerHTML.indexOf('60kg × 0') >= 0, e ? String(e) : '');

  e = await attempt(function () { clickTab('more'); typeInto('target', '18', { m: 'chest' }); });
  check('weekly target edit persists', !e && dbFile.settings.targets.chest === 18, e ? String(e) : '');

  e = await attempt(function () { typeInto('bodyweight', '72.5'); clickAct({ act: 'unit', v: 'lb' }); });
  check('bodyweight and unit settings persist',
    !e && dbFile.settings.bodyweight === 72.5 && dbFile.settings.unit === 'lb', e ? String(e) : '');

  console.log('\n' + (failures ? failures + ' FAILURE(S)' : 'all checks passed') + '\n');
  process.exit(failures ? 1 : 0);
})();
