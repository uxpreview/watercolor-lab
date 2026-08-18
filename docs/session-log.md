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
