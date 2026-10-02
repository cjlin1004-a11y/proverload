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
  ['ab-coaster', 'Ab Coaster',             'core',    ['quads'],               0,   [12, 20], true, 0.35],
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
