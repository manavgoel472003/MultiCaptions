from __future__ import annotations


class CaptionChunker:
    """Merge incremental caption updates into sentence-like chunks."""

    def __init__(self) -> None:
        self._buffer = ""
        self._last_text = ""

    def append(self, text: str, *, is_final: bool) -> str:
        if not text:
            return ""

        # Ignore exact repeats from caption updates.
        if text == self._last_text:
            return ""
        self._last_text = text

        if not self._buffer:
            self._buffer = text
        elif text.startswith(self._buffer):
            self._buffer = text
        elif self._buffer.startswith(text):
            # Keep the longer buffer if the new text is a partial rewind.
            return ""
        else:
            self._buffer = f"{self._buffer} {text}"

        if is_final or self._ends_sentence(self._buffer):
            chunk = self._buffer.strip()
            self._buffer = ""
            return chunk

        return ""

    @staticmethod
    def _ends_sentence(text: str) -> bool:
        return text.endswith((".", "!", "?", "…"))
