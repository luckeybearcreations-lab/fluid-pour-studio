# GPU paint engine

The canvas now runs a GPU fluid simulation (WebGL2) instead of the particle
engine. The UI, cup builder, tools, pour modes, gallery, paywall and project
files are unchanged.

## Where it lives

- `src/lib/gpu/shaders.ts`: the simulation and display shaders.
- `src/lib/gpu/GpuFluidEngine.ts`: buffers, the simulation step, undo, export, stats.
- `src/lib/gpu/pours.ts`: maps the studio sliders, tools, cup layers and pour modes onto the engine.
- `src/components/FluidCanvas.tsx`: the canvas component (same props and handle as before).
- `src/components/LegacyFluidCanvas.tsx`: the previous particle engine, kept as a fallback.

## How it behaves

- Paint is a continuous fluid, so pours spread, ribbon and marble instead of being drawn as blobs.
- Tilt and the turntable move the paint with real gravity, centrifugal and Coriolis forces.
- Cells come from silicone, cell frequency, the torch and the cell tool, and only open where there is paint.
- Paint dries over time (Drying rate). Dry paint stops moving and loses some gloss.
- Metallic and pearl layers keep their shine as they flow.
- Export renders the pour again at 1x, 2x or 4x, so prints stay sharp.

## Fallback and comparison

Devices without WebGL2 automatically use the old engine. Add `?engine=classic`
to the URL to compare the two.
