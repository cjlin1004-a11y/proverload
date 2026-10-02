// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: orange; icon-glyph: dumbbell;

/* =========================================================================
 * PROVERLOAD — progressive-overload tracker for Scriptable
 *
 *   Run it in the Scriptable app  -> log a workout via simple native prompts
 *   Put it on the home screen     -> weekly volume widget
 *
 * All data lives in ONE json file so the widget and the app read the same
 * source of truth:
 *   iCloud Drive / Scriptable / proverload/data.json   (local fallback)
 *
 * This deliberately uses only Alert dialogs — no WebView, no HTML/JS bridge —
 * because those are the most basic, reliable building blocks Scriptable has.
 * A richer WebView-based UI lives in src/ui/ (test it with `npm run dev`)
 * but isn't shipped to the phone yet.
 *
 * Generated from src/ by build.js — edit the sources, not this file.
 * ======================================================================= */

const DATA_DIR = 'proverload';
const DATA_FILE = 'data.json';
const ACCENT = '#FF9F45';
const GOOD = '#4ADE80';
const BAD = '#F87171';
const DIM = '#8A8F98';

/* =========================================================================
 * Proverload core — pure logic shared by the Scriptable side and the WebView UI.
 * No Scriptable APIs, no DOM APIs in here.
 * ======================================================================= */

const MUSCLES = [
  { id: 'chest',   name: 'Chest',      color: '#FF7A59' },
  { id: 'back',    name: 'Back',       color: '#4FA3FF' },
  { id: 'quads',   name: 'Quads',      color: '#9B7BFF' },
  { id: 'hams',    name: 'Hamstrings', color: '#5BD2F0' },
  { id: 'glutes',  name: 'Glutes',     color: '#FF6FB5' },
  { id: 'delts',   name: 'Shoulders',  color: '#FFC24B' },
  { id: 'biceps',  name: 'Biceps',     color: '#7AE7B9' },
  { id: 'triceps', name: 'Triceps',    color: '#65D59A' },
  { id: 'calves',  name: 'Calves',     color: '#C0A47A' },
  { id: 'core',    name: 'Core',       color: '#9AA3B2' },
];

const MUSCLE_NAME = MUSCLES.reduce((m, x) => (m[x.id] = x.name, m), {});
const MUSCLE_COLOR = MUSCLES.reduce((m, x) => (m[x.id] = x.color, m), {});

/* id, name, primary, secondary[], increment(kg), [repMin,repMax], bodyweight?, bwFactor */
const EXERCISE_SEED = [
  ['bench',      'Bench Press',            'chest',   ['triceps', 'delts'],    2.5, [5, 8]],
  ['db-bench',   'Dumbbell Bench Press',   'chest',   ['triceps', 'delts'],    2,   [8, 12]],
  ['inc-db',     'Incline DB Press',       'chest',   ['delts', 'triceps'],    2,   [8, 12]],
  ['pushup',     'Push-up',                'chest',   ['triceps', 'core'],     0,   [8, 20], true, 0.65],
  ['fly',        'Cable / Pec Fly',        'chest',   [],                      2.5, [10, 15]],
  ['dip',        'Dip',                    'chest',   ['triceps'],             2.5, [6, 12], true, 1],

  ['pullup',     'Pull-up',                'back',    ['biceps'],              2.5, [5, 10], true, 1],
  ['latpull',    'Lat Pulldown',           'back',    ['biceps'],              2.5, [8, 12]],
  ['row-bb',     'Barbell Row',            'back',    ['biceps'],              2.5, [6, 10]],
  ['row-db',     'Dumbbell Row',           'back',    ['biceps'],              2,   [8, 12]],
  ['row-cable',  'Seated Cable Row',       'back',    ['biceps'],              2.5, [8, 12]],
  ['facepull',   'Face Pull',              'delts',   ['back'],                2.5, [12, 20]],

  ['squat',      'Back Squat',             'quads',   ['glutes', 'hams'],      5,   [5, 8]],
  ['front-sq',   'Front Squat',            'quads',   ['glutes', 'core'],      5,   [5, 8]],
  ['legpress',   'Leg Press',              'quads',   ['glutes'],              5,   [8, 15]],
  ['lunge',      'Walking Lunge',          'quads',   ['glutes', 'hams'],      2,   [8, 12]],
  ['legext',     'Leg Extension',          'quads',   [],                      2.5, [10, 15]],

  ['deadlift',   'Deadlift',               'hams',    ['back', 'glutes'],      5,   [3, 6]],
  ['rdl',        'Romanian Deadlift',      'hams',    ['glutes', 'back'],      2.5, [8, 12]],
  ['legcurl',    'Leg Curl',               'hams',    [],                      2.5, [10, 15]],
  ['hipthrust',  'Hip Thrust',             'glutes',  ['hams'],                5,   [8, 12]],

  ['ohp',        'Overhead Press',         'delts',   ['triceps'],             2.5, [5, 8]],
  ['db-press',   'Seated DB Shoulder Press','delts',  ['triceps'],             2,   [8, 12]],
  ['latraise',   'Lateral Raise',          'delts',   [],                      1,   [12, 20]],
  ['reardelt',   'Rear Delt Fly',          'delts',   ['back'],                1,   [12, 20]],

  ['curl',       'Barbell / EZ Curl',      'biceps',  [],                      1.25,[8, 12]],
  ['db-curl',    'Dumbbell Curl',          'biceps',  [],                      1,   [8, 12]],
  ['hammer',     'Hammer Curl',            'biceps',  [],                      1,   [10, 15]],

  ['pushdown',   'Triceps Pushdown',       'triceps', [],                      2.5, [10, 15]],
  ['skull',      'Skullcrusher',           'triceps', [],                      1.25,[8, 12]],
  ['oh-ext',     'Overhead Triceps Ext.',  'triceps', [],                      1.25,[10, 15]],

  ['calf',       'Calf Raise',             'calves',  [],                      5,   [10, 20]],
  ['crunch',     'Cable Crunch',           'core',    [],                      2.5, [10, 15]],
  ['legraise',   'Hanging Leg Raise',      'core',    [],                      0,   [8, 15], true, 0.5],
];

function seedExercises() {
  return EXERCISE_SEED.map(function (e) {
    return {
      id: e[0], name: e[1], primary: e[2], secondary: e[3] || [],
      inc: e[4], repMin: e[5][0], repMax: e[5][1],
      bw: !!e[6], bwf: e[7] || 1, archived: false,
    };
  });
}

/* ---------------------------------------------------------------- state -- */

const DEFAULT_TARGET = 12;   // weekly hard sets per muscle (10-20 is the usual range)

function emptyState() {
  return {
    version: 1,
    settings: { unit: 'kg', bodyweight: 70, targets: {}, weekStartsMonday: true },
    exercises: seedExercises(),
    sessions: [],
  };
}

function migrate(raw) {
  const s = raw && typeof raw === 'object' ? raw : {};
  const base = emptyState();
  s.version = 1;
  s.settings = Object.assign(base.settings, s.settings || {});
  if (!Array.isArray(s.exercises) || !s.exercises.length) s.exercises = base.exercises;
  if (!Array.isArray(s.sessions)) s.sessions = [];
  s.sessions.forEach(function (ses) {
    if (!Array.isArray(ses.entries)) ses.entries = [];
    ses.entries.forEach(function (en) { if (!Array.isArray(en.sets)) en.sets = []; });
  });
  s.sessions.sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
  return s;
}

function uid(prefix) {
  return (prefix || 'x') + '-' + Date.now().toString(36) + '-' +
    Math.floor(Math.random() * 1e6).toString(36);
}

function exIndex(state) {
  return state.exercises.reduce(function (m, e) { return (m[e.id] = e, m); }, {});
}

function targetFor(state, muscleId) {
  const t = state.settings.targets || {};
  return typeof t[muscleId] === 'number' ? t[muscleId] : DEFAULT_TARGET;
}

/* ----------------------------------------------------------------- dates -- */

function parseDate(s) {
  const p = String(s).split('-').map(Number);
  return new Date(Date.UTC(p[0], p[1] - 1, p[2]));
}
function fmtDate(d) { return d.toISOString().slice(0, 10); }
function todayKey(now) {
  const d = now || new Date();
  return fmtDate(new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())));
}
function addDays(key, n) {
  const d = parseDate(key);
  d.setUTCDate(d.getUTCDate() + n);
  return fmtDate(d);
}
/** Monday-based week start for a YYYY-MM-DD key. */
function weekKey(dateKey) {
  const d = parseDate(dateKey);
  const shift = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - shift);
  return fmtDate(d);
}
function shortDate(key) {
  const d = parseDate(key);
  const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return MON[d.getUTCMonth()] + ' ' + d.getUTCDate();
}
function weekdayName(key) {
  return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][parseDate(key).getUTCDay()];
}
function daysBetween(a, b) {
  return Math.round((parseDate(b) - parseDate(a)) / 86400000);
}

/* ------------------------------------------------------------- mechanics -- */

/** Load actually moved by one set, accounting for bodyweight movements. */
function effWeight(ex, set, settings) {
  const added = Number(set.w) || 0;
  if (ex && ex.bw) return (Number(settings.bodyweight) || 0) * (ex.bwf || 1) + added;
  return added;
}
function isWorking(set) { return !set.warm && (Number(set.r) || 0) > 0; }

/** Volume load = weight x reps. The number you grow week over week. */
function setVolume(ex, set, settings) {
  if (!isWorking(set)) return 0;
  return effWeight(ex, set, settings) * (Number(set.r) || 0);
}

/** Epley estimated 1-rep max — lets you compare 5x100 against 10x80. */
function e1rm(ex, set, settings) {
  if (!isWorking(set)) return 0;
  const r = Number(set.r) || 0;
  if (r > 15) return 0;                       // estimate gets unreliable past ~15
  return effWeight(ex, set, settings) * (1 + r / 30);
}

function sessionTotals(session, exs, settings) {
  let volume = 0, sets = 0, reps = 0;
  const byMuscle = {};
  (session.entries || []).forEach(function (en) {
    const ex = exs[en.exId];
    if (!ex) return;
    en.sets.forEach(function (st) {
      if (!isWorking(st)) return;
      const v = setVolume(ex, st, settings);
      volume += v; sets += 1; reps += Number(st.r) || 0;
      /* A set counts fully toward the muscle it targets, half toward helpers. */
      byMuscle[ex.primary] = (byMuscle[ex.primary] || 0) + 1;
      (ex.secondary || []).forEach(function (m) {
        byMuscle[m] = (byMuscle[m] || 0) + 0.5;
      });
    });
  });
  return { volume: volume, sets: sets, reps: reps, byMuscle: byMuscle };
}

/** Rolling weekly summary, oldest first, always `count` buckets ending this week. */
function weeklyRollup(state, count, endWeek) {
  const exs = exIndex(state);
  const end = endWeek || weekKey(todayKey());
  const weeks = [];
  for (let i = count - 1; i >= 0; i--) weeks.push(addDays(end, -7 * i));
  const buckets = weeks.reduce(function (m, w) {
    m[w] = { week: w, volume: 0, sets: 0, sessions: 0, byMuscle: {} };
    return m;
  }, {});
  state.sessions.forEach(function (ses) {
    const b = buckets[weekKey(ses.date)];
    if (!b) return;
    const t = sessionTotals(ses, exs, state.settings);
    if (!t.sets) return;
    b.volume += t.volume; b.sets += t.sets; b.sessions += 1;
    Object.keys(t.byMuscle).forEach(function (m) {
      b.byMuscle[m] = (b.byMuscle[m] || 0) + t.byMuscle[m];
    });
  });
  return weeks.map(function (w) { return buckets[w]; });
}

/** Every logged instance of one exercise, newest first. */
function exerciseHistory(state, exId) {
  const ex = exIndex(state)[exId];
  if (!ex) return [];
  const out = [];
  state.sessions.forEach(function (ses) {
    (ses.entries || []).forEach(function (en) {
      if (en.exId !== exId) return;
      const working = en.sets.filter(isWorking);
      if (!working.length) return;
      let volume = 0, best = 0, topSet = null;
      working.forEach(function (st) {
        volume += setVolume(ex, st, state.settings);
        const e = e1rm(ex, st, state.settings);
        if (e > best) { best = e; topSet = st; }
      });
      out.push({
        date: ses.date, sets: working.length, volume: volume,
        e1rm: best, topSet: topSet, allSets: working,
      });
    });
  });
  out.sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
  return out;
}

/**
 * Double progression: hold the weight until every working set hits the top of
 * the rep range, then add the smallest increment and drop back to the bottom.
 * This is the concrete "progressive overload" rule a beginner can just follow.
 */
function suggestNext(state, exId) {
  const ex = exIndex(state)[exId];
  if (!ex) return null;
  const hist = exerciseHistory(state, exId);
  if (!hist.length) {
    return { kind: 'first', text: 'First time — pick a weight you can control for ' +
      ex.repMin + '-' + ex.repMax + ' reps, and log it.' };
  }
  const last = hist[0];
  const sets = last.allSets;
  const topWeightSets = sets.filter(function (s) { return (Number(s.w) || 0) === (Number(sets[0].w) || 0); });
  const cleared = topWeightSets.length >= 2 &&
    topWeightSets.every(function (s) { return (Number(s.r) || 0) >= ex.repMax; });
  const w = Number(sets[0].w) || 0;
  if (cleared && ex.inc > 0) {
    return {
      kind: 'weight', weight: w + ex.inc, reps: ex.repMin,
      text: 'Add weight: ' + fmtWeight(w + ex.inc, state.settings.unit) + ' x ' + ex.repMin +
        ' (you cleared ' + ex.repMax + ' reps on every set).',
    };
  }
  const weakest = sets.reduce(function (a, s) {
    return (Number(s.r) || 0) < (Number(a.r) || 0) ? s : a;
  }, sets[0]);
  const targetReps = Math.min(ex.repMax, (Number(weakest.r) || 0) + 1);
  return {
    kind: 'reps', weight: w, reps: targetReps,
    text: 'Same weight ' + fmtWeight(w, state.settings.unit) + ' — beat ' +
      (Number(weakest.r) || 0) + ' reps (aim ' + targetReps + ', all sets to ' + ex.repMax + ').',
  };
}

/** Personal records: best estimated 1RM and best single-session volume. */
function personalRecords(state) {
  const out = [];
  state.exercises.forEach(function (ex) {
    const hist = exerciseHistory(state, ex.id);
    if (!hist.length) return;
    let bestE = 0, bestDate = null, bestVol = 0;
    hist.forEach(function (h) {
      if (h.e1rm > bestE) { bestE = h.e1rm; bestDate = h.date; }
      if (h.volume > bestVol) bestVol = h.volume;
    });
    const prev = hist.length > 1 ? hist[1] : null;
    out.push({
      exId: ex.id, name: ex.name, muscle: ex.primary,
      e1rm: bestE, e1rmDate: bestDate, bestVolume: bestVol,
      last: hist[0], prev: prev, sessions: hist.length,
      trend: prev ? hist[0].e1rm - prev.e1rm : 0,
      isFreshPR: bestDate === hist[0].date && hist.length > 1,
    });
  });
  out.sort(function (a, b) { return b.last.date < a.last.date ? -1 : b.last.date > a.last.date ? 1 : 0; });
  return out;
}

/** Headline numbers for the widget and the Week tab. */
function weekSummary(state) {
  const roll = weeklyRollup(state, 9);
  const cur = roll[roll.length - 1];
  const prev = roll[roll.length - 2];
  const delta = prev && prev.volume > 0 ? (cur.volume - prev.volume) / prev.volume : null;
  const muscles = MUSCLES.map(function (m) {
    const sets = cur.byMuscle[m.id] || 0;
    const target = targetFor(state, m.id);
    return { id: m.id, name: m.name, color: m.color, sets: sets, target: target,
             pct: target > 0 ? sets / target : 0 };
  }).filter(function (m) { return m.sets > 0 || m.target > 0; });
  const lagging = muscles.filter(function (m) { return m.sets < m.target; })
    .sort(function (a, b) { return a.pct - b.pct; });
  return {
    week: cur.week, volume: cur.volume, sets: cur.sets, sessions: cur.sessions,
    prevVolume: prev ? prev.volume : 0, delta: delta,
    history: roll, muscles: muscles, lagging: lagging,
  };
}

/* ------------------------------------------------------------ formatting -- */

function fmtVolume(v, unit) {
  if (!v) return '0';
  if (v >= 100000) return Math.round(v / 1000) + 'k';
  if (v >= 10000) return (v / 1000).toFixed(1) + 'k';
  return String(Math.round(v));
}
function fmtWeight(w, unit) {
  const n = Math.round((Number(w) || 0) * 10) / 10;
  return (n % 1 === 0 ? String(n) : n.toFixed(1)) + (unit || 'kg');
}
function fmtPct(p) {
  if (p === null || p === undefined) return '—';
  const v = Math.round(p * 100);
  return (v > 0 ? '+' : '') + v + '%';
}
function fmtSets(n) {
  return (Math.round(n * 2) / 2).toString().replace(/\.0$/, '');
}


/* ======================================================================== */
/* Storage                                                                  */
/* ======================================================================== */

function makeStore() {
  let fm, dir, path;
  try {
    fm = FileManager.iCloud();
    fm.documentsDirectory();
    dir = fm.joinPath(fm.documentsDirectory(), DATA_DIR);
    if (!fm.fileExists(dir)) fm.createDirectory(dir, true);
    path = fm.joinPath(dir, DATA_FILE);
  } catch (e) {
    // iCloud Drive unavailable/not enabled for Scriptable — fall back to
    // local, on-device storage rather than letting the script die silently.
    console.error('Proverload: iCloud storage unavailable, using local — ' + e);
    fm = FileManager.local();
    dir = fm.joinPath(fm.documentsDirectory(), DATA_DIR);
    if (!fm.fileExists(dir)) fm.createDirectory(dir, true);
    path = fm.joinPath(dir, DATA_FILE);
  }

  return {
    fm: fm,
    dir: dir,
    path: path,
    read: function () {
      if (!fm.fileExists(path)) return migrate(emptyState());
      try {
        if (fm.isFileStoredIniCloud && fm.isFileStoredIniCloud(path) && !fm.isFileDownloaded(path)) {
          fm.downloadFileFromiCloud(path);
        }
        return migrate(JSON.parse(fm.readString(path)));
      } catch (e) {
        console.error('Proverload: could not read data file — ' + e);
        return migrate(emptyState());
      }
    },
    write: function (state) {
      const backup = fm.joinPath(dir, 'data.backup.json');
      if (fm.fileExists(path)) {
        try { fm.writeString(backup, fm.readString(path)); } catch (e) {}
      }
      fm.writeString(path, JSON.stringify(state));
    },
  };
}

/* ======================================================================== */
/* Widget                                                                   */
/* ======================================================================== */

/* Conservative content widths (widget size minus our own padding), sized to
 * the SMALLEST widget dimensions seen across current iPhones, with extra
 * margin on top. Every row below is pinned to one of these widths explicitly
 * — nothing is left to infer its size from text content — so long exercise
 * names, translated unit labels, etc. clip/shrink instead of pushing the
 * layout past the frame. Better a few points of unused margin on a big
 *-screen phone than clipped content on a small one. */
const PAD = 12;
const SAFE_W = { small: 110, medium: 260, large: 260 };
const COL_GAP = 12;

function col(hex) { return new Color(hex); }

/** Hard length cap for user-entered names shown in the widget's tight rows. */
function clip(s, max) {
  s = String(s || '');
  return s.length > max ? s.slice(0, Math.max(1, max - 1)) + '…' : s;
}

/** Sparkline of weekly volume, most recent bar highlighted. */
function volumeChart(weeks, width, height) {
  const dc = new DrawContext();
  dc.size = new Size(width, height);
  dc.opaque = false;
  dc.respectScreenScale = true;
  const max = Math.max.apply(null, weeks.map(function (w) { return w.volume; }).concat([1]));
  const gap = 3;
  const bw = (width - gap * (weeks.length - 1)) / weeks.length;
  weeks.forEach(function (w, i) {
    const h = Math.max(2, (w.volume / max) * height);
    const x = i * (bw + gap);
    const last = i === weeks.length - 1;
    dc.setFillColor(new Color(last ? ACCENT : '#FFFFFF', last ? 1 : 0.22));
    dc.fillRect(new Rect(x, height - h, bw, h));
  });
  return dc.getImage();
}

/** Horizontal stack pinned to an exact width, so children can never push it
 * wider than the frame — the one thing that actually prevents overflow. */
function fixedRow(parent, width, height) {
  const row = parent.addStack();
  row.size = new Size(width, height || 0);
  row.layoutHorizontally();
  row.centerAlignContent();
  return row;
}

function addBar(stack, pct, width, height, color) {
  const track = fixedRow(stack, width, height);
  track.backgroundColor = new Color('#FFFFFF', 0.13);
  track.cornerRadius = height / 2;
  const fill = track.addStack();
  fill.size = new Size(Math.max(height, Math.min(1, pct) * width), height);
  fill.backgroundColor = new Color(color, pct >= 1 ? 1 : 0.85);
  fill.cornerRadius = height / 2;
  track.addSpacer();
}

/** Text that always respects the width it's given: one line, shrinks rather
 * than wraps or overflows. */
function label(stack, text, size, color, opts) {
  const t = stack.addText(text);
  t.font = (opts && opts.bold) ? Font.boldRoundedSystemFont(size)
         : (opts && opts.medium) ? Font.mediumSystemFont(size)
         : Font.systemFont(size);
  t.textColor = col(color);
  t.lineLimit = (opts && opts.lines) || 1;
  t.minimumScaleFactor = (opts && opts.minScale) || 0.75;
  return t;
}

function buildWidget(state, family) {
  const w = new ListWidget();
  const g = new LinearGradient();
  g.colors = [new Color('#14161A'), new Color('#0B0C0E')];
  g.locations = [0, 1];
  w.backgroundGradient = g;
  w.setPadding(PAD, PAD, PAD, PAD);
  w.url = 'scriptable:///run/' + encodeURIComponent(Script.name());

  const s = weekSummary(state);
  const unit = state.settings.unit || 'kg';
  const small = family === 'small';
  const W = SAFE_W[family] || SAFE_W.medium;

  if (!state.sessions.length) {
    const empty = w.addStack();
    empty.layoutVertically();
    empty.size = new Size(W, 0);
    label(empty, 'PROVERLOAD', 10, ACCENT, { bold: true });
    empty.addSpacer(6);
    label(empty, 'No sessions yet', 16, '#FFFFFF', { bold: true });
    empty.addSpacer(3);
    const t = empty.addText('Tap to open the app and log your first workout.');
    t.font = Font.systemFont(12);
    t.textColor = col(DIM);
    t.lineLimit = 3;
    t.minimumScaleFactor = 0.85;
    w.addSpacer();
    return w;
  }

  /* --- header ------------------------------------------------------- */
  const head = fixedRow(w, W);
  label(head, 'WEEK OF ' + shortDate(s.week).toUpperCase(), 9, DIM, { medium: true });
  head.addSpacer();
  if (!small) label(head, s.sessions + ' session' + (s.sessions === 1 ? '' : 's'), 9, DIM, { medium: true });

  w.addSpacer(small ? 5 : 2);
  w.addSpacer();

  /* --- headline volume ---------------------------------------------- */
  const big = fixedRow(w, W);
  big.bottomAlignContent();
  label(big, fmtVolume(s.volume, unit), 26, '#FFFFFF', { bold: true, minScale: 0.5 });
  big.addSpacer(4);
  label(big, unit + ' moved', 12, DIM, { medium: true, minScale: 0.8 });
  big.addSpacer();

  const sub = fixedRow(w, W);
  if (s.delta === null) {
    label(sub, 'first week tracked', 11, DIM);
  } else {
    const up = s.delta >= 0;
    label(sub, (up ? '▲ ' : '▼ ') + fmtPct(s.delta), 12, up ? GOOD : BAD, { bold: true });
    sub.addSpacer(5);
    label(sub, 'vs last week', 11, DIM);
  }
  sub.addSpacer();
  if (!small) label(sub, fmtSets(s.sets) + ' hard sets', 11, DIM, { medium: true });

  w.addSpacer(small ? 5 : 2);
  w.addSpacer();

  if (small) {
    w.addImage(volumeChart(s.history.slice(-8), W, 25)).imageSize = new Size(W, 25);
    w.addSpacer(2);
    const lag = s.lagging[0];
    if (lag) {
      const row = fixedRow(w, W);
      label(row, clip(lag.name, 13), 11, ACCENT, { medium: true });
      row.addSpacer();
      label(row, fmtSets(lag.sets) + '/' + lag.target, 11, ACCENT, { bold: true });
    }
    w.addSpacer();
    return w;
  }

  /* --- medium / large: muscle progress ------------------------------ */
  const body = fixedRow(w, W);
  body.topAlignContent(); // columns are unequal height — override fixedRow's center align
  body.spacing = COL_GAP;

  const leftW = family === 'large' ? W : Math.round(W * 0.58);
  const left = body.addStack();
  left.layoutVertically();
  left.size = new Size(leftW, 0);

  // Medium is exactly as tall as small (WidgetKit gives them the same
  // height, just different widths) so it only gets 3 rows despite the
  // wider frame; large gets 8 of the 10 muscles, not all — between the
  // header, big number and bottom strip, 10 full rows doesn't fit either.
  const rows = family === 'large' ? 8 : 3;
  const rowH = family === 'large' ? 11 : 9;
  const barH = 4;
  const rowGap = family === 'large' ? 3 : 3;
  const ranked = s.muscles.slice().sort(function (a, b) {
    return (b.sets - a.sets) || (b.target - a.target);
  }).slice(0, rows);

  ranked.forEach(function (m, i) {
    if (i) left.addSpacer(rowGap);
    const row = fixedRow(left, leftW, rowH);
    label(row, clip(m.name, family === 'large' ? 16 : 12), 10, '#D8DBE0', { medium: true });
    row.addSpacer();
    label(row, fmtSets(m.sets) + '/' + m.target, 10, m.sets >= m.target ? GOOD : DIM, { bold: true });
    left.addSpacer(2);
    addBar(left, m.pct, leftW, barH, m.color);
  });

  if (family !== 'large') {
    // Medium's frame is too short for a second stacked chart here — the
    // header row's own delta-vs-last-week already carries the trend, so
    // this column stays to one focused callout instead.
    const rightW = W - leftW - COL_GAP;
    const right = body.addStack();
    right.layoutVertically();
    right.size = new Size(rightW, 0);

    const lag = s.lagging[0];
    if (lag) {
      label(right, 'FOCUS NEXT', 8, DIM, { medium: true });
      right.addSpacer(3);
      label(right, clip(lag.name, 14), 12, ACCENT, { bold: true });
      right.addSpacer(1);
      label(right, '+' + fmtSets(lag.target - lag.sets) + ' sets', 10, DIM);
    } else {
      label(right, 'All muscles', 12, GOOD, { bold: true });
      label(right, 'on target', 10, DIM);
    }
  }

  if (family === 'large') {
    w.addSpacer(5);
    w.addSpacer();
    const strip = fixedRow(w, W, 0);
    strip.topAlignContent();
    strip.spacing = COL_GAP;
    const halfW = Math.round((W - COL_GAP) / 2);

    const chartCol = strip.addStack();
    chartCol.layoutVertically();
    chartCol.size = new Size(halfW, 0);
    label(chartCol, 'LAST 9 WKS', 8, DIM, { medium: true });
    chartCol.addSpacer(4);
    chartCol.addImage(volumeChart(s.history, halfW, 30)).imageSize = new Size(halfW, 30);

    const prCol = strip.addStack();
    prCol.layoutVertically();
    prCol.size = new Size(halfW, 0);
    label(prCol, 'RECENT LIFTS', 8, DIM, { medium: true });
    prCol.addSpacer(4);
    personalRecords(state).slice(0, 3).forEach(function (p, i) {
      if (i) prCol.addSpacer(2);
      const r = fixedRow(prCol, halfW, 11);
      label(r, clip(p.name, 14), 10, '#D8DBE0');
      r.addSpacer(4);
      label(r, fmtWeight(p.e1rm, unit), 10, p.isFreshPR ? GOOD : DIM, { bold: true });
    });
  }

  w.addSpacer();
  w.refreshAfterDate = new Date(Date.now() + 30 * 60 * 1000);
  return w;
}

/* ======================================================================== */
/* App (native Alert UI)                                                    */
/* ======================================================================== */

/** Muscle picker for a brand new exercise — plain action sheet, no text field. */
async function pickMuscle(promptTitle) {
  const a = new Alert();
  a.title = promptTitle;
  MUSCLES.forEach(function (m) { a.addAction(m.name); });
  a.addCancelAction('Cancel');
  const idx = await a.presentSheet();
  return idx >= 0 && idx < MUSCLES.length ? MUSCLES[idx] : null;
}

async function createExercise(state, name) {
  const muscle = await pickMuscle('Main muscle for "' + name + '"');
  if (!muscle) return null;
  const ex = {
    id: uid('ex'), name: name, primary: muscle.id, secondary: [],
    inc: 2.5, repMin: 8, repMax: 12, bw: false, bwf: 1, archived: false,
  };
  state.exercises.push(ex);
  return ex;
}

/**
 * Exercise picker: one action-sheet Alert listing every exercise grouped by
 * muscle, plus a "new exercise" entry. Kept free of text fields so iOS can
 * render it as a proper scrollable sheet even with 30+ options.
 */
async function pickExercise(state) {
  const exs = state.exercises.filter(function (e) { return !e.archived; });
  const sheet = new Alert();
  sheet.title = 'Pick exercise';
  const order = [];
  MUSCLES.forEach(function (m) {
    exs.filter(function (e) { return e.primary === m.id; }).forEach(function (e) {
      sheet.addAction(m.name + ' — ' + e.name);
      order.push(e.id);
    });
  });
  sheet.addAction('+ New exercise…');
  order.push(null);
  sheet.addCancelAction('Cancel');
  const idx = await sheet.presentSheet();
  if (idx < 0 || idx >= order.length) return null;
  if (order[idx] !== null) return exs.filter(function (e) { return e.id === order[idx]; })[0];

  const nameAlert = new Alert();
  nameAlert.title = 'New exercise name';
  nameAlert.addTextField('e.g. Incline DB Press', '');
  nameAlert.addAction('Next: pick muscle');
  nameAlert.addCancelAction('Cancel');
  if ((await nameAlert.presentAlert()) === -1) return null;
  const name = nameAlert.textFieldValue(0).trim();
  return name ? createExercise(state, name) : null;
}

/** One Alert per set — two text fields, loop until "finish" or cancel. */
async function enterSets(exName, unit, lastWeight) {
  const sets = [];
  while (true) {
    const a = new Alert();
    a.title = 'Set ' + (sets.length + 1) + ' — ' + exName;
    a.addTextField('Weight (' + unit + ')', sets.length ? String(sets[sets.length - 1].w) : (lastWeight != null ? String(lastWeight) : ''));
    a.addTextField('Reps', '');
    a.addAction('Save & add another set');
    a.addAction('Save & finish exercise');
    a.addCancelAction(sets.length ? 'Stop (keep sets so far)' : 'Cancel');
    const choice = await a.presentAlert();
    if (choice === -1) break;
    const w = parseFloat(a.textFieldValue(0));
    const r = Math.round(parseFloat(a.textFieldValue(1)));
    if (r > 0) sets.push({ w: isFinite(w) ? w : 0, r: r });
    if (choice === 1) break;
  }
  return sets;
}

async function logFlow(store) {
  const state = store.read();
  const ex = await pickExercise(state);
  if (!ex) return;
  const unit = state.settings.unit || 'kg';
  const hist = exerciseHistory(state, ex.id);
  const sug = suggestNext(state, ex.id);

  const info = new Alert();
  info.title = ex.name;
  info.message = (sug ? sug.text : '') +
    (hist.length ? '\n\nLast time (' + shortDate(hist[0].date) + '): ' +
      hist[0].allSets.map(function (s) { return fmtWeight(s.w, unit) + '×' + s.r; }).join(', ') :
      '\n\nFirst time logging this — pick a weight you can control for ' + ex.repMin + '-' + ex.repMax + ' reps.');
  info.addAction('Start logging sets');
  info.addCancelAction('Cancel');
  if ((await info.presentAlert()) === -1) return;

  const lastW = hist.length ? hist[0].allSets[0].w : null;
  const sets = await enterSets(ex.name, unit, lastW);
  if (!sets.length) return;

  const today = todayKey();
  let ses = state.sessions.filter(function (s) { return s.date === today; })[0];
  if (!ses) { ses = { id: uid('s'), date: today, entries: [], note: '' }; state.sessions.push(ses); }
  let entry = ses.entries.filter(function (en) { return en.exId === ex.id; })[0];
  if (!entry) { entry = { exId: ex.id, sets: [] }; ses.entries.push(entry); }
  entry.sets = entry.sets.concat(sets);
  state.sessions.sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
  store.write(state);

  const vol = sets.reduce(function (sum, s) { return sum + setVolume(ex, s, state.settings); }, 0);
  const done = new Alert();
  done.title = 'Saved';
  done.message = sets.length + ' set' + (sets.length === 1 ? '' : 's') + ' · ' +
    fmtVolume(vol) + ' ' + unit + ' added to today.';
  done.addAction('OK');
  await done.presentAlert();
}

async function weekFlow(store) {
  const state = store.read();
  const sum = weekSummary(state);
  const unit = state.settings.unit || 'kg';
  const lines = [];
  lines.push('Week of ' + shortDate(sum.week));
  lines.push(fmtVolume(sum.volume) + ' ' + unit + ' · ' + fmtSets(sum.sets) + ' hard sets · ' +
    sum.sessions + ' session' + (sum.sessions === 1 ? '' : 's'));
  if (sum.delta !== null) lines.push((sum.delta >= 0 ? '▲ ' : '▼ ') + fmtPct(sum.delta) + ' vs last week');
  if (sum.muscles.length) {
    lines.push('');
    lines.push('Sets per muscle:');
    sum.muscles.slice().sort(function (a, b) { return b.sets - a.sets; }).forEach(function (m) {
      lines.push('  ' + m.name + ': ' + fmtSets(m.sets) + '/' + m.target + (m.sets >= m.target ? ' ✓' : ''));
    });
  }
  const a = new Alert();
  a.title = 'This week';
  a.message = sum.sets ? lines.join('\n') : 'Nothing logged yet this week.';
  a.addAction('OK');
  await a.presentAlert();
}

async function liftsFlow(store) {
  const state = store.read();
  const unit = state.settings.unit || 'kg';
  const prs = personalRecords(state).slice(0, 18);
  const a = new Alert();
  a.title = 'Lifts — estimated 1RM';
  a.message = prs.length
    ? prs.map(function (p) {
        const arrow = p.trend > 0.05 ? '▲' : p.trend < -0.05 ? '▼' : '–';
        return p.name + ': ' + fmtWeight(p.e1rm, unit) + ' ' + arrow;
      }).join('\n')
    : 'Log an exercise at least twice to see trends here.';
  a.addAction('OK');
  await a.presentAlert();
}

async function settingsFlow(store) {
  const state = store.read();
  const a = new Alert();
  a.title = 'Settings';
  a.message = 'Bodyweight is used for pull-ups, dips and push-ups.';
  a.addTextField('Bodyweight', String(state.settings.bodyweight || 70));
  a.addAction('Save as kg');
  a.addAction('Save as lb');
  a.addCancelAction('Cancel');
  const choice = await a.presentAlert();
  if (choice === -1) return;
  const bw = parseFloat(a.textFieldValue(0));
  if (isFinite(bw)) state.settings.bodyweight = bw;
  state.settings.unit = choice === 0 ? 'kg' : 'lb';
  store.write(state);
}

async function mainMenu(store) {
  while (true) {
    const state = store.read();
    const sum = weekSummary(state);
    const unit = state.settings.unit || 'kg';
    const a = new Alert();
    a.title = 'Proverload';
    a.message = sum.sets
      ? 'This week: ' + fmtVolume(sum.volume) + ' ' + unit + ' · ' + fmtSets(sum.sets) + ' hard sets' +
        (sum.delta !== null ? '\n' + (sum.delta >= 0 ? '▲ ' : '▼ ') + fmtPct(sum.delta) + ' vs last week' : '')
      : 'No sessions logged yet — start with "Log today’s workout".';
    a.addAction('Log today’s workout');
    a.addAction('Week summary');
    a.addAction('Lifts (est. 1RM)');
    a.addAction('Settings');
    a.addCancelAction('Close');
    const choice = await a.presentAlert();
    if (choice === -1) break;
    if (choice === 0) await logFlow(store);
    else if (choice === 1) await weekFlow(store);
    else if (choice === 2) await liftsFlow(store);
    else if (choice === 3) await settingsFlow(store);
  }
}

/* ======================================================================== */
/* Entry point                                                              */
/* ======================================================================== */

async function fail(where, e) {
  console.error('Proverload: ' + where + ' failed — ' + e);
  try {
    const a = new Alert();
    a.title = 'Proverload failed to open';
    a.message = where + ':\n' + String((e && e.stack) || (e && e.message) || e);
    a.addAction('OK');
    await a.presentAlert();
  } catch (e2) {
    // even Alert failed — nothing more we can do but log it
    console.error('Proverload: could not even show the failure alert — ' + e2);
  }
}

async function main() {
  if (config.runsInWidget || config.runsInAccessoryWidget) {
    // Widgets can't show an Alert, so let a failure surface as Scriptable's
    // normal error log rather than swallowing it.
    const store = makeStore();
    const state = store.read();
    const family = config.runsInAccessoryWidget ? 'small' : (config.widgetFamily || args.widgetParameter || 'medium');
    Script.setWidget(buildWidget(state, family));
  } else {
    try {
      const store = makeStore();
      await mainMenu(store);
    } catch (e) {
      // Covers makeStore() failing (e.g. iCloud Drive unavailable) as well
      // as anything else going wrong — either way, something visible shows
      // up instead of a blank screen.
      await fail('startup', e);
    }
  }
  Script.complete();
}

try {
  await main();
} catch (e) {
  await fail('main', e);
  Script.complete();
}
