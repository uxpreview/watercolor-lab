# Handoff — Watercolor Lab (EXP-041)

For the next working session, starting fresh on a local desktop clone.
Read this top to bottom before writing code; the README is the public story,
`docs/session-log.md` is the engineering log, and this file is the state of
play and the queue.

## Where things stand

- **Branch**: `main` holds PR #1 (the simulator + feature pass 1) and PR #2
  (this doc). Later work is on short-lived branches off `main`, one PR each.
- **Tests**: `npm test` = 325 checks, all passing. `npm run typecheck` clean.
  `npm run build` runs `tsc` first and refuses to emit on a type error.
- **Hosting**: Vercel project `watercolor-lab` (team `ryankm`) is
  git-connected to `uxpreview/miniature-spork`; `main` deploys to production,
  every PR gets a preview URL. Custom domain `watercolor.ryankm.com` is
  attached to the project and waits on DNS (see next steps). The old
  `fable-test` scratch project is disposable.
- **Local desktop**: `/Users/ryan/Developer/miniature-spork` on Ryan's Mac.
  Chrome is installed, the figure harness uses it (real GPU).

## Start here

```
git checkout claude/sudoaquarelle-ryankm-experience-h8mzty   # or main, once PR #1 merges
npm install
npm run dev        # http://localhost:5173
npm test && npm run typecheck
```

Node 20+. No runtime dependencies; dev deps are vite, typescript, esbuild
(test bundler) and playwright-core (headless figures).

**Branch discipline**: once PR #1 merges, new work starts on a **new branch
off `main`** and gets its own PR — do not stack commits on the merged branch.

## What this codebase is

A physically-based watercolor simulator (Curtis et al. SIGGRAPH 1997 +
Kubelka-Munk optics) as WebGL2 fragment shaders, wrapped in the ryankm.com
Lab conventions. The architecture decisions and their rejected alternatives
are recorded in `docs/session-log.md` — read it before changing physics.
The short version:

- `src/paint/` — KM maths (`km.ts` holds the TS **and** the GLSL twin; keep
  them in lockstep), pigment library, mixing well arithmetic, brush kinematics.
- `src/engine/` — GL plumbing, all simulation passes as GLSL strings
  (`shaders.ts`), the pass orchestrator (`simulation.ts`), paper generation.
- `src/ui/` — palette, mixing well, studio wiring (`app.ts`), site chrome.
- `src/data/` — IndexedDB persistence of the dried layer.
- `scripts/` — data-driven scripted scenes + headless screenshot harness.

Two invariants worth protecting:

1. **Conservation**: the two transfer passes compute the identical exchange
   from identical pre-swap inputs (one writes the suspension side, one the
   deposit side). If you touch `TRANSFER_COMMON`, both sides move together.
2. **Chips are physics**: every swatch in the UI renders through the same KM
   maths as the paint. Never draw a hex swatch.

## The headless figure harness

`npm run figures` regenerates every README image by driving the real app in
headless Chromium (scripted strokes via `window.__wash`, scenes in
`scripts/scenes.mjs`). It was built inside a GPU-less container under
SwiftShader, hence the machinery: `?sim=WxH` and `?seed=N` URL params, a
worker pool, 10-minute timeouts. **On a desktop with a real GPU none of that
pain applies** — `scripts/browser.mjs` launches the installed Chrome when the
container binary is absent (`PW_CHROMIUM=…` overrides), and a scene that took
4 minutes renders in ~24 s, so always regenerate figures at full resolution
(1056×704, the default) after any physics/tuning change. Lesson already learned the hard way: never judge
renders at reduced resolution.

## Next steps (the queue)

In priority order:

1. **DNS** (needs Ryan): in Squarespace DNS add CNAME `watercolor` →
   `cname.vercel-dns.com`. Vercel verifies on its own once the record is
   live. Then sanity-check the live site on desktop + phone; confirm the
   vendored Figtree woff2 loads (the throwaway preview substituted Google
   Fonts because the file-push deploy couldn't carry binaries — the git
   deploy needs no such workaround).

2. **Feature pass 2** (X-ray and pigment cards approved and built; the rest
   still to confirm with Ryan one at a time). Candidates, with the intended
   angle:
   - ~~**X-ray view**~~ — done (PR #5): `XRAY_FRAG`, `Simulation.render(backlight, xray)`,
     the X-ray box in the rail, `__wash.setXray(0–6)` for scripts.
   - ~~**Pigment detail cards**~~ — done (PR #6): hold or right-click a pan;
     `pigmentFacts` / `handlingSentence` in `pigments.ts`, card in `palette.ts`.
   - **Alcohol technique**: the inverse of salt — a droplet that *pushes*
     pigment outward (surfactant ring). Same splat-into-cap-channel pattern
     as salt; needs a free channel or packing.
   - **FILM (timelapse export)**: record canvas frames during painting,
     export WebM via MediaRecorder. Watch memory on phones.

3. **Layout** (PR #7): the controls are a bench under the sheet, sized by
   `layoutSheet()` in `app.ts`: on a wide desk (≥1180px) and on a phone the
   sheet is as wide as the bench (Ryan's call, PR #8); on a narrow desk sheet
   + strip + bench fit one screen; Focus
   mode makes the sheet the window with the bench as a drawer; phones get an
   edge-to-edge desk and collapsible boxes; the Brushes box paints a dab of
   the current brush and a fine pointer wears the brush's ring. If the bench
   grows taller, the sheet shrinks to keep the screen: mind that when adding
   controls. UI copy carries no em dashes (Ryan's call); keep it that way.

4. **Known rough edges**:
   - ~~Saved sheets are dimension-keyed~~ — fixed: the dried layer is
     resampled to fit on restore (`src/data/resample.ts`).
   - ~~Lift on dry paint does nothing, silently~~ — fixed: a note floats
     over the desk when the paint under the lift brush is cured
     (`Simulation.probe`).
   - `docs/figures/*.png` are committed at full res (~5 MB total). Fine for
     now; revisit if the repo grows. They were rendered under SwiftShader;
     Metal renders a hair lighter. Regenerate them all in one go on one
     machine when physics next moves, never piecemeal.

## Conventions that bit us (so they don't bite you)

- **Float readback**: never gate `readPixels` on
  `IMPLEMENTATION_COLOR_READ_TYPE` — ANGLE/Metal says `HALF_FLOAT` for
  RGBA16F yet reads `FLOAT` fine. Use `Simulation.readFloat`, which checks
  `getError` after the read.
- **Git identity**: commit with author/committer email
  `23747348+uxpreview@users.noreply.github.com`. Pushes with the personal
  iCloud address are rejected by GitHub's email-privacy setting.
- **Design tokens**: `src/tokens.css` is a vendored copy of the site's
  tokens. Replace the whole file when the site changes; never edit values
  here.
- **Stroke resampling**: stamp spacing must stay invariant under pointer
  event batching — there's a test for it; keep it passing.
- **README figures**: regenerate via the harness, never hand-edit; they are
  the integration test.
