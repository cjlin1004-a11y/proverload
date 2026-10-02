/* =========================================================================
 * Proverload UI — runs inside the Scriptable WebView.
 * Talks to the native side through a tiny request queue that Scriptable
 * drains with evaluateJavaScript(..., true).
 * ======================================================================= */
(function () {
'use strict';

/* --------------------------------------------------------------- bridge -- */

var queue = [], pending = {}, seq = 0, waiter = null;

function call(action, payload) {
  return new Promise(function (resolve, reject) {
    var id = ++seq;
    pending[id] = { resolve: resolve, reject: reject };
    queue.push({ id: id, action: action, payload: payload || {} });
    if (waiter) { var w = waiter; waiter = null; w(); }
  });
}

/* Scriptable calls this and hands us its `completion` callback. */
window.__nextRequest = function (completion) {
  function flush() { completion(JSON.stringify(queue.shift())); }
  if (queue.length) flush(); else waiter = flush;
};

window.__resolve = function (id, json) {
  var p = pending[id];
  if (!p) return;
  delete pending[id];
  var res;
  try { res = JSON.parse(json); } catch (e) { res = { ok: false, error: 'bad reply' }; }
  if (res.ok) p.resolve(res.data); else p.reject(new Error(res.error));
};

/* ----------------------------------------------------------------- state -- */

var S = null;                 // the whole database
var storageLabel = '';
var view = 'log';
var logDate = todayKey();
var weekCursor = weekKey(todayKey());
var liftFilter = '';
var saveTimer = null, saveFlash = null;

var $ = function (sel) { return document.querySelector(sel); };
var esc = function (s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
};
var unit = function () { return (S && S.settings.unit) || 'kg'; };
var num = function (v) { var n = parseFloat(v); return isFinite(n) ? n : 0; };

function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(function () {
    call('save', { state: S }).then(flashSaved).catch(function (e) {
      $('#subtitle').textContent = 'save failed: ' + e.message;
    });
  }, 220);
}
function flashSaved() {
  var el = $('#subtitle');
  if (!el) return;
  clearTimeout(saveFlash);
  var prev = el.dataset.base || el.textContent;
  el.dataset.base = prev;
  el.textContent = 'saved';
  el.classList.add('good');
  saveFlash = setTimeout(function () {
    el.textContent = el.dataset.base;
    el.classList.remove('good');
  }, 900);
}
function tap(kind) { call('haptic', { kind: kind || 'light' }).catch(function () {}); }

/* ------------------------------------------------------- session helpers -- */

function sessionOn(date) {
  for (var i = 0; i < S.sessions.length; i++) if (S.sessions[i].date === date) return S.sessions[i];
  return null;
}
function ensureSession(date) {
  var s = sessionOn(date);
  if (s) return s;
  s = { id: uid('s'), date: date, entries: [], note: '' };
  S.sessions.push(s);
  S.sessions.sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
  return s;
}
function tidy(date) {
  var s = sessionOn(date);
  if (!s) return;
  s.entries = s.entries.filter(function (e) { return e.sets.length > 0; });
  if (!s.entries.length && !s.note) {
    S.sessions = S.sessions.filter(function (x) { return x.id !== s.id; });
  }
}
function exById(id) {
  for (var i = 0; i < S.exercises.length; i++) if (S.exercises[i].id === id) return S.exercises[i];
  return null;
}
function lastSessionBefore(date) {
  for (var i = 0; i < S.sessions.length; i++) {
    if (S.sessions[i].date < date && S.sessions[i].entries.length) return S.sessions[i];
  }
  return null;
}

/* ---------------------------------------------------------------- charts -- */

function barsSVG(weeks, height) {
  var h = height || 56, w = 100, n = weeks.length;
  var max = Math.max.apply(null, weeks.map(function (x) { return x.volume; }).concat([1]));
  var gap = 1.6, bw = (w - gap * (n - 1)) / n;
  var bars = weeks.map(function (x, i) {
    var bh = Math.max(1.5, (x.volume / max) * (h - 12));
    var bx = i * (bw + gap);
    var last = i === n - 1;
    return '<rect x="' + bx.toFixed(2) + '" y="' + (h - 12 - bh).toFixed(2) + '" width="' + bw.toFixed(2) +
      '" height="' + bh.toFixed(2) + '" rx="1.2" fill="' + (last ? '#FF9F45' : '#FFFFFF') +
      '" opacity="' + (last ? 1 : .22) + '"/>' +
      '<text x="' + (bx + bw / 2).toFixed(2) + '" y="' + (h - 3) + '" font-size="4.6" text-anchor="middle" ' +
      'fill="' + (last ? '#FF9F45' : '#8A8F98') + '">' + shortDate(x.week).split(' ')[1] + '</text>';
  }).join('');
  return '<svg class="chart" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none">' + bars + '</svg>';
}

function lineSVG(points) {
  /* points: [{x: dateKey, y: number}] oldest first */
  if (points.length < 2) return '';
  var w = 100, h = 46, pad = 4;
  var ys = points.map(function (p) { return p.y; });
  var min = Math.min.apply(null, ys), max = Math.max.apply(null, ys);
  if (max - min < 0.001) { max = min + 1; }
  var t0 = parseDate(points[0].x).getTime();
  var t1 = parseDate(points[points.length - 1].x).getTime();
  var span = Math.max(1, t1 - t0);
  var xy = points.map(function (p) {
    var x = pad + ((parseDate(p.x).getTime() - t0) / span) * (w - pad * 2);
    var y = pad + (1 - (p.y - min) / (max - min)) * (h - pad * 2);
    return [x, y];
  });
  var d = xy.map(function (p, i) { return (i ? 'L' : 'M') + p[0].toFixed(2) + ' ' + p[1].toFixed(2); }).join(' ');
  var area = d + ' L' + xy[xy.length - 1][0].toFixed(2) + ' ' + h + ' L' + xy[0][0].toFixed(2) + ' ' + h + ' Z';
  var dots = xy.map(function (p) {
    return '<circle cx="' + p[0].toFixed(2) + '" cy="' + p[1].toFixed(2) + '" r="1.3" fill="#FF9F45"/>';
  }).join('');
  return '<svg class="chart" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none">' +
    '<path d="' + area + '" fill="#FF9F45" opacity=".12"/>' +
    '<path d="' + d + '" fill="none" stroke="#FF9F45" stroke-width="1.4" ' +
    'stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>' + dots + '</svg>';
}

/* ------------------------------------------------------------ views: log -- */

function viewLog() {
  var ses = sessionOn(logDate);
  var exs = exIndex(S);
  var t = ses ? sessionTotals(ses, exs, S.settings) : { volume: 0, sets: 0, byMuscle: {} };
  var isToday = logDate === todayKey();
  var html = '';

  html += '<div class="card"><div class="row">' +
    '<button class="btn btn-sm" data-act="day" data-d="-1">‹</button>' +
    '<div class="grow" style="text-align:center">' +
      '<div style="font-weight:600">' + weekdayName(logDate) + ', ' + shortDate(logDate) + '</div>' +
      '<div class="tiny muted">' + (isToday ? 'today' : relDay(logDate)) + '</div>' +
    '</div>' +
    '<button class="btn btn-sm" data-act="day" data-d="1">›</button>' +
    '</div>';

  if (t.sets) {
    html += '<div class="row" style="margin-top:12px;gap:18px">' +
      stat(fmtVolume(t.volume) + '<span class="small muted"> ' + unit() + '</span>', 'volume') +
      stat(fmtSets(t.sets), 'hard sets') +
      stat(String(Object.keys(t.byMuscle).length), 'muscles') +
      '</div>';
  }
  html += '</div>';

  if (!ses || !ses.entries.length) {
    var prev = lastSessionBefore(logDate);
    html += '<div class="empty"><b>Nothing logged yet</b>Add the first exercise of the session.</div>';
    if (prev) {
      html += '<button class="btn btn-block btn-ghost" data-act="copy-last" style="margin-bottom:10px">' +
        'Repeat ' + shortDate(prev.date) + ' session</button>';
    }
  } else {
    ses.entries.forEach(function (en, i) {
      var ex = exs[en.exId];
      if (!ex) return;
      var vol = en.sets.reduce(function (a, st) { return a + setVolume(ex, st, S.settings); }, 0);
      var work = en.sets.filter(isWorking).length;
      html += '<button class="ex-card" data-act="open-ex" data-i="' + i + '" style="width:100%;text-align:left;display:block">' +
        '<div class="row">' +
          '<span class="dot" style="background:' + MUSCLE_COLOR[ex.primary] + '"></span>' +
          '<h3 class="grow ellip">' + esc(ex.name) + '</h3>' +
          '<span class="tiny muted mono">' + fmtVolume(vol) + ' ' + unit() + '</span>' +
        '</div>' +
        '<div class="set-list">' +
          en.sets.map(function (st) {
            return '<span class="set-pill' + (st.warm ? ' warm' : '') + ' mono">' +
              (st.warm ? 'w ' : '') + fmtWeight(st.w, unit()) + ' × ' + (st.r || 0) + '</span>';
          }).join('') +
        '</div>' +
        '<div class="tiny muted" style="margin-top:6px">' + work + ' working set' + (work === 1 ? '' : 's') +
          ' · ' + MUSCLE_NAME[ex.primary] + '</div>' +
        '</button>';
    });
  }

  html += '<button class="btn btn-primary btn-block" data-act="pick-ex">+ Add exercise</button>';

  if (ses && ses.entries.length) {
    html += '<div class="card" style="margin-top:12px"><div class="card-h"><h2>Session note</h2></div>' +
      '<input id="note" placeholder="how did it feel?" value="' + esc(ses.note || '') + '" data-act="note">' +
      '</div>';
  }
  return html;
}

function relDay(date) {
  var d = daysBetween(date, todayKey());
  if (d === 1) return 'yesterday';
  if (d > 0) return d + ' days ago';
  if (d === -1) return 'tomorrow';
  return 'in ' + (-d) + ' days';
}
function stat(value, caption) {
  return '<div><div style="font-size:19px;font-weight:700" class="mono">' + value + '</div>' +
    '<div class="tiny muted">' + caption + '</div></div>';
}

/* ----------------------------------------------------------- views: week -- */

function viewWeek() {
  var roll = weeklyRollup(S, 9, weekCursor);
  var cur = roll[roll.length - 1];
  var prev = roll[roll.length - 2];
  var delta = prev && prev.volume > 0 ? (cur.volume - prev.volume) / prev.volume : null;
  var isThis = weekCursor === weekKey(todayKey());
  var html = '';

  html += '<div class="card">' +
    '<div class="row" style="margin-bottom:12px">' +
      '<button class="btn btn-sm" data-act="week" data-d="-1">‹</button>' +
      '<div class="grow" style="text-align:center">' +
        '<div style="font-weight:600">' + shortDate(cur.week) + ' – ' + shortDate(addDays(cur.week, 6)) + '</div>' +
        '<div class="tiny muted">' + (isThis ? 'this week' : '') + '</div>' +
      '</div>' +
      '<button class="btn btn-sm" data-act="week" data-d="1" ' + (isThis ? 'disabled style="opacity:.3"' : '') + '>›</button>' +
    '</div>' +
    '<div class="row" style="align-items:flex-end;gap:10px">' +
      '<div class="big-num mono">' + fmtVolume(cur.volume) + '</div>' +
      '<div class="small muted" style="padding-bottom:4px">' + unit() + ' moved</div>' +
      '<div class="right" style="text-align:right">' +
        (delta === null ? '<span class="small muted">no prior week</span>' :
          '<span class="' + (delta >= 0 ? 'good' : 'bad') + '" style="font-weight:700">' +
          (delta >= 0 ? '▲ ' : '▼ ') + fmtPct(delta) + '</span>' +
          '<div class="tiny muted">vs ' + fmtVolume(prev.volume) + '</div>') +
      '</div>' +
    '</div>' +
    '<div class="row small muted" style="margin-top:8px;gap:14px">' +
      '<span>' + fmtSets(cur.sets) + ' hard sets</span>' +
      '<span>' + cur.sessions + ' session' + (cur.sessions === 1 ? '' : 's') + '</span>' +
    '</div>' +
    '<div style="margin-top:14px">' + barsSVG(roll, 56) + '</div>' +
  '</div>';

  var muscles = MUSCLES.map(function (m) {
    var sets = cur.byMuscle[m.id] || 0;
    return { m: m, sets: sets, target: targetFor(S, m.id) };
  }).sort(function (a, b) { return b.sets - a.sets; });

  html += '<div class="card"><div class="card-h"><h2>Weekly sets per muscle</h2>' +
    '<span class="tiny muted">10–20 is the growth zone</span></div>';
  muscles.forEach(function (x) {
    var pct = x.target > 0 ? Math.min(1, x.sets / x.target) : 0;
    html += '<div style="margin-bottom:10px">' +
      '<div class="row tiny" style="margin-bottom:4px">' +
        '<span>' + x.m.name + '</span>' +
        '<span class="right mono ' + (x.sets >= x.target ? 'good' : 'muted') + '">' +
          fmtSets(x.sets) + ' / ' + x.target + '</span>' +
      '</div>' +
      '<div class="bar"><span style="width:' + (pct * 100).toFixed(1) + '%;background:' + x.m.color + '"></span></div>' +
      '</div>';
  });
  html += '</div>';

  var weekSessions = S.sessions.filter(function (s) { return weekKey(s.date) === cur.week; });
  if (weekSessions.length) {
    html += '<div class="card"><div class="card-h"><h2>Sessions</h2></div>';
    weekSessions.forEach(function (s) {
      var t = sessionTotals(s, exIndex(S), S.settings);
      html += '<button class="pick-row" data-act="goto-day" data-date="' + s.date + '">' +
        '<div class="grow"><div class="nm">' + weekdayName(s.date) + ' ' + shortDate(s.date) + '</div>' +
        '<div class="tiny muted">' + s.entries.length + ' exercises · ' + fmtSets(t.sets) + ' sets</div></div>' +
        '<span class="mono small muted">' + fmtVolume(t.volume) + ' ' + unit() + '</span></button>';
    });
    html += '</div>';
  }
  return html;
}

/* ---------------------------------------------------------- views: lifts -- */

function viewLifts() {
  var prs = personalRecords(S);
  if (!prs.length) {
    return '<div class="empty"><b>No lifts tracked yet</b>' +
      'Once you log an exercise twice, this tab shows whether it is actually moving up.</div>';
  }
  var q = liftFilter.toLowerCase();
  var shown = prs.filter(function (p) { return !q || p.name.toLowerCase().indexOf(q) >= 0; });
  var html = '<input placeholder="Search lifts" value="' + esc(liftFilter) +
    '" data-act="lift-filter" style="margin-bottom:12px">';

  html += '<div class="card"><div class="card-h"><h2>Estimated 1RM</h2>' +
    '<span class="tiny muted">weight × reps, normalised</span></div>';
  shown.forEach(function (p, i) {
    var arrow = p.trend > 0.05 ? '<span class="good">▲</span>' : p.trend < -0.05 ? '<span class="bad">▼</span>' : '<span class="muted">–</span>';
    html += '<button class="pick-row" data-act="lift" data-ex="' + p.exId + '">' +
      '<span class="dot" style="background:' + MUSCLE_COLOR[p.muscle] + '"></span>' +
      '<div class="grow"><div class="nm ellip">' + esc(p.name) + (p.isFreshPR ? ' <span class="accent tiny">PR</span>' : '') + '</div>' +
      '<div class="tiny muted">' + shortDate(p.last.date) + ' · ' + p.sessions + ' sessions</div></div>' +
      '<div style="text-align:right"><div class="mono" style="font-weight:600">' + fmtWeight(p.e1rm, unit()) + '</div>' +
      '<div class="tiny mono">' + arrow + ' ' + (p.trend ? fmtWeight(Math.abs(p.trend), unit()) : '') + '</div></div>' +
      '</button>';
  });
  html += '</div>';
  return html;
}

/* ----------------------------------------------------------- views: more -- */

function viewMore() {
  var html = '';
  html += '<div class="card"><div class="card-h"><h2>Basics</h2></div>' +
    '<div class="row" style="margin-bottom:12px"><div class="grow">Units</div>' +
      '<div class="seg" style="width:140px">' +
        '<button data-act="unit" data-v="kg" class="' + (unit() === 'kg' ? 'on' : '') + '">kg</button>' +
        '<button data-act="unit" data-v="lb" class="' + (unit() === 'lb' ? 'on' : '') + '">lb</button>' +
      '</div></div>' +
    '<div class="row"><div class="grow">Bodyweight<div class="tiny muted">used for pull-ups, dips, push-ups</div></div>' +
      '<input style="width:90px;text-align:center" inputmode="decimal" data-act="bodyweight" value="' +
      (S.settings.bodyweight || '') + '"></div>' +
  '</div>';

  html += '<div class="card"><div class="card-h"><h2>Weekly set targets</h2>' +
    '<span class="tiny muted">hard sets per muscle</span></div>';
  MUSCLES.forEach(function (m) {
    html += '<div class="row" style="margin-bottom:8px">' +
      '<span class="dot" style="background:' + m.color + '"></span>' +
      '<div class="grow">' + m.name + '</div>' +
      '<input style="width:74px;text-align:center" inputmode="numeric" data-act="target" data-m="' + m.id +
      '" value="' + targetFor(S, m.id) + '"></div>';
  });
  html += '</div>';

  html += '<div class="card"><div class="card-h"><h2>Exercises</h2>' +
    '<button class="btn btn-sm" data-act="new-ex">+ New</button></div>' +
    '<div class="tiny muted">' + S.exercises.filter(function (e) { return !e.archived; }).length +
    ' in your library. Tap an exercise in the picker to edit its rep range and jump size.</div></div>';

  html += '<div class="card"><div class="card-h"><h2>Widget</h2></div>' +
    '<div class="small muted" style="line-height:1.5">Home screen → long press → <b>+</b> → Scriptable → pick a size → ' +
    'choose the <b>Proverload</b> script. The widget reads the same file this app writes, so it updates on its own.</div>' +
    '<div class="row" style="margin-top:12px;gap:8px">' +
      '<button class="btn btn-sm grow" data-act="preview" data-f="small">Preview S</button>' +
      '<button class="btn btn-sm grow" data-act="preview" data-f="medium">Preview M</button>' +
      '<button class="btn btn-sm grow" data-act="preview" data-f="large">Preview L</button>' +
    '</div></div>';

  html += '<div class="card"><div class="card-h"><h2>Data</h2></div>' +
    '<div class="tiny muted" style="margin-bottom:10px">Stored in <b>' + esc(storageLabel) +
    '</b> → Scriptable → proverload/data.json · ' + S.sessions.length + ' sessions</div>' +
    '<div class="row" style="gap:8px">' +
      '<button class="btn btn-sm grow" data-act="export">Export JSON</button>' +
      '<button class="btn btn-sm grow" data-act="import">Import JSON</button>' +
    '</div></div>';

  html += '<div class="card"><div class="card-h"><h2>How to actually progress</h2></div>' +
    '<div class="small muted" style="line-height:1.55">' +
    '<b style="color:var(--text)">Volume load</b> (weight × reps) is the number to nudge up week over week — ' +
    'roughly 2–5% is plenty when you are new.<br><br>' +
    '<b style="color:var(--text)">Hard sets</b> per muscle per week drive growth more than total tonnage. ' +
    '10–20 per muscle is the usual range; start near 10.<br><br>' +
    '<b style="color:var(--text)">Double progression</b> is the rule this app suggests: keep the weight until ' +
    'every working set hits the top of the rep range, then add the smallest jump and start again at the bottom.' +
    '</div></div>';
  return html;
}

/* ---------------------------------------------------------------- sheets -- */

function openSheet(title, body, footer) {
  $('#sheet-root').innerHTML =
    '<div class="sheet-wrap" data-act="sheet-bg"><div class="sheet">' +
      '<div class="sheet-h"><h3>' + title + '</h3>' +
      '<button class="btn btn-sm" data-act="close-sheet">Done</button></div>' +
      '<div class="sheet-b">' + body + '</div>' +
      (footer || '') +
    '</div></div>';
}
function closeSheet() { $('#sheet-root').innerHTML = ''; }
function sheetOpen() { return !!$('.sheet-wrap'); }

/* --- exercise picker ----------------------------------------------------- */
var pickerQuery = '';

function showPicker() {
  var q = pickerQuery.toLowerCase();
  var byMuscle = {};
  S.exercises.filter(function (e) {
    return !e.archived && (!q || e.name.toLowerCase().indexOf(q) >= 0);
  }).forEach(function (e) {
    (byMuscle[e.primary] = byMuscle[e.primary] || []).push(e);
  });

  var body = '<input placeholder="Search or type a new name" value="' + esc(pickerQuery) +
    '" data-act="picker-q" autocomplete="off">';
  if (pickerQuery.trim()) {
    body += '<button class="btn btn-ghost btn-block btn-sm" data-act="new-ex" style="margin-top:10px">' +
      'Create “' + esc(pickerQuery.trim()) + '”</button>';
  }
  MUSCLES.forEach(function (m) {
    var list = byMuscle[m.id];
    if (!list || !list.length) return;
    body += '<div class="card-h" style="margin:18px 0 2px"><h2>' + m.name + '</h2></div>';
    list.forEach(function (e) {
      var hist = exerciseHistory(S, e.id);
      body += '<button class="pick-row" data-act="add-ex" data-ex="' + e.id + '">' +
        '<span class="dot" style="background:' + m.color + '"></span>' +
        '<div class="grow"><div class="nm ellip">' + esc(e.name) + '</div>' +
        '<div class="tiny muted">' + e.repMin + '–' + e.repMax + ' reps' +
        (hist.length ? ' · last ' + shortDate(hist[0].date) : ' · never logged') + '</div></div>' +
        '<span class="muted">＋</span></button>';
    });
  });
  openSheet('Add exercise', body);
}

/* --- set editor ---------------------------------------------------------- */
var editIdx = -1;

function showSetEditor(i) {
  editIdx = i;
  var ses = sessionOn(logDate);
  var en = ses.entries[i];
  var ex = exById(en.exId);
  var sug = suggestNext(S, en.exId);
  var hist = exerciseHistory(S, en.exId).filter(function (h) { return h.date !== logDate; });

  var body = '';
  if (sug) body += '<div class="hint">' + esc(sug.text) + '</div>';

  if (hist.length) {
    var h = hist[0];
    body += '<div class="small muted" style="margin:12px 0 4px">Last time (' + shortDate(h.date) + '): ' +
      h.allSets.map(function (st) { return fmtWeight(st.w, unit()) + '×' + st.r; }).join(', ') +
      ' · ' + fmtVolume(h.volume) + ' ' + unit() + '</div>';
  }

  body += '<div class="field-labels" style="margin-top:14px">' +
    '<span>#</span><span>' + unit() + '</span><span>reps</span><span></span><span></span></div>';
  body += en.sets.map(function (st, k) {
    return '<div class="set-row">' +
      '<div class="idx">' + (st.warm ? 'w' : (k + 1)) + '</div>' +
      '<input inputmode="decimal" data-act="set-w" data-k="' + k + '" value="' + (st.w === 0 || st.w ? st.w : '') + '">' +
      '<input inputmode="numeric" data-act="set-r" data-k="' + k + '" value="' + (st.r || '') + '">' +
      '<button class="warm-t' + (st.warm ? ' on' : '') + '" data-act="set-warm" data-k="' + k + '">warm</button>' +
      '<button class="del" data-act="set-del" data-k="' + k + '">✕</button>' +
      '</div>';
  }).join('');

  body += '<button class="btn btn-block btn-ghost" data-act="set-add" style="margin-top:6px">+ Add set</button>';

  if (hist.length > 1) {
    body += '<div class="card-h" style="margin:22px 0 8px"><h2>History</h2></div>' +
      lineSVG(hist.slice(0, 12).reverse().map(function (h) { return { x: h.date, y: h.e1rm }; })) +
      '<div class="tiny muted" style="text-align:center;margin-top:4px">estimated 1RM over time</div>';
  }

  body += '<button class="btn btn-block btn-danger" data-act="ex-remove" style="margin-top:22px">' +
    'Remove ' + esc(ex.name) + ' from this session</button>';

  openSheet(esc(ex.name), body);
}

/* --- lift detail --------------------------------------------------------- */

function showLift(exId) {
  var ex = exById(exId);
  var hist = exerciseHistory(S, exId);
  var sug = suggestNext(S, exId);
  var body = '';
  if (sug) body += '<div class="hint">' + esc(sug.text) + '</div>';

  if (hist.length > 1) {
    body += '<div class="card-h" style="margin:18px 0 6px"><h2>Estimated 1RM</h2></div>' +
      lineSVG(hist.slice(0, 16).reverse().map(function (h) { return { x: h.date, y: h.e1rm }; }));
    body += '<div class="card-h" style="margin:20px 0 6px"><h2>Volume per session</h2></div>' +
      lineSVG(hist.slice(0, 16).reverse().map(function (h) { return { x: h.date, y: h.volume }; }));
  }

  body += '<div class="card-h" style="margin:22px 0 4px"><h2>Every session</h2></div>';
  hist.forEach(function (h) {
    body += '<div class="pick-row"><div class="grow">' +
      '<div class="nm">' + shortDate(h.date) + '</div>' +
      '<div class="tiny muted mono">' + h.allSets.map(function (st) {
        return fmtWeight(st.w, unit()) + '×' + st.r; }).join(', ') + '</div></div>' +
      '<div style="text-align:right"><div class="mono small">' + fmtVolume(h.volume) + ' ' + unit() + '</div>' +
      '<div class="tiny muted mono">e1RM ' + fmtWeight(h.e1rm, unit()) + '</div></div></div>';
  });

  body += '<div class="card-h" style="margin:22px 0 8px"><h2>Settings</h2></div>' +
    '<div class="row" style="margin-bottom:10px"><div class="grow">Rep range</div>' +
      '<input style="width:62px;text-align:center" inputmode="numeric" data-act="ex-repmin" data-ex="' + exId + '" value="' + ex.repMin + '">' +
      '<span class="muted">–</span>' +
      '<input style="width:62px;text-align:center" inputmode="numeric" data-act="ex-repmax" data-ex="' + exId + '" value="' + ex.repMax + '"></div>' +
    '<div class="row"><div class="grow">Smallest jump<div class="tiny muted">added when you clear the range</div></div>' +
      '<input style="width:82px;text-align:center" inputmode="decimal" data-act="ex-inc" data-ex="' + exId + '" value="' + ex.inc + '"></div>';

  openSheet(esc(ex.name), body);
}

/* --- new exercise -------------------------------------------------------- */

function showNewExercise(prefill) {
  var body = '<div style="margin-bottom:12px"><div class="tiny muted" style="margin-bottom:4px">NAME</div>' +
    '<input id="nx-name" value="' + esc(prefill || '') + '" placeholder="e.g. Chest Supported Row"></div>' +
    '<div style="margin-bottom:12px"><div class="tiny muted" style="margin-bottom:4px">MAIN MUSCLE</div>' +
    '<select id="nx-muscle">' + MUSCLES.map(function (m) {
      return '<option value="' + m.id + '">' + m.name + '</option>'; }).join('') + '</select></div>' +
    '<div class="row" style="margin-bottom:12px">' +
      '<div class="grow"><div class="tiny muted" style="margin-bottom:4px">REP RANGE</div>' +
        '<div class="row"><input id="nx-min" inputmode="numeric" value="8" style="text-align:center">' +
        '<span class="muted">–</span>' +
        '<input id="nx-max" inputmode="numeric" value="12" style="text-align:center"></div></div>' +
      '<div style="width:110px"><div class="tiny muted" style="margin-bottom:4px">JUMP (' + unit() + ')</div>' +
        '<input id="nx-inc" inputmode="decimal" value="2.5" style="text-align:center"></div>' +
    '</div>' +
    '<label class="row" style="margin-bottom:16px"><input type="checkbox" id="nx-bw" style="width:20px">' +
      '<span class="small">Bodyweight movement (adds your bodyweight to the load)</span></label>' +
    '<button class="btn btn-primary btn-block" data-act="nx-save">Create exercise</button>';
  openSheet('New exercise', body);
}

/* ---------------------------------------------------------------- render -- */

function render() {
  var titles = { log: 'Log', week: 'This week', lifts: 'Lifts', more: 'Settings' };
  var subs = {
    log: 'what you did today',
    week: 'volume and sets',
    lifts: 'is it going up?',
    more: 'proverload',
  };
  $('#title').textContent = titles[view];
  var sub = $('#subtitle');
  sub.textContent = subs[view];
  sub.dataset.base = subs[view];
  sub.classList.remove('good');

  $('#head-action').innerHTML = view === 'log' && logDate !== todayKey()
    ? '<button class="btn btn-sm" data-act="today">Today</button>' : '';

  $('#main').innerHTML =
    view === 'log' ? viewLog() :
    view === 'week' ? viewWeek() :
    view === 'lifts' ? viewLifts() : viewMore();

  Array.prototype.forEach.call(document.querySelectorAll('nav button'), function (b) {
    b.classList.toggle('on', b.dataset.tab === view);
  });
  window.scrollTo(0, 0);
}

/* ---------------------------------------------------------------- events -- */

document.addEventListener('click', function (ev) {
  var el = ev.target.closest('[data-act],[data-tab]');
  if (!el) return;
  var a = el.dataset.act;

  if (el.dataset.tab) {
    view = el.dataset.tab;
    tap();
    render();
    return;
  }

  switch (a) {
    case 'day':
      logDate = addDays(logDate, parseInt(el.dataset.d, 10));
      render();
      break;
    case 'today':
      logDate = todayKey();
      render();
      break;
    case 'goto-day':
      logDate = el.dataset.date;
      view = 'log';
      render();
      break;
    case 'week':
      weekCursor = addDays(weekCursor, 7 * parseInt(el.dataset.d, 10));
      if (weekCursor > weekKey(todayKey())) weekCursor = weekKey(todayKey());
      render();
      break;

    case 'pick-ex':
      pickerQuery = '';
      tap();
      showPicker();
      break;

    case 'add-ex': {
      var ses = ensureSession(logDate);
      var exId = el.dataset.ex;
      var idx = -1;
      ses.entries.forEach(function (e, i) { if (e.exId === exId) idx = i; });
      if (idx < 0) {
        var last = exerciseHistory(S, exId)[0];
        var seed = last ? last.allSets.map(function (st) { return { w: st.w, r: 0 }; })
                        : [{ w: 0, r: 0 }, { w: 0, r: 0 }, { w: 0, r: 0 }];
        ses.entries.push({ exId: exId, sets: seed });
        idx = ses.entries.length - 1;
      }
      save();
      tap('heavy');
      closeSheet();
      render();
      showSetEditor(idx);
      break;
    }

    case 'open-ex':
      tap();
      showSetEditor(parseInt(el.dataset.i, 10));
      break;

    case 'set-add': {
      var e0 = sessionOn(logDate).entries[editIdx];
      var lastSet = e0.sets[e0.sets.length - 1];
      e0.sets.push(lastSet ? { w: lastSet.w, r: 0 } : { w: 0, r: 0 });
      save();
      showSetEditor(editIdx);
      break;
    }
    case 'set-del': {
      var e1 = sessionOn(logDate).entries[editIdx];
      e1.sets.splice(parseInt(el.dataset.k, 10), 1);
      save();
      showSetEditor(editIdx);
      break;
    }
    case 'set-warm': {
      var e2 = sessionOn(logDate).entries[editIdx];
      var st2 = e2.sets[parseInt(el.dataset.k, 10)];
      st2.warm = !st2.warm;
      save();
      showSetEditor(editIdx);
      break;
    }
    case 'ex-remove': {
      var ses3 = sessionOn(logDate);
      ses3.entries.splice(editIdx, 1);
      tidy(logDate);
      save();
      closeSheet();
      render();
      break;
    }

    case 'copy-last': {
      var prev = lastSessionBefore(logDate);
      if (!prev) break;
      var s4 = ensureSession(logDate);
      s4.entries = prev.entries.map(function (en) {
        return { exId: en.exId, sets: en.sets.filter(isWorking).map(function (st) {
          return { w: st.w, r: 0 }; }) };
      });
      save();
      tap('heavy');
      render();
      break;
    }

    case 'lift':
      showLift(el.dataset.ex);
      break;

    case 'unit':
      S.settings.unit = el.dataset.v;
      save();
      render();
      break;

    case 'new-ex':
      showNewExercise(pickerQuery.trim());
      break;

    case 'nx-save': {
      var name = $('#nx-name').value.trim();
      if (!name) { $('#nx-name').focus(); break; }
      var ex = {
        id: uid('ex'), name: name, primary: $('#nx-muscle').value, secondary: [],
        inc: num($('#nx-inc').value), repMin: parseInt($('#nx-min').value, 10) || 8,
        repMax: parseInt($('#nx-max').value, 10) || 12,
        bw: $('#nx-bw').checked, bwf: 1, archived: false,
      };
      S.exercises.push(ex);
      save();
      closeSheet();
      if (view === 'log') { pickerQuery = ''; showPicker(); } else render();
      break;
    }

    case 'preview':
      call('previewWidget', { family: el.dataset.f }).catch(function () {});
      break;
    case 'export':
      call('export').catch(function () {});
      break;
    case 'import':
      call('import').then(function (r) {
        if (r && r.state) { S = r.state; render(); }
      }).catch(function () {});
      break;

    case 'close-sheet':
      closeSheet();
      render();
      break;
    case 'sheet-bg':
      if (ev.target === el) { closeSheet(); render(); }
      break;
  }
});

document.addEventListener('input', function (ev) {
  var el = ev.target;
  var a = el.dataset.act;
  if (!a) return;

  if (a === 'picker-q') { pickerQuery = el.value; debounceRefreshPicker(); return; }
  if (a === 'lift-filter') { liftFilter = el.value; return; }

  if (a === 'set-w' || a === 'set-r') {
    var en = sessionOn(logDate).entries[editIdx];
    var st = en.sets[parseInt(el.dataset.k, 10)];
    if (a === 'set-w') st.w = num(el.value); else st.r = Math.round(num(el.value));
    save();
    return;
  }
  if (a === 'note') {
    var s = ensureSession(logDate);
    s.note = el.value;
    save();
    return;
  }
  if (a === 'bodyweight') { S.settings.bodyweight = num(el.value); save(); return; }
  if (a === 'target') {
    S.settings.targets = S.settings.targets || {};
    S.settings.targets[el.dataset.m] = Math.max(0, Math.round(num(el.value)));
    save();
    return;
  }
  if (a === 'ex-repmin' || a === 'ex-repmax' || a === 'ex-inc') {
    var ex = exById(el.dataset.ex);
    if (!ex) return;
    if (a === 'ex-inc') ex.inc = num(el.value);
    else if (a === 'ex-repmin') ex.repMin = Math.max(1, Math.round(num(el.value)));
    else ex.repMax = Math.max(1, Math.round(num(el.value)));
    save();
    return;
  }
});

var pickerTimer = null;
function debounceRefreshPicker() {
  clearTimeout(pickerTimer);
  pickerTimer = setTimeout(function () {
    var box = document.querySelector('[data-act="picker-q"]');
    var caret = box ? box.selectionStart : null;
    showPicker();
    var next = document.querySelector('[data-act="picker-q"]');
    if (next) { next.focus(); if (caret != null) next.setSelectionRange(caret, caret); }
  }, 180);
}

/* ------------------------------------------------------------------ boot -- */

call('load').then(function (r) {
  S = r.state;
  storageLabel = r.storage;
  render();
}).catch(function (e) {
  document.getElementById('main').innerHTML =
    '<div class="empty"><b>Could not load data</b>' + esc(e.message) + '</div>';
});

})();
