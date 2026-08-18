# Handoff — Watercolor Lab (EXP-041)

For the next working session, starting fresh on a local desktop clone.
Read this top to bottom before writing code; the README is the public story,
`docs/session-log.md` is the engineering log, and this file is the state of
play and the queue.

## Where things stand

- **Branch**: all work so far is on `claude/sudoaquarelle-ryankm-experience-h8mzty`.
- **PR #1** (branch → `main`) is open: the full simulator plus feature pass 1
  (mixing well, lift tool, mobile/portrait, alive modes, saved sheets).
  https://github.com/uxpreview/miniature-spork/pull/1
- **Tests**: `npm test` = 314 checks, all passing. `npm run typecheck` clean.
  `npm run build` runs `tsc` first and refuses to emit on a type error.
- **Demo**: a Vercel *preview* deployment exists on a scratch project
  (`fable-test`, team `ryankm`). It is a file-push deploy, not git-connected,
  and share links expire daily — treat it as disposable. Production hosting
  is not set up yet (see next steps).

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
pain applies** — scenes that took 4 minutes render in seconds, so always
regenerate figures at full resolution (1056×704, the default) after any
physics/tuning change. Lesson already learned the hard way: never judge
renders at reduced resolution.

## Next steps (the queue)

In priority order:

1. **Production hosting** (needs Ryan in the loop):
   - Create a Vercel project (suggested name `watercolor-lab`) in the
     dashboard by importing `uxpreview/miniature-spork`. This must be done by
     a human — the Claude/Vercel integration role cannot create projects on
     the `ryankm` team.
   - Merge PR #1 so `main` deploys.
   - Add the custom domain `watercolor.ryankm.com` to the project, then in
     Squarespace DNS add CNAME `watercolor` → `cname.vercel-dns.com`.
   - Sanity-check the live site on desktop + phone; confirm the vendored
     Figtree woff2 loads (the throwaway preview substituted Google Fonts
     because the file-push deploy couldn't carry binaries — the git deploy
     needs no such workaround).

2. **Feature pass 2** (proposed, not yet approved — confirm scope with Ryan
   before building). Candidates, with the intended angle:
   - **X-ray view**: an honest field-inspection mode — render the actual
     state textures (water height, wetness, suspension concentration,
     deposit) rather than a stylized effect. The sim already has everything;
     this is a render-pass + UI toggle job.
   - **Pigment detail cards**: tap-and-hold a pan → the pigment's declared
     numbers, masstone/tint ramp, and a one-line handling note. All data
     exists in `pigments.ts`.
   - **Alcohol technique**: the inverse of salt — a droplet that *pushes*
     pigment outward (surfactant ring). Same splat-into-cap-channel pattern
     as salt; needs a free channel or packing.
   - **FILM (timelapse export)**: record canvas frames during painting,
     export WebM via MediaRecorder. Watch memory on phones.

3. **Known rough edges** worth a look before or during pass 2:
   - Saved sheets are dimension-keyed: a sheet saved on desktop (1056×704)
     silently fails to restore on a phone (704×1056) and vice versa.
     Acceptable for now; a resample-on-restore would fix it.
   - The lift tool works on damp washes by design (dried paint is cured);
     consider a hint in the UI when someone scrubs dry paint and nothing
     happens.
   - `docs/figures/*.png` are committed at full res (~5 MB total). Fine for
     now; revisit if the repo grows.

## Conventions that bit us (so they don't bite you)

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
