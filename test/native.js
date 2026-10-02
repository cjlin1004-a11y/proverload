#!/usr/bin/env node
/* Drives the native Alert-based app end to end with a scripted sequence of
 * taps, so the whole flow (pick exercise, log sets, week/lifts/settings)
 * actually executes off-device, not just "it builds". */

const fs = require('fs');
const path = require('path');
const { install } = require('./mock-scriptable');

const ROOT = path.join(__dirname, '..');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

let failures = 0;
function check(name, cond, extra) {
  console.log((cond ? '  ok   ' : '  FAIL ') + name + (extra ? '  ' + extra : ''));
  if (!cond) failures++;
}

/* ------------------------------------------------------ scripted Alert --- */

function makeAlertClass(script, log) {
  return class Alert {
    constructor() { this.title = ''; this.message = ''; this._actions = []; this._fields = []; }
    addAction(t) { this._actions.push(t); }
    addDestructiveAction(t) { this._actions.push(t); }
    addCancelAction(t) { this._cancel = t; this._actions.push(t); }
    addTextField(placeholder, text) { this._fields.push(text || ''); return this._fields.length - 1; }
    textFieldValue(i) { return this._fields[i]; }
    async _present(kind) {
      log.push(kind + ': ' + this.title + (this._actions.length ? ' [' + this._actions.join(', ') + ']' : ''));
      const step = script.shift();
      if (!step) throw new Error('script ran out of steps at "' + this.title + '" (' + kind + '), ' +
        'available actions: ' + JSON.stringify(this._actions));
      if (step.fill) step.fill.forEach((v, i) => { if (v != null) this._fields[i] = v; });
      if (step.cancel) return -1;
      const idx = this._actions.indexOf(step.action);
      if (idx < 0) throw new Error('action "' + step.action + '" not offered at "' + this.title + '" — had: ' +
        JSON.stringify(this._actions));
      return idx;
    }
    async presentAlert() { return this._present('alert'); }
    async presentSheet() { return this._present('sheet'); }
  };
}

/* ----------------------------------------------------------------- run --- */

const bundle = fs.readFileSync(path.join(ROOT, 'dist/Proverload.js'), 'utf8');

async function runScript(script) {
  const log = [];
  const g = {};
  const { files } = install(g, {});
  g.config = { runsInWidget: false, runsInAccessoryWidget: false };
  g.args = { widgetParameter: null };
  g.Alert = makeAlertClass(script, log);

  const names = Object.keys(g);
  const fn = new AsyncFunction(names.join(','), bundle);
  await fn.apply(null, names.map((n) => g[n]));

  const raw = files['/docs/proverload/data.json'];
  return { state: raw ? JSON.parse(raw) : null, log: log };
}

(async () => {
  console.log('\nfull native flow: log an exercise, browse every screen, close');

  const script = [
    { action: 'Log today’s workout' },                          // main menu
    { action: '+ New exercise…' },                                   // pick exercise sheet
    { fill: ['Test Curl'], action: 'Next: pick muscle' },             // name entry
    { action: 'Biceps' },                                             // muscle sheet
    { action: 'Start logging sets' },                                 // history/suggestion confirm
    { fill: ['20', '10'], action: 'Save & add another set' },         // set 1
    { fill: ['20', '9'], action: 'Save & finish exercise' },          // set 2
    { action: 'OK' },                                                 // saved confirmation
    { action: 'Week summary' },
    { action: 'OK' },
    { action: 'Lifts (est. 1RM)' },
    { action: 'OK' },
    { action: 'Settings' },
    { fill: ['71'], action: 'Save as kg' },
    { cancel: true },                                                 // close main menu
  ];

  let result = null, err = null;
  try { result = await runScript(script); } catch (e) { err = e; }

  check('full flow runs without throwing', !err, err ? String(err.stack || err) : '');
  if (result) {
    const state = result.state;
    check('a session was created for today', !!state && state.sessions.length === 1,
      state ? state.sessions.length + ' sessions' : 'no state written');
    const entry = state && state.sessions[0].entries[0];
    check('the new exercise got both sets', entry && entry.sets.length === 2,
      entry ? JSON.stringify(entry.sets) : 'no entry');
    check('new exercise was created under Biceps', state &&
      state.exercises.some((e) => e.name === 'Test Curl' && e.primary === 'biceps'));
    check('settings were saved', state && state.settings.bodyweight === 71 && state.settings.unit === 'kg',
      state ? JSON.stringify(state.settings) : '');
    check('script consumed the whole tap sequence', script.length === 0, script.length + ' steps unused');
  }

  console.log('\ncancel paths leave no partial data');
  const cancelScript = [
    { action: 'Log today’s workout' },
    { action: '+ New exercise…' },
    { cancel: true },                 // bail on naming — should abort the whole log flow
    { cancel: true },                 // close main menu
  ];
  let r2 = null, e2 = null;
  try { r2 = await runScript(cancelScript); } catch (e) { e2 = e; }
  check('cancelling exercise creation writes nothing', !e2 && (!r2.state || r2.state.sessions.length === 0),
    e2 ? String(e2) : (r2.state ? JSON.stringify(r2.state.sessions) : 'no file written — fine'));

  console.log('\nstartup failure shows an alert instead of dying silently');
  const failLog = [];
  const g = {};
  install(g, {});
  g.config = { runsInWidget: false, runsInAccessoryWidget: false };
  g.args = {};
  g.FileManager = {
    iCloud: () => { throw new Error('boom: iCloud unavailable'); },
    local: () => { throw new Error('boom: local unavailable too'); },
  };
  g.Alert = makeAlertClass([{ action: 'OK' }], failLog);
  let e3 = null;
  try {
    const names = Object.keys(g);
    await new AsyncFunction(names.join(','), bundle).apply(null, names.map((n) => g[n]));
  } catch (e) { e3 = e; }
  check('a total storage failure still shows an alert rather than crashing the script',
    !e3 && failLog.some((l) => l.indexOf('Proverload failed to open') >= 0),
    e3 ? String(e3) : JSON.stringify(failLog));

  console.log('\n' + (failures ? failures + ' FAILURE(S)' : 'all checks passed') + '\n');
  process.exit(failures ? 1 : 0);
})();
