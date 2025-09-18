"""Server-side speech-to-text fallback utilities."""

from __future__ import annotations

import asyncio
import base64
import json
import logging
import os
from dataclasses import dataclass
from typing import Optional

import numpy as np

logger = logging.getLogger("AIVA.STT")


try:  # pragma: no cover - optional dependency may be missing in CI
    from vosk import KaldiRecognizer, Model  # type: ignore
except Exception:  # pragma: no cover - gracefully degrade when unavailable
    KaldiRecognizer = None  # type: ignore
    Model = None  # type: ignore


class _LazyModel:
    """Lazy Vosk model loader guarded by an asyncio lock."""

    def __init__(self) -> None:
        self._model: Optional[Model] = None
        self._lock = asyncio.Lock()
        self._load_failed = False

    async def get(self) -> Optional[Model]:
        if self._model or self._load_failed:
            return self._model

        async with self._lock:
            if self._model or self._load_failed:
                return self._model

            if Model is None:
                logger.warning("Vosk is not available - STT fallback disabled")
                self._load_failed = True
                return None

            model_path = os.getenv("VOSK_MODEL_PATH")
            if not model_path:
                logger.warning(
                    "VOSK_MODEL_PATH not configured - unable to enable offline STT"
                )
                self._load_failed = True
                return None

            if not os.path.isdir(model_path):
                logger.error("VOSK model path %s does not exist", model_path)
                self._load_failed = True
                return None

            loop = asyncio.get_running_loop()

            def _load_model() -> Model:
                logger.info("Loading Vosk model from %s", model_path)
                return Model(model_path)  # type: ignore[call-arg]

            try:
                self._model = await loop.run_in_executor(None, _load_model)
                logger.info("Vosk model loaded successfully")
            except Exception as exc:  # pragma: no cover - defensive logging
                logger.exception("Failed to load Vosk model: %s", exc)
                self._load_failed = True
                self._model = None

        return self._model


_MODEL = _LazyModel()


@dataclass(slots=True)
class SpeechToTextResult:
    text: str
    confidence: float = 0.0
    success: bool = True
    reason: Optional[str] = None


def _pcm16_from_base64(payload: str) -> bytes:
    try:
        return base64.b64decode(payload)
    except Exception as exc:  # pragma: no cover - invalid payload handling
        raise ValueError("Invalid base64 audio payload") from exc


async def transcribe_pcm16(
    audio_base64: str,
    sample_rate: int = 16000,
    language: str = "it-IT",
) -> SpeechToTextResult:
    """Transcribe a PCM16 mono audio buffer using Vosk when available."""

    model = await _MODEL.get()
    if not model:
        return SpeechToTextResult(
            text="",
            confidence=0.0,
            success=False,
            reason="offline_model_unavailable",
        )

    pcm_bytes = _pcm16_from_base64(audio_base64)
    if not pcm_bytes:
        return SpeechToTextResult(
            text="",
            confidence=0.0,
            success=False,
            reason="empty_audio",
        )

    if sample_rate <= 0:
        sample_rate = 16000

    loop = asyncio.get_running_loop()

    def _run_recognition() -> SpeechToTextResult:
        recognizer = KaldiRecognizer(model, sample_rate)
        recognizer.SetWords(True)

        # Feed audio in chunks of 4k to keep memory usage tiny
        view = memoryview(pcm_bytes)
        step = 4000
        for offset in range(0, len(pcm_bytes), step):
            recognizer.AcceptWaveform(bytes(view[offset : offset + step]))

        result_json = recognizer.FinalResult()
        try:
            parsed = json.loads(result_json)
        except json.JSONDecodeError:
            parsed = {"text": ""}

        text = parsed.get("text", "").strip()
        confidence = 0.0
        if text:
            words = parsed.get("result") or []
            if isinstance(words, list) and words:
                confidences = [w.get("conf", 0.0) for w in words if isinstance(w, dict)]
                if confidences:
                    confidence = float(np.mean(confidences))

        return SpeechToTextResult(text=text, confidence=confidence, success=True)

    try:
        return await loop.run_in_executor(None, _run_recognition)
    except Exception as exc:  # pragma: no cover - unexpected runtime issues
        logger.exception("STT processing failed: %s", exc)
        return SpeechToTextResult(
            text="",
            confidence=0.0,
            success=False,
            reason="processing_error",
        )

