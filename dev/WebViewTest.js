// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: red; icon-glyph: vial;

/* Minimal WebView smoke test — isolates whether Scriptable's WebView can
 * load and display content at all on this device, independent of Proverload.
 * If this shows a big orange "IT WORKS" on a black background, the WebView
 * mechanism is fine and the bug is specific to the Proverload bundle.
 * If this ALSO shows a blank screen, the problem is more fundamental. */

const html = '<!DOCTYPE html><html><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width, initial-scale=1"></head>' +
  '<body style="background:#000;color:#FF9F45;font:24px -apple-system;' +
  'display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">' +
  '<div style="text-align:center">IT WORKS ✅<br><span style="font-size:14px;color:#8A8F98">' +
  new Date().toString() + '</span></div></body></html>';

const wv = new WebView();
try {
  await wv.loadHTML(html, null, new Size(0, 0), true);
  await wv.present(true);
} catch (e) {
  const a = new Alert();
  a.title = 'WebView failed';
  a.message = String((e && e.message) || e);
  a.addAction('OK');
  await a.presentAlert();
}
Script.complete();
