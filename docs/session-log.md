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
result. (Appended below as the rounds happen.)
