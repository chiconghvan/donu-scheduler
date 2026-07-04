# Refactor Plan

## Keep
Rust backend, SQLite schema, Tauri commands, scheduler, runner, profile manager, `src/types.ts`, `src/api.ts`, runtime behavior.

## Remove
Legacy root components in `src/components/*.tsx` and `src/App.css`.

## Add
`src/styles/index.css` for new design system.

`src/components/common`, `src/components/domain`, `src/components/pages`, `src/components/shell`.

`src/utils` and `src/hooks` adapter layer.

## Build Order
1. Docs.
2. Extract utils/hooks.
3. Build CSS tokens and components.
4. Build shell and pages.
5. Delete legacy GUI.
6. Typecheck/build.

## Dependency
Added `lucide-react` for consistent SVG icons.

## Risks
Schedule serialization, profile multi-select, polling/event cleanup, job stop semantics. Mitigation: keep backend commands unchanged, verify via `npx tsc --noEmit` and `npm run build`.
