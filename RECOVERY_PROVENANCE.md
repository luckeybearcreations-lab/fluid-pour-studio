# Recovery provenance

## Authoritative source snapshot

- Source folder: `C:\Users\Michael\OneDrive\Documents\Pup-Pers And Paint\tmp\project-river-propro-audit-20260721`
- Source commit: `f7b6b2bd3e7d56aa36d4623b22f374f91df2fabe`
- Source tree: `523651c3cc51db074d8bb0997916b652b361883a`
- Source commit date: `2026-07-30T10:27:44-06:00`
- Recovery created: `2026-09-01`

The source was exported with `git archive`. Its `.git` directory and untracked files were never copied.

## Deliberate exclusions

- `.openai/hosting.json`
- The generic Sites packaging hook from `build/sites-vite-plugin.ts`
- Sites remotes and all prior Git metadata
- `.env`, `.env.local`, credentials, tokens, and production identifiers
- `dist`, `.vinext`, `.next`, caches, and `node_modules`
- ShopLuckyBears storefront/gallery routes and all commerce code
- LuckyHustlePro, ArtPolisher, Lucky Bear Universe, MegaMall, Command Center, TapCard, NFC, and Stockroom code
- Generic UI starter files and hard-coded Supabase values from the divergent `fluid-art-studio` folder
- RC3 files from its separate monolithic JSX architecture

## Baseline evidence

The sanitized export passed `npm run build` before feature recovery. ESLint reported zero errors and one framework-layout warning.

Selected SHA-256 hashes from the untouched exported baseline:

- `src/lib/fluidEngine.ts`: `08A71545DBE0BD731911F0BE144ECE4EA80CE7BDAA4222B792545F1E73487945`
- `src/components/AppLayout.tsx`: `CED1034E9962EBBF537EC8B930DE19EE5B2476FF58A7518BC4DC52B0EB64F40A`
- `src/components/FluidCanvas.tsx`: `40E42BB0A6C7305D828B56036FC5EB4269EB4AD1298B2382651B9893C1A1FFA1`
- `package-lock.json`: `FCC15A719CA680B916BD9334727E38054B2FD575AAE76384E86CCE5797EE1E19`

## Divergent branches retained as references

- `C:\Users\Michael\OneDrive\Documents\Pup-Pers And Paint\fluid-art-studio`: newer TypeScript experiments. Only independently reviewed behavior may be reimplemented here.
- `C:\Users\Michael\OneDrive\Documents\Pup-Pers And Paint\tmp\lucky-bear-project-river-launch-rc3`: feature specification for project files, layered cups, tools, undo/redo, and export options. Its source is not copied.
- Earlier V1 through V6 and Project River archives remain external historical evidence.

## Compatibility fixtures

Legacy `.luckybear.json` files remain in `C:\Users\Michael\Downloads\luckyapp6`. They are read-only compatibility fixtures and are not copied into this repository.

## Recovered capabilities

- Layered pour cup with up to five colors
- Stream/ribbon, splatter, drip, and Flip Cup pours
- Blower, torch, tilt, cell, scrape, and comb tools
- Surface tension, gravity, flow, viscosity, cell bloom, tilt, and eased spin controls
- Undo/redo history, local project metadata, and `.luckybear.json` download/open support
- White, black, and kraft surfaces with 1x, 2x, and 4x PNG export plus optional transparency
- Existing Studio Notebook, recipe lab, palette, gallery fallback, and responsive studio layout
- Ultra-real material and pigment pass documented in `FEATURE_CONSOLIDATION.md`

The capabilities above were selectively reimplemented in the TypeScript baseline. No RC3 files, generic starter tree, commerce code, deployment configuration, or production connection was merged.

## Validation record

- `npm test`: passed; recovery isolation scanned 22 source/config files, all three legacy saved-project fixtures normalized successfully, and seven complete-cup modes passed simulation checks.
- `npm run lint`: passed with zero errors and zero warnings.
- `npm run build`: passed; the local Vinext application route `/` was generated successfully.
- Browser validation: layered cup, Flip Cup, undo/redo, Kraft surface, 4x transparent export selection, metadata editing, blower, and torch all passed at `localhost`.
- Browser console: zero warnings and zero errors during the functional pass.
- Git: local-only repository on `main`, with no remotes.
- Hosting isolation: the copied Sites manifest and its generic build packaging hook are absent.
- Publication: none. No deployment, hosting, domain, database, credential, or production service was contacted.
