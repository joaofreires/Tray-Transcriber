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
```bash
npm install
npm start
```

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
- `pythonPath`: override Python path (dev)

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

## Bundled Build (Linux/macOS)
Bundle a minimal Python venv with **faster‑whisper** + ffmpeg.

```bash
npm install
npm run bundle:prep
npm run dist:linux   # AppImage
npm run dist:mac     # dmg
```

The AppImage/Dmg is generated in `dist/`.

## Notes
- Large/medium models on CPU can be very slow. Use `small` for responsiveness.
- GPU requires CUDA and `device: "gpu"`.
- Paste on Linux uses `wtype` (Wayland) or `xdotool` (X11).

## Troubleshooting
- If no paste occurs, text is still copied to clipboard.
- Check logs in `~/.config/TrayTranscriber/logs/app.log` (or macOS equivalent).
- If worker hangs on large models, try smaller model or GPU.

## License
MIT (add your preferred license here)
