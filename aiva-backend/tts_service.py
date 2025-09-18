"""Server-side text-to-speech helper leveraging offline/open-source engines."""

from __future__ import annotations

import asyncio
import base64
import logging
import os
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

logger = logging.getLogger("AIVA.TTS")


try:  # pragma: no cover - optional dependency handling
    import pyttsx3  # type: ignore
except Exception:  # pragma: no cover - fallback when dependency missing
    pyttsx3 = None  # type: ignore


try:  # pragma: no cover - optional dependency handling
    from gtts import gTTS  # type: ignore
except Exception:  # pragma: no cover
    gTTS = None  # type: ignore


@dataclass(slots=True)
class TTSResult:
    audio_base64: str
    mime_type: str
    success: bool = True
    reason: Optional[str] = None


class OfflineTTSEngine:
    """Wrapper that attempts pyttsx3 first and falls back to gTTS."""

    def __init__(self) -> None:
        self._engine = None
        self._engine_lock = asyncio.Lock()
        self._engine_ready = False
        self._engine_failed = False

    async def _ensure_engine(self) -> Optional[object]:
        if self._engine_ready:
            return self._engine
        if self._engine_failed:
            return None

        async with self._engine_lock:
            if self._engine_ready:
                return self._engine
            if self._engine_failed:
                return None

            if pyttsx3 is None:
                logger.warning("pyttsx3 not available - skipping offline engine")
                self._engine_failed = True
                return None

            loop = asyncio.get_running_loop()

            def _init_engine():
                engine = pyttsx3.init()
                # Ensure Italian voice preference when available
                preferred_voice = os.getenv("PYTTSX3_VOICE", "it")
                for voice in engine.getProperty("voices"):
                    name = getattr(voice, "name", "") or ""
                    lang = "".join(getattr(voice, "languages", []) or [])
                    if preferred_voice.lower() in name.lower() or preferred_voice in lang.lower():
                        engine.setProperty("voice", voice.id)
                        break
                engine.setProperty("rate", int(os.getenv("PYTTSX3_RATE", "170")))
                engine.setProperty("volume", float(os.getenv("PYTTSX3_VOLUME", "1.0")))
                return engine

            try:
                self._engine = await loop.run_in_executor(None, _init_engine)
                self._engine_ready = True
            except Exception as exc:  # pragma: no cover - environment specific
                logger.exception("Unable to initialise pyttsx3 engine: %s", exc)
                self._engine_failed = True
                self._engine = None

        return self._engine

    async def synthesize(self, text: str, voice: Optional[str] = None) -> Optional[TTSResult]:
        if not text.strip():
            return TTSResult(audio_base64="", mime_type="audio/wav", success=False, reason="empty_text")

        engine = await self._ensure_engine()
        if engine is None:
            return None

        loop = asyncio.get_running_loop()

        def _render_to_bytes() -> Optional[bytes]:
            tmp_path = Path(tempfile.mkstemp(suffix=".wav")[1])
            try:
                if voice:
                    try:
                        engine.setProperty("voice", voice)
                    except Exception:  # pragma: no cover
                        logger.debug("Requested voice %s not available", voice)

                engine.save_to_file(text, str(tmp_path))
                engine.runAndWait()
                if not tmp_path.exists():
                    return None
                return tmp_path.read_bytes()
            finally:
                try:
                    tmp_path.unlink(missing_ok=True)
                except Exception:
                    pass

        audio_bytes = await loop.run_in_executor(None, _render_to_bytes)
        if not audio_bytes:
            return None

        return TTSResult(
            audio_base64=base64.b64encode(audio_bytes).decode("ascii"),
            mime_type="audio/wav",
            success=True,
        )


class GTTSFallback:
    """Optional network-based fallback using Google's unofficial endpoint."""

    @staticmethod
    async def synthesize(text: str, lang: str = "it") -> Optional[TTSResult]:
        if gTTS is None:
            return None
        if not text.strip():
            return TTSResult(audio_base64="", mime_type="audio/mpeg", success=False, reason="empty_text")

        loop = asyncio.get_running_loop()

        def _render_mp3() -> Optional[bytes]:
            with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp:
                tmp_path = Path(tmp.name)
            try:
                tts = gTTS(text=text, lang=lang)
                tts.save(str(tmp_path))
                return tmp_path.read_bytes()
            except Exception as exc:  # pragma: no cover - depends on network
                logger.error("gTTS synthesis failed: %s", exc)
                return None
            finally:
                try:
                    tmp_path.unlink(missing_ok=True)
                except Exception:
                    pass

        audio_bytes = await loop.run_in_executor(None, _render_mp3)
        if not audio_bytes:
            return None

        return TTSResult(
            audio_base64=base64.b64encode(audio_bytes).decode("ascii"),
            mime_type="audio/mpeg",
            success=True,
        )


_offline_tts = OfflineTTSEngine()


async def synthesize_speech(text: str, voice: Optional[str] = None) -> TTSResult:
    """Generate speech audio using offline engine or fallback network TTS."""

    try:
        offline_result = await _offline_tts.synthesize(text, voice=voice)
    except Exception as exc:  # pragma: no cover
        logger.exception("Offline TTS synthesis raised an error: %s", exc)
        offline_result = None

    if offline_result and offline_result.success:
        return offline_result

    # Fallback to gTTS when offline engine unavailable
    try:
        fallback_lang = (voice or "it").split("-")[0]
        gtts_result = await GTTSFallback.synthesize(text, lang=fallback_lang or "it")
        if gtts_result:
            return gtts_result
    except Exception as exc:  # pragma: no cover
        logger.exception("gTTS fallback failed: %s", exc)

    reason = offline_result.reason if offline_result else "tts_unavailable"
    return TTSResult(audio_base64="", mime_type="audio/wav", success=False, reason=reason)

