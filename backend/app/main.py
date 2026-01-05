from __future__ import annotations

import json

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
import anyio

from .chunker import CaptionChunker
from .translate import translate_texts


app = FastAPI(title="LinguaLink Backend")


@app.get("/health")
def health() -> dict:
    return {"ok": True}


@app.websocket("/ws")
async def ws_translate(websocket: WebSocket) -> None:
    await websocket.accept()
    chunker = CaptionChunker()

    try:
        while True:
            message = await websocket.receive_text()
            try:
                payload = json.loads(message)
            except json.JSONDecodeError:
                await websocket.send_json({"error": "invalid_json"})
                continue

            text = str(payload.get("text", "")).strip()
            is_final = bool(payload.get("is_final", False))
            chunk = chunker.append(text, is_final=is_final)
            if not chunk:
                continue

            # Run translation off the event loop to avoid blocking other clients.
            requested = payload.get("targets")
            if isinstance(requested, list):
                target_langs = [
                    lang for lang in requested if lang in ("spa_Latn", "hin_Deva")
                ]
                if not target_langs:
                    continue
            else:
                target_langs = ["spa_Latn", "hin_Deva"]

            translations = await anyio.to_thread.run_sync(
                translate_texts, chunk, target_langs
            )
            await websocket.send_json(
                {
                    "source": chunk,
                    "translations": {
                        "es": translations.get("spa_Latn", ""),
                        "hi": translations.get("hin_Deva", ""),
                    },
                }
            )
    except WebSocketDisconnect:
        return
