# Engineering log

The running record of what was decided and why, in the order it happened.
The README is the cleaned-up story; this is the bench.

## The model

**Curtis et al. (SIGGRAPH 1997), with the fluid layer swapped.** The paper's
three-layer structure survives intact — a shallow-water layer that moves,
a pigment-deposition layer that remembers, a capillary layer that makes
backruns possible — but their explicit velocity relaxation is replaced by a
virtual-pipes scheme: a four-direction flux field between cells, accelerated
by the gradient of total head, with outflow clamped to the water present.
Reasons: pipes are unconditionally stable at interactive step sizes (the
relaxation scheme wants small steps and careful ξ), the advection velocity
falls out of the net flux for free, and the outflow clamp conserves water
exactly, which matters when the same water has to carry pigment for thirty
seconds of real time without exploding or vanishing.

**Kubelka-Munk, but summed, not per-pigment.** Curtis simulates each pigment
as its own advected field. With a 36-pan paint box that is 36 sets of state
textures, and it buys nothing: K and S are linear in concentration, so the
suspension can store ΣKᵢcᵢ and ΣSᵢcᵢ directly — two RGBA16F textures for the
wet layer regardless of how many pigments the painter has used. Mixing on wet
paper is then exact by construction. The cost is per-pigment handling: settle
rate, granulation and staining ride along as concentration-weighted sums and
come back out as means, so a mixed wash carries the *average* character of
its pigments rather than each pigment behaving separately. Ultramarine mixed
with phthalo granulates a little less than ultramarine alone — which is
approximately what happens in a real mixed wash, so the approximation is
spent where it shows least.

**Dried paint is one reflectance, not a stack of layers.** When a region's
wetness collapses, the wet layer's K, S are folded through the KM layer
equations into a single "dried" texture that starts as the bare sheet's
reflectance. Glazing then composites the *live* layer over that stored
reflectance with R₁ + T₁²R₂/(1−R₁R₂). This loses the ability to un-dry a
specific earlier layer (nothing needs it) and keeps render cost flat no
matter how many glazes a painting has.

**Both transfer passes recompute the same exchange.** Deposition/lift moves
pigment between suspension and deposit, which means writing five state
textures — more than one MRT pass guarantees. Instead of splitting the ledger
across passes and hoping, the exchange amount is computed identically in two
passes (one writes the suspension side, one the deposit side) from identical
pre-swap inputs. Duplicate ALU, zero conservation drift.

## Bugs the tests caught

- **Stamp spacing debt.** The stroke resampler carried leftover distance
  between pointer events wrong: one 300px move and thirty 10px moves laid
  down 77 vs 60 stamps. The invariant test ("stamp count independent of
  event batching") caught it before a single stroke was drawn; a real brush
  driven by real pointer events would have painted denser or sparser
  depending on how the browser batched moves — the kind of wrongness that
  reads as "feels off" and never gets root-caused.

## Headless rendering

The container this was built in has no GPU, so the scripted scenes render
under SwiftShader. Numbers, for whoever touches this next: at the full
1056×704 grid a dried-wash scene (~700 substeps × 11 passes) takes 4+
minutes of software GL; at 528×352 it is ~2 minutes; page navigation
starves entirely if more browsers than cores-minus-two run at once. Hence
`?sim=WxH` (the physics is resolution-independent enough to judge at half
size), scripted strokes speaking reference coordinates so composition
survives the rescale, and a two-worker pool in scripts/shoot.mjs with
10-minute timeouts. On actual hardware the same scenes run at 60fps.

## The tuning rounds

Recorded after each visual pass; the defaults in `DEFAULT_PARAMS` are the
result. Each round: render the eight scripted scenes headlessly, put the
screenshots in front of three independent critics (a watercolorist for
technique, a color scientist for pigment fidelity, an image-forensics pass
for digital tells), fix what they agree on, render again.

**Round 1 → 2.** First renders looked like soft airbrush: washes spread and
graded but had no watercolor signatures. Diagnosis: pigment settled so fast
(settle 0.0065) that nothing stayed in suspension long enough to ride the
drying currents — every transport effect (edge darkening, granulation
migration, backrun rims) needs pigment that is still mobile when the water
pattern changes. Cut settle to 0.0018, raised lift, tension threshold now
rides the paper tooth (organic fibrous wash edges instead of a level-set
boundary), paper slope raised 3× so tooth drives micro-currents, salt made
osmotically real. Round 2 washes grew ragged fiber edges and mottled
interiors and started to read as paint.

**Round 2 → 3.** The critics' consensus on round 2, in order of damage:
(1) no dried rim anywhere — the single loudest watercolor signature;
(2) every mark wore the same soft fringe regardless of wetness history;
(3) the granulation test had no granulation; (4) backruns had the pale
bloom but not the dark cauliflower rim that *is* a backrun; (5) tints
rotated hue toward cyan and gained chroma in dilution (measured: cobalt
H217→H191, cerulean H203→H183 with saturation rising) — the artifact of a
flat per-channel S; (6) ten masstones keyed too bright ("no pigment is
ever allowed to be dark"); (7) periodic stroke-row seams (53px spacing,
measured) and identical rounded-rectangle footprints across scenes.

Fixes, mapped to mechanisms rather than symptoms:
- **Drying-front deposition** (`edgeSettle`): settling is multiplied where
  local wetness exceeds its blurred neighborhood — the boundary of the wet
  region. One term produces the dried rim, mid-wash tide lines, and the
  backrun cauliflower, because they are all the same physics.
- **Per-channel scattering**: S is now weighted toward the channels the
  pigment reflects (real pigments scatter selectively near their
  reflectance peak), so backscatter carries the pigment's own hue and
  tints walk toward chalky paper-white instead of toward the least-absorbed
  channel. The per-channel K/S masstone relation still holds exactly, so
  the round-trip test was untouched.
- **Tinting strength** per pigment (K and S scaled together): phthalos and
  alizarin now reach near-black masstones in heavy washes.
- Masstones re-keyed dull and dark per the measured findings (alizarin to
  deep maroon, burnt sienna out of cadmium-orange territory, cerulean
  opaque and chalky, one lemon in the yellow row instead of three).
- Granulation valley bias squared plus peak-biased lifting; dry-brush
  contact made a near-binary threshold on the tooth (hard flecks).
- Scene scripts rewritten data-driven with a seeded RNG: jittered row
  spacing, wavy travel, varied endpoints, per-scene paper seed — nothing
  periodic, no two footprints alike.

**Round 3 → final.** Round 3 confirmed the mechanisms: the flat wash grew a
dried rim, the backrun bloom grew its outline, the glaze seam vanished, dry
brush went hard-edged. Residual fixes: render speckle rebalanced from the
1px grain channel toward the structured height octaves (pigment texture
clumps at fiber scale, it is not white noise), salt grains enlarged into
angular stars with real reach, quinacridone rose nudged off magenta, and
the wet-on-wet scene re-choreographed so the blooms actually meet and
mingle.

**Resolution was a silent variable in every verdict.** The critic rounds
were run on half-resolution renders (SwiftShader economics), and the
critics' most persistent complaint — blocky clumps, same-frequency noise
everywhere, scale mismatch between texture and feature — was partly the
harness, not the model: at the app's real 1056×704 grid the paper's
octaves sit at the right scale and the same physics reads as fine sediment
and delicate drybrush breakup. The shipped figures render at full
resolution for this reason, and `npm run figures` now defaults to it.
Lesson recorded for the next experiment: never let the evaluation pipeline
degrade the thing being evaluated.

**The hero figure took eight attempts** — not because the physics failed
but because scripted *painting* is hard: a representational landscape kept
collapsing into stacked ribbons as every stroke spread twice its brush
radius at half-resolution and closed the gaps a composition needs. The
lesson that stuck: choreograph what the medium is good at. The final hero
is a wet-blended dusk sky (the engine's best trick, three pigments floated
into one wet field) over a single dark ragged ridge — two stages, no
fussy gaps, robust to spread.

## Pass 1: the studio grows up

Feature pass after studying the control surface of the original inspiration
(sudoaquarelle.com): a mixing well (dips accumulate as parts; the mix is the
parts-weighted K/S average, which is exact for Kubelka-Munk and the same
arithmetic the suspension textures already do), rinse and a recents row, an
explicit lift tool, numeric slider readouts, Forever Wet and Rain ambient
modes, sheet persistence in IndexedDB (the dried layer read back as float
pixels), and a portrait simulation grid on phones.

The lift tool took three tries to feel true, and each failure was the
physics being right: lifting *dried* paint did nothing because the dried
layer is cured by construction; lifting a *soaking* wash did nothing
lasting because the surrounding suspension flowed straight back into the
wet lane. The missing piece was that a lifting brush is thirsty — it does
not just loosen pigment, it removes it from the sheet. The scrub field now
re-suspends deposit, suppresses re-settling, and drinks a fraction of the
suspension per step. On a damp wash — which is when a painter actually
lifts — two passes carve a pale lane with the displaced pigment ridged
along its edges.

## First desktop session: hosting, and the sheet travels

Production hosting is up: Vercel project `watercolor-lab` on the `ryankm`
team, git-connected to `uxpreview/miniature-spork` (`main` deploys), custom
domain `watercolor.ryankm.com` attached and waiting on a Squarespace CNAME.

Two rough edges from the handoff, and one bug that only a real GPU could
show. **Save sheet was broken on Chrome for Mac.** `serializeDried` trusted
`IMPLEMENTATION_COLOR_READ_TYPE`, which ANGLE on Metal reports as
`HALF_FLOAT` for RGBA16F targets — so the guard bailed and every save
"failed", though `readPixels(RGBA, FLOAT)` works fine there (WebGL2
guarantees the RGBA/FLOAT pair for float-type color buffers). The readback
now does the read and checks `getError`, not the advertised type. The
SwiftShader container had reported `FLOAT` all along, which is why the bug
never showed.

**A sheet saved on a desk restores on a phone** and back. The dried layer is
resampled on restore — bilinear, aspect preserved, scaled to fit, centred,
margins bare paper. Not rotated: a painting stays right-way-up even when the
sheet under it turns, and the round trip is bounded (the small loss of
resolution is the price of not showing a landscape sideways). Pure TS
(`src/data/resample.ts`), pinned by tests.

**Lifting cured paint says so.** The lift tool works on damp washes by design;
scrubbing dried paint did nothing, silently. `Simulation.probe()` reads a
small block under the pointer on pointer-down (dried depth, workable paint,
surface wetness), and when the sheet is cured there, a one-line note floats
over the desk for three seconds. It never fires on bare paper or a wet wash.

The figure harness now launches the installed Chrome on a desktop (real GPU,
~24 s per scene at full resolution vs minutes) and falls back to the container
Chromium under SwiftShader when that path exists (`scripts/browser.mjs`;
`PW_CHROMIUM` overrides). Renders on Metal are a hair lighter than the
committed SwiftShader ones — fp16 arithmetic differs by backend — so the
committed figures were left alone this session, no physics having moved.

## The Lab shape

The page now takes the same shape as Attention Lab (EXP-038), which is the
shape the site's `/lab/<slug>` route has: the site bar with the trail back
in the label voice; the record line (EXP-041 · tool · Live · rule · stack);
the name in display type with the vermillion dot; a two-sentence lede; the
experiment; then bench notes as a label rail with the note beside it, and
the arrow-link credit home. Class names, sizes and the masthead give-way
rule for laptop-height screens are the same as Attention Lab's, so the two
pages can be diffed by eye. The share card was rebuilt in the Lab's card
layout — copy left, the experiment's own picture in a hairline frame right —
in Figtree, which the old card lacked (the container had no font). `.btn-ghost`
was referenced but never defined here; the class is gone and the buttons wear
the shared outlined recipe they always rendered with.

## X-ray

Feature pass 2, item one. The X-ray box shows the state textures themselves,
one field at a time: Water (flow.b, standing depth), Wet (flow.a), Suspended
(susK.a), Settled (depK.a), Paper (cap.r, with salt from cap.g in vermillion)
and Dried (dried.a). One shader, one number per pixel, tone-mapped through
1 − exp(−v/scale) so a saturating ramp never clips, painted paper cream →
mid teal → the site's ink. Nothing stylized and no relief: the sheet is a
readout while a field is up (the desk shadow goes, so cream reads as zero).

The scales are constants, not fits: autoscaling would make the same wash
change shade from one frame to the next, which is the opposite of an
instrument. They were set once against a heavy mop wash on cold press, read
back over the whole sheet at 0, 1, 3 and 8 s (`readFloat`), so a typical wash
sits mid-ramp — water 0.12, wet 0.6, suspended 0.15, settled 0.06, paper 0.03,
dried 1.0. Two things the numbers said that the eye had not: paper
saturation is a small, fast field (peaks near 0.04 and collapses within a
second of the surface drying — the Paper view is mostly empty unless the sheet
is wet, which is true), and settled deposit is an order of magnitude thinner
than suspension until the wash is nearly dry.

The legend under the pills prints the field's one-line meaning, the ramp as
a CSS gradient (a UI colormap, not a pigment, so this is not a hex-swatch
violation), and the value past which the ramp is effectively full ink (3×
scale, 95%). Export PNG while a field is up exports the field — deliberate;
it is what is on the sheet.
