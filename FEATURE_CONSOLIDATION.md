# Fluid Pour feature consolidation

This document records the evidence used to selectively reimplement the strongest behavior from the confirmed Fluid Pour lineage. Reference projects remained read-only. No divergent source tree was merged wholesale.

## Source strengths retained

| Source | Strong ideas retained | How they were incorporated |
|---|---|---|
| History-backed TypeScript baseline | Spatial particle simulation, persistent baked layer, surface tension, tilt, eased spin, responsive studio, gallery fallback, Studio Notebook | Preserved as the architecture and safety baseline |
| Newer `fluid-art-studio` TypeScript branch | Flip Cup, wet highlights, dimensional cell rings, black/kraft surfaces | Reviewed individually and reimplemented in the isolated engine |
| V1 working archive | Standard, metallic, and pearl paint identities; shimmer; silicone-dependent cells; spin/tilt intent | Expanded into typed paint materials and optical treatments |
| V4/V5 clean engines | Material-specific viscosity, flow, cohesion, drying, cell response, shine, color interaction, blower, and torch | Reworked as seven material profiles and bounded simulation parameters |
| V6 | Modular tools, blower/torch/silicone concepts, saved-project format, dirty/ring/flip/bloom vocabulary | Preserved through the typed tool model and compatibility normalizer |
| Project River and RC3 | Weighted pour-cup recipes, dirty pour, tree ring, Dutch pour, swipe, open cup, bloom, organic puddles, 1x/2x/4x export, undo/redo | Reimplemented as particle-based complete-cup modes within the TypeScript engine |

## New combined behavior

- Three continuous modes: Ribbon, Splatter, and Drip.
- Seven complete-cup modes: Flip Cup, Dirty, Tree Ring, Dutch, Swipe, Open Cup, and Bloom.
- Per-layer amount, material, and silicone settings in a five-layer visual pour cup.
- Fluid Acrylic, Heavy Body, Metallic, Pearl, Silicone Mix, Pouring Medium, and Gloss Medium profiles.
- Pigment mixing based on optical absorbance rather than simple RGB averaging.
- Material-dependent viscosity, flow, cohesion, density, opacity, gloss, spread, drying, and cell response.
- Organic particle shapes, continuous wet-paint bridges, velocity stretch, wet highlights, metallic sheen, pearl iridescence, and canvas weave.
- Colored, irregular cell membranes with torch expansion and silicone response.
- Longer wet working time, edge pooling, mass-aware motion, tilt, centrifugal spin, blower, scraper, and comb forces.
- Bounded particle, sprite, and cell workloads to protect browser and mobile responsiveness.
- Recovery-2 project files with normalization for V6, Project River, RC3, and recovery-1 data.

## Deliberate exclusions

- RC3's monolithic canvas architecture and static image-warp physics.
- Generic starter-component trees and unused dependencies.
- Hard-coded cloud endpoints, checkout hooks, monetization drafts, hosting identifiers, credentials, and production connections.
- Any ownership, authorship, or copyright metadata not supplied by the owner.

## Acceptance evidence

- Automated isolation, legacy compatibility, pigment-mixing, material, and seven-mode tests pass.
- ESLint and the production build pass.
- Browser checks cover the mixed-material cup, all complete-cup controls, wet working time, undo/clear behavior, spin, special tools, and a stress load above 1,000 wet particles.
- The browser console remains free of warnings and errors during the test pass.
