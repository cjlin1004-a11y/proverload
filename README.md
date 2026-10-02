# Proverload

A progressive-overload tracker that runs entirely inside [Scriptable](https://scriptable.app) on iOS.
One script does two jobs:

- **Open it in the Scriptable app** → log a workout through a short series of native prompts
  (pick exercise, enter weight × reps per set, done).
- **Put it on your home screen** → a widget showing this week's volume, how it compares
  to last week, and which muscles still need sets.

The logging UI is deliberately plain — just `Alert` dialogs, no WebView — because those are
the most basic, reliable building block Scriptable has. A nicer HTML-based UI exists in
`src/ui/` and runs fine in a desktop browser (`npm run dev`), but WebView presentation was
unreliable on-device, so it isn't what ships to the phone right now.

Both read and write the same file, so the widget is always current — there is no sync step
and no server.

```
iCloud Drive / Scriptable / proverload/data.json
```

---

## Install

The Scriptable iCloud folder is already on this Mac, so:

```sh
npm run deploy
```

That builds `dist/Proverload.js` and copies it into `iCloud Drive → Scriptable`. Give iCloud a
minute and **Proverload** appears in the Scriptable app on your phone.

(If you'd rather do it by hand: open Scriptable → **+** → paste the contents of
`dist/Proverload.js` → name it `Proverload`.)

### Add the widget

1. Long-press the home screen → **+** → **Scriptable**.
2. Pick a size — all three work:
   - **Small** — volume, week-over-week change, 8-week sparkline.
   - **Medium** — adds per-muscle set progress and what to focus on next.
   - **Large** — every muscle group, a 9-week chart, and your recent lifts.
3. Add it, then long-press the widget → **Edit Widget** → **Script: Proverload**.
4. Set **When Interacting** to *Run Script* so tapping it opens the logger.

---

## Using it

Open **Proverload** in Scriptable. You get a menu:

- **Log today's workout** — pick an exercise (grouped by muscle, or create a new one),
  see what you lifted last time and a suggested target, then enter weight × reps per set,
  tapping "Save & add another set" until you're done with that exercise.
- **Week summary** — total volume load, change vs last week, and sets per muscle.
- **Lifts (est. 1RM)** — every exercise you've logged twice or more, with its estimated
  1RM and an arrow showing whether it's trending up.
- **Settings** — bodyweight (used for pull-ups, dips, push-ups) and units.

Every screen is one `Alert` at a time — tap through it like a short questionnaire. Data
saves after every exercise, so closing mid-session never loses what you already logged.

---

## The numbers, and why these ones

**Volume load = weight × reps, summed.** This is the thing you grow over time. If last
week was 24,000 kg and this week is 25,000 kg, you did more work — which is the actual
stimulus. A few percent per week is plenty when you're new; chasing more usually just
buys you fatigue.

**Hard sets per muscle per week.** For building muscle, this predicts growth better than
raw tonnage. 10–20 per muscle per week is the range most evidence points at. Start near
10 and add sets only when you're recovering fine. A set counts fully toward the muscle it
targets and half toward the ones assisting it, which is why bench press also credits your
triceps.

**Estimated 1RM** (Epley: `weight × (1 + reps/30)`). It puts 5×100 kg and 10×80 kg on the
same scale, so you can tell whether you're actually getting stronger or just changing rep
ranges. You never have to test a true max.

**Double progression** — the rule the app suggests for you. Keep the weight until *every*
working set hits the top of the rep range, then add the smallest jump and start again at
the bottom. Example with an 8–12 range at 60 kg: 12/11/10 → stay, 12/12/11 → stay,
12/12/12 → go to 62.5 kg and start over at 8. It's boring, and that's the point: it's
progressive overload you can't fudge.

One thing the numbers can't tell you: volume only counts if the reps are real. A set taken
to 2–3 reps short of failure with a full range of motion is worth more than two sloppy ones.

---

## Development

```sh
npm run build    # bundles src/ into dist/Proverload.js and dist/dev.html
npm run dev      # opens the HTML UI in a desktop browser (localStorage-backed)
npm test         # core maths + widget render + native Alert flow + HTML UI, all off-device
npm run deploy   # build, then copy dist/Proverload.js to iCloud Drive/Scriptable
```

```
src/core.js         pure logic — volume, e1RM, weekly rollups, progression rules.
                    Shared by the widget, the native app, and the HTML UI.
src/app.js          what ships to the phone: storage + widget rendering + the native
                    Alert-based app. This is the whole of dist/Proverload.js.
src/app.webview.js.bak   the previous WebView-based app.js, kept for reference —
                    not built or deployed.
src/ui/             the HTML/CSS/JS UI (index.html, styles.css, ui.js) plus
                    dev-bridge.js, a localStorage-backed shim used only by dist/dev.html.
build.js            inlines everything into the files above.
test/               run.js (widget render), native.js (scripted Alert taps through the
                    whole app), ui.js (the HTML UI against a stub DOM) — all under a
                    mocked Scriptable API, no device needed.
dist/Proverload.js  the build output that goes on your phone.
dist/dev.html       the HTML UI, servable locally for browser testing.
```

Edit the sources, not `dist/`. Every save writes `data.backup.json` next to the data file
first, so a bad write can't take your history with it. If `makeStore()` can't reach iCloud
Drive it falls back to on-device storage automatically, and any startup failure shows a
native alert with the real error — nothing fails silently.

`scriptable/` is an unrelated clone of [yaylinda/scriptable](https://github.com/yaylinda/scriptable)
kept around for reference.
