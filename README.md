# Lucky Bear Fluid Studio

Local project name: `newfluidpourapp`

An isolated local recovery of the Lucky Bear fluid-art simulator. The studio models wet acrylic paint with material-dependent viscosity, flow, cohesion, pigment interaction, silicone cells, drying, tilt, spin, layered recipes, local/cloud-optional gallery storage, and print-scale PNG export.

The pour system includes Ribbon, Splatter, Drip, Flip Cup, Dirty, Tree Ring, Dutch, Swipe, Open Cup, and Bloom techniques. Each cup layer can use its own amount, silicone ratio, and Fluid Acrylic, Heavy Body, Metallic, Pearl, Silicone Mix, Pouring Medium, or Gloss Medium behavior.

## Local development

```powershell
npm ci
npm run dev
```

Validation:

```powershell
npm run build
npm run lint
```

## Recovery boundaries

- This repository is local-only and has no deployment remote.
- Production hosting configuration and credentials are deliberately absent.
- ShopLuckyBears, LuckyHustlePro, ArtPolisher, Lucky Bear Universe, commerce, NFC, Stockroom, and unrelated starter UI code are excluded.
- Cloud gallery support is optional and activates only when local environment variables are deliberately supplied.
- See `RECOVERY_PROVENANCE.md` for the exact source commit, exclusions, and branch relationships.
- See `FEATURE_CONSOLIDATION.md` for the cross-version feature evidence and implementation map.

Nothing in this repository is authorized for deployment or publication without a separate approval.
