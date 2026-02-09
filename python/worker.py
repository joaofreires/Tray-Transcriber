#!/usr/bin/env python3
import argparse
import base64
import importlib
import json
import os
import sys
import threading
import tempfile
import time
from http.server import BaseHTTPRequestHandler, HTTPServer

base_whisper = None
model_cache = {}
model_lock = threading.Lock()
last_error = None
last_load_model = None
last_load_ms = None
last_transcribe_ms = None
loading_model = None
loading_started_at = None
whisper_module = None


LOG_LEVELS = {"silent": 0, "error": 1, "info": 2, "debug": 3}
_log_level_name = os.environ.get("TRANSCRIBER_LOG_LEVEL", "error").lower()
_log_level = LOG_LEVELS.get(_log_level_name, 1)
_log_path = os.environ.get("TRANSCRIBER_LOG_PATH")


def log(level, message):
    if LOG_LEVELS.get(level, 0) > _log_level:
        return
    line = f"[{time.strftime('%Y-%m-%dT%H:%M:%S')}] [{level.upper()}] {message}"
    try:
        sys.stderr.write(line + "\n")
        sys.stderr.flush()
    except Exception:
        pass
    if _log_path:
        try:
            with open(_log_path, "a", encoding="utf-8") as f:
                f.write(line + "\n")
        except Exception:
            pass


def detect_whisper_module():
    for name in ("whisperx", "whisper", "faster_whisper"):
        try:
            return importlib.import_module(name), name
        except Exception:
            continue
    log("error", "no whisper module found. Install with: pip install -U openai-whisper whisperx faster-whisper")
    return None, None


def load_audio_with_fallback(path):
    if base_whisper is not None and hasattr(base_whisper, "load_audio"):
        return base_whisper.load_audio(path)
    for name in ("whisperx", "whisper"):
        try:
            mod = importlib.import_module(name)
        except Exception:
            continue
        if hasattr(mod, "load_audio"):
            return mod.load_audio(path)
    raise RuntimeError(
        "no whisper module with load_audio found. Install with: pip install -U openai-whisper whisperx"
    )


base_whisper, _whisper_module_name = detect_whisper_module()

def emit_stdout(payload):
    try:
        sys.stdout.write(json.dumps(payload, ensure_ascii=False) + "\n")
        sys.stdout.flush()
    except Exception:
        pass


def resolve_device(device):
    if not device or device == "default":
        try:
            import torch  # type: ignore

            return "cuda" if torch.cuda.is_available() else "cpu"
        except Exception:
            return "cpu"
    if device == "gpu":
        return "cuda"
    if device == "cuda":
        return "cuda"
    if device == "cpu":
        return "cpu"
    return device


def load_model_cached(model_name, device, compute_type, language, engine):
    resolved_device = resolve_device(device)
    key = f"{engine}|{model_name}|{resolved_device}|{compute_type}|{language or ''}"
    if key in model_cache:
        return model_cache[key]
    start = time.time()
    log(
        "info",
        f"loading engine={engine} model={model_name} device={resolved_device} compute={compute_type} lang={language}",
    )
    global last_error, last_load_model, last_load_ms, loading_model, loading_started_at
    loading_model = key
    loading_started_at = start
    try:
        if engine == "whisper":
            global whisper_module
            if whisper_module is None:
                whisper_module = importlib.import_module("whisper")
            if not hasattr(whisper_module, "load_model"):
                module_path = getattr(whisper_module, "__file__", "unknown")
                raise RuntimeError(
                    f"whisper module missing load_model (module path: {module_path}). "
                    "Install OpenAI Whisper: pip install -U openai-whisper"
                )
            model = whisper_module.load_model(model_name, device=resolved_device)
        elif engine == "faster-whisper":
            try:
                faster_whisper = importlib.import_module("faster_whisper")
            except Exception as exc:
                raise RuntimeError(
                    "faster-whisper not installed. Install with: pip install -U faster-whisper"
                ) from exc
            model = faster_whisper.WhisperModel(model_name, device=resolved_device, compute_type=compute_type)
        else:
            try:
                whisperx = importlib.import_module("whisperx")
            except Exception as exc:
                raise RuntimeError(
                    "whisperx not installed. Install with: pip install -U whisperx"
                ) from exc
            model = whisperx.load_model(model_name, device=resolved_device, compute_type=compute_type, language=language)
    except Exception as exc:
        last_error = f"model load failed: {exc}"
        log("error", f"model load error: {exc}")
        loading_model = None
        loading_started_at = None
        raise
    elapsed_ms = int((time.time() - start) * 1000)
    last_load_model = key
    last_load_ms = elapsed_ms
    loading_model = None
    loading_started_at = None
    log("info", f"model loaded engine={engine} model={model_name} device={resolved_device} ms={elapsed_ms}")
    model_cache[key] = model
    return model


def status_payload():
    return {
        "ok": True,
        "cached_models": list(model_cache.keys()),
        "last_error": last_error,
        "last_load_model": last_load_model,
        "last_load_ms": last_load_ms,
        "last_transcribe_ms": last_transcribe_ms,
        "loading_model": loading_model,
        "loading_elapsed_ms": int((time.time() - loading_started_at) * 1000) if loading_started_at else None,
    }


def warmup_payload(payload):
    engine = payload.get("engine", "whisperx")
    model_name = payload.get("model", "small")
    language = payload.get("language")
    compute_type = payload.get("compute_type", "int8")
    device = resolve_device(payload.get("device", "default"))
    with model_lock:
        load_model_cached(model_name, device, compute_type, language, engine)
    return {"ok": True}


def transcribe_payload(payload):
    global last_error, last_transcribe_ms
    audio_b64 = payload.get("audio_base64")
    if not audio_b64:
        raise RuntimeError("missing audio_base64")
    engine = payload.get("engine", "whisperx")
    model_name = payload.get("model", "small")
    language = payload.get("language")
    compute_type = payload.get("compute_type", "int8")
    batch_size = int(payload.get("batch_size", 4))
    initial_prompt = payload.get("initial_prompt")
    device = resolve_device(payload.get("device", "default"))

    try:
        audio_bytes = base64.b64decode(audio_b64)
    except Exception as exc:
        raise RuntimeError(f"invalid base64: {exc}")

    with model_lock:
        model = load_model_cached(model_name, device, compute_type, language, engine)
        tmp_file = tempfile.NamedTemporaryFile(delete=False, suffix=payload.get("extension", ".webm"))
        try:
            tmp_file.write(audio_bytes)
            tmp_file.flush()
            tmp_path = tmp_file.name
        finally:
            tmp_file.close()

        try:
            start_time = time.time()
            log(
                "info",
                f"transcribe start engine={engine} model={model_name} device={device} lang={language} compute={compute_type} bytes={len(audio_bytes)}",
            )
            if engine == "whisper":
                kwargs = {
                    "language": language,
                    "initial_prompt": initial_prompt,
                    "fp16": device != "cpu",
                }
                kwargs = {k: v for k, v in kwargs.items() if v is not None and v != ""}
                result = model.transcribe(tmp_path, **kwargs)
            elif engine == "faster-whisper":
                kwargs = {
                    "language": language or None,
                    "initial_prompt": initial_prompt or None,
                }
                segments_iter, info = model.transcribe(tmp_path, **kwargs)
                segments_list = []
                for seg in segments_iter:
                    segments_list.append(
                        {
                            "start": float(seg.start),
                            "end": float(seg.end),
                            "text": seg.text,
                        }
                    )
                result = {
                    "text": " ".join(s["text"].strip() for s in segments_list).strip(),
                    "segments": segments_list,
                }
            else:
                audio = load_audio_with_fallback(tmp_path)
                kwargs = {
                    "batch_size": batch_size,
                    "language": language,
                }
                if initial_prompt:
                    try:
                        import inspect

                        sig = inspect.signature(model.transcribe)
                        if "initial_prompt" in sig.parameters:
                            kwargs["initial_prompt"] = initial_prompt
                        elif "prompt" in sig.parameters:
                            kwargs["prompt"] = initial_prompt
                    except Exception:
                        pass
                result = model.transcribe(audio, **kwargs)

            text = (result or {}).get("text", "") or ""
            segments = (result or {}).get("segments", []) or []
            if not text and segments:
                try:
                    text = " ".join(seg.get("text", "").strip() for seg in segments).strip()
                except Exception:
                    text = ""
            if not text and language and engine != "faster-whisper":
                retry_kwargs = dict(kwargs)
                retry_kwargs.pop("language", None)
                try:
                    if engine == "whisper":
                        result = model.transcribe(tmp_path, **retry_kwargs)
                    else:
                        result = model.transcribe(audio, **retry_kwargs)
                    text = (result or {}).get("text", "") or ""
                    segments = (result or {}).get("segments", []) or []
                    if not text and segments:
                        text = " ".join(seg.get("text", "").strip() for seg in segments).strip()
                except Exception:
                    pass

            elapsed_ms = int((time.time() - start_time) * 1000)
            last_transcribe_ms = elapsed_ms
            log("info", f"transcribe done ms={elapsed_ms} segments={len(segments)} text_len={len(text)}")
            return {
                "ok": True,
                "result": {"text": text, "segments": segments, "segments_len": len(segments)},
            }
        except Exception as exc:
            last_error = f"transcribe failed: {exc}"
            log("error", f"transcribe error: {exc}")
            return {"ok": False, "error": f"transcribe failed: {exc}"}
        finally:
            try:
                os.unlink(tmp_path)
            except Exception:
                pass


class WhisperXHandler(BaseHTTPRequestHandler):
    def _json_response(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/health":
            self._json_response(200, {"ok": True})
            return
        if self.path == "/status":
            self._json_response(200, status_payload())
            return
        self._json_response(404, {"error": "not found"})

    def do_POST(self):
        if self.path not in ("/transcribe", "/warmup"):
            self._json_response(404, {"error": "not found"})
            return

        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0:
            self._json_response(400, {"error": "empty body"})
            return
        raw = self.rfile.read(length)
        try:
            payload = json.loads(raw.decode("utf-8"))
        except Exception as exc:
            self._json_response(400, {"error": f"invalid json: {exc}"})
            return

        if self.path == "/warmup":
            try:
                result = warmup_payload(payload)
            except Exception as exc:
                self._json_response(500, {"error": f"model load failed: {exc}"})
                return
            self._json_response(200, result)
            return

        try:
            result = transcribe_payload(payload)
        except Exception as exc:
            self._json_response(500, {"error": f"transcribe failed: {exc}"})
            return
        if not result.get("ok"):
            self._json_response(500, {"error": result.get("error", "transcribe failed")})
            return
        self._json_response(200, result.get("result", {}))


def run_stdio():
    log("info", "stdio mode ready")
    emit_stdout({"type": "ready"})
    for raw_line in sys.stdin:
        line = raw_line.strip()
        if not line:
            continue
        try:
            msg = json.loads(line)
        except Exception as exc:
            log("error", f"invalid json: {exc}")
            continue
        msg_id = msg.get("id")
        msg_type = msg.get("type")
        payload = msg.get("payload") or {}
        if msg_id is None:
            log("error", "missing id in message")
            continue
        if msg_type == "status":
            emit_stdout({"id": msg_id, "ok": True, "result": status_payload()})
            continue
        if msg_type == "warmup":
            try:
                result = warmup_payload(payload)
            except Exception as exc:
                emit_stdout({"id": msg_id, "ok": False, "error": f"model load failed: {exc}"})
                continue
            emit_stdout({"id": msg_id, "ok": True, "result": result})
            continue
        if msg_type == "transcribe":
            try:
                result = transcribe_payload(payload)
            except Exception as exc:
                emit_stdout({"id": msg_id, "ok": False, "error": f"transcribe failed: {exc}"})
                continue
            if not result.get("ok"):
                emit_stdout({"id": msg_id, "ok": False, "error": result.get("error", "transcribe failed")})
                continue
            emit_stdout({"id": msg_id, "ok": True, "result": result.get("result", {})})
            continue
        emit_stdout({"id": msg_id, "ok": False, "error": f"unknown message type: {msg_type}"})


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--mode", default="http", choices=["http", "stdio"])
    args = parser.parse_args()

    if args.mode == "stdio":
        run_stdio()
        return

    server = HTTPServer((args.host, args.port), WhisperXHandler)
    log("info", f"listening on {args.host}:{args.port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
