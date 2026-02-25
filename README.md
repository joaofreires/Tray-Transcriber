# Tray Transcriber

A system‑tray transcription app built with Electron. Hold a hotkey to record your microphone, transcribe locally, then paste into the active app or copy to clipboard.

## Features
- System tray app (no main window required)
- Press‑to‑talk / hold‑to‑talk hotkeys
- Transcription engines: WhisperX, OpenAI Whisper, or faster‑whisper
- Prompt + dictionary biasing, plus output‑time corrections
- Worker mode keeps the model warm (faster after first load)
- Cross‑platform paste fallback (clipboard, wtype/xdotool/robotjs)

## Quick Start (Dev)

1. install dependencies:
   ```bash
   npm install
   ```
2. run the renderer + main process in watch mode. the easiest way to get an
   interactive dev environment with live reload is:
   ```bash
   npm run dev:all
   ```

   - `npm run dev` will only start Vite for the renderer.
   - `npm run dev:main` watches the TypeScript main process.
   - `npm run dev:electron` will rebuild and launch Electron once the renderer
     server is available (used automatically by `dev:all`).

   You can also spin up pieces individually if desired.

(Previously `npm start` launched a production build; it is still available but
isn't typically used during development.)

Open the tray menu → **Settings** to configure engine, model, prompt, dictionary, and paste behavior.

## Configuration
Config file is stored in Electron user data:
- Linux: `~/.config/TrayTranscriber/config.json`
- macOS: `~/Library/Application Support/TrayTranscriber/config.json`

Key options (not exhaustive):
- `asrEngine`: `"whisperx" | "whisper" | "faster-whisper"`
- `model`: `tiny | base | small | medium | large`
- `device`: `default | cpu | gpu`
- `pasteMode`: `clipboard | paste`
- `dictionary`: list of `{ term, description }`
- `dictionaryCorrections`: list of `{ from, to }` (output replacements)
- `prompt`, `promptMode`, `includeDictionaryInPrompt`
- `useWorker`: keep a background Python worker warm
- `workerTransport`: `"http" | "stdio"` (default: `stdio`)
- `pythonPath`: override Python path (dev)

### LLM Assistant
- `assistantName`: spoken trigger words (e.g. "AI Assistant"). If the transcript begins with this name, the remainder is sent to the configured LLM instead of being pasted.
- `llmEndpoint`: URL of an OpenAI-compatible chat completion endpoint (default OpenAI).
- `llmModel`: model name to request (default `gpt-3.5-turbo`).
- `llmApiKey`: optional API key; if empty the `OPENAI_API_KEY` environment variable is used.

When the assistant is triggered and there is text selected in the target application, the selected text is appended to the prompt. The LLM response will replace the selection (or simply be pasted if nothing was selected).

The tray icon will animate (spin) while the transcription or LLM request is processing.

Example voice command:

> "AI Assistant make this text a poem"



### Dictionary vs Corrections
- **Dictionary** entries are added to the prompt to bias recognition.
- **Preferred spellings** (corrections) are applied after transcription as replacements.

## Engines
### WhisperX
Uses `python -m whisperx` by default (CLI), or the worker if enabled.

### Whisper (OpenAI)
Runs via the worker. Requires:
```bash
pip install -U openai-whisper
```

### faster‑whisper
Runs via the worker. Requires:
```bash
pip install -U faster-whisper
```

## Worker
When `useWorker: true`, the app starts `python/worker.py` and keeps models loaded between requests.

Transport options:
- `http` (default): worker listens on `workerHost:workerPort`.
- `stdio`: worker communicates over stdin/stdout (no HTTP server).

## Bundled Build (Linux/macOS)

Bundle a minimal Python venv with **faster‑whisper** + ffmpeg. run the
build script first so TypeScript sources are compiled:

```bash
npm install
npm run build:app         # compile both main + renderer
npm run bundle:prep       # prepare python/ffmpeg
npm run dist:linux        # AppImage
npm run dist:mac          # dmg
```

The produced artifacts land in `dist/`.

The AppImage/Dmg is generated in `dist/`.

## Notes
- Large/medium models on CPU can be very slow. Use `small` for responsiveness.
- GPU requires CUDA and `device: "gpu"`.
- Paste on Linux uses `wtype` (Wayland) or `xdotool` (X11).

## Troubleshooting
- If no paste occurs, text is still copied to clipboard.
- Check logs in `~/.config/TrayTranscriber/logs/app.log` (or macOS equivalent).
- If the build process complains about `@tailwindcss/oxide` native binding
  (especially on CI), re-running `npm install` or manually rebuilding with
  `npm rebuild @tailwindcss/oxide` usually resolves it. A postinstall script is
  included to automate this.
- If worker hangs on large models, try smaller model or GPU.

## License
MIT (add your preferred license here)
