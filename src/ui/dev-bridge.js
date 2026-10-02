/* =========================================================================
 * Dev-only native-side shim.
 *
 * Lets the exact same UI (core.js + ui.js) run in a normal desktop browser
 * for fast iteration, without touching Scriptable or a phone. It plays the
 * role app.js normally plays: draining ui.js's request queue and answering
 * each action — except storage is localStorage instead of iCloud Drive.
 *
 * Only ever bundled into dist/dev.html, never into dist/Proverload.js.
 * ======================================================================= */
(function () {
'use strict';

var KEY = 'proverload.dev.data';

function loadState() {
  var raw = null;
  try { raw = localStorage.getItem(KEY); } catch (e) {}
  var parsed = null;
  if (raw) { try { parsed = JSON.parse(raw); } catch (e) {} }
  return migrate(parsed || emptyState());   // globals from core.js, same script realm
}
function saveState(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {}
}

var state = loadState();

function handle(action, payload) {
  switch (action) {
    case 'load':
      return { state: state, storage: 'this browser (localStorage) — dev mode' };

    case 'save':
      state = migrate(payload.state);
      saveState(state);
      return { savedAt: new Date().toISOString() };

    case 'haptic':
      return {};

    case 'previewWidget':
      window.alert('Widget preview only renders inside Scriptable.\n\n' +
        'Run `npm test` to see the widget tree printed in the terminal instead.');
      return {};

    case 'export': {
      var blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'proverload-' + todayKey() + '.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
      return {};
    }

    case 'import':
      return new Promise(function (resolve) {
        var input = document.createElement('input');
        input.type = 'file';
        input.accept = 'application/json';
        input.onchange = function () {
          var file = input.files[0];
          if (!file) { resolve({ cancelled: true }); return; }
          var reader = new FileReader();
          reader.onload = function () {
            try {
              state = migrate(JSON.parse(String(reader.result)));
              saveState(state);
              resolve({ state: state });
            } catch (e) { resolve({ cancelled: true }); }
          };
          reader.readAsText(file);
        };
        input.click();
      });

    case 'close':
      return {};

    default:
      throw new Error('unknown action: ' + action);
  }
}

/* Drives ui.js's queue exactly like app.js does on-device, just without the
 * evaluateJavaScript round trip. */
function step() {
  window.__nextRequest(function (raw) {
    var msg;
    try { msg = JSON.parse(raw); } catch (e) { setTimeout(step, 0); return; }
    Promise.resolve()
      .then(function () { return handle(msg.action, msg.payload); })
      .then(function (data) {
        window.__resolve(msg.id, JSON.stringify({ ok: true, data: data }));
      })
      .catch(function (err) {
        window.__resolve(msg.id, JSON.stringify({ ok: false, error: String((err && err.message) || err) }));
      })
      .then(function () { setTimeout(step, 0); });
  });
}
step();

console.log('%cProverload dev mode', 'font-weight:bold;color:#FF9F45',
  '— data lives in this browser\'s localStorage, separate from your phone. ' +
  'Clear it with localStorage.removeItem("' + KEY + '").');
})();
