# AGENTS.md

## Project Summary

Tray Transcriber is an Electron app with:

- a main process runtime for STT, LLM, OCR, shortcuts, provider management, and tray behavior
- a React renderer for settings, history, shortcuts, and provider configuration
- optional Python worker support for local transcription engines

Primary source files live in `src/`. Built TypeScript output goes to `dist-ts/` and should be treated as generated.

## Repository Map

- `src/main/`: Electron main-process code, runtime orchestration, providers, shortcuts, config handling
- `src/main/runtime/`: provider registry, runtime config, secrets, verification, installer/runtime API logic
- `src/main/runtime/providers/`: concrete STT/LLM/OCR runtime providers
- `src/main/shortcuts/`: screenshot/OCR/assistant shortcut pipeline execution
- `src/renderer/`: React UI
- `src/renderer/settings/`: settings screens for providers, runtime API, assistant, OCR, installer
- `src/renderer/shortcuts/`: shortcut editor UI
- `src/main/__tests__/`: Node-side tests for runtime/main-process code
- `src/renderer/__tests__/`: jsdom tests for renderer code
- `python/`: worker scripts used by local transcription flows
- `providers/`: installed/provider runtime assets
- `dist-ts/`: compiled output, generated from `tsc`

## Working Rules

- Do not hand-edit `dist-ts/`. Run `npm run build` after TypeScript changes that need compiled output.
- Treat `providers.*.profiles[]` in runtime config as the source of truth. Legacy top-level fields exist for compatibility only.
- Keep provider IDs and secret ref naming consistent with existing conventions such as `providers.llm.openai_compatible.api_key` and `providers.ocr.llm_vision.api_key`.
- Prefer small, targeted changes. This repo already has focused tests for most provider and settings behavior.
- When fixing a bug or changing behavior, add or update a regression test first.

## Commands

- Install deps: `npm install`
- Full dev loop: `npm run dev:all`
- Renderer only: `npm run dev`
- Main process TypeScript watch: `npm run dev:main`
- Launch Electron against dev server: `npm run dev:electron`
- Build TypeScript: `npm run build`
- Build renderer bundle: `npm run build:renderer`
- Build app artifacts used by production start: `npm run build:app`
- Run default test command: `npm test`

## Testing Notes

The default `npm test` uses the Vite config rooted at `src/renderer`, so it is best for renderer tests.

For main-process/runtime tests, run Vitest from repo root with Node environment:

```bash
npx vitest run src/main/__tests__/some-test.test.ts --root . --environment node
```

Useful patterns:

- Renderer test: `npm test -- ShortcutsPage.test.tsx`
- Main/runtime test: `npx vitest run src/main/__tests__/llm-openai-compatible-provider.test.ts --root . --environment node`

After changing runtime/provider code, at minimum:

1. run the targeted test file
2. run `npm run build`

## Project-Specific Conventions

- OpenAI-compatible LLM and OCR integrations use the Responses API at `/v1/responses`.
- Assistant voice behavior depends on the active LLM profile, including `options.assistantName`.
- OCR mode is selected by the active OCR provider:
  - `ocr.llm_vision`
  - `ocr.local_tesseract`
- Secrets are resolved through the secrets service and canonical secret refs. If a provider already supports pasted inline keys as a compatibility fallback, preserve that behavior.
- The settings UI writes provider profile data; do not reintroduce legacy top-level saves for LLM/OCR fields unless there is a migration reason.

## Change Guidance

- If you touch `src/main/runtime/providers/*`, inspect matching tests in `src/main/__tests__/`.
- If you touch settings state or settings tabs, inspect renderer tests around config normalization and save payloads.
- If you change config structure, update normalization/migration logic in `src/main/runtime/runtime-config.ts` and relevant tests.
- If you add a new provider option, make sure it survives:
  - renderer draft editing
  - save payload generation
  - runtime normalization
  - provider execution

## Avoid

- Do not edit generated build output directly.
- Do not assume renderer and main-process tests run under the same Vitest configuration.
- Do not bypass existing secret ref normalization or provider profile selection logic.
- Do not replace provider-profile config with ad hoc top-level config keys.
