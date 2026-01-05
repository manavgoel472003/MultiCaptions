import asyncio
import json
import sys

import websockets


def safe_print(text: str) -> None:
    sys.stdout.buffer.write((text + "\n").encode("utf-8", errors="replace"))
    sys.stdout.flush()


async def main() -> None:
    uri = "ws://localhost:8000/ws"
    async with websockets.connect(uri) as ws:
        samples = [
            "Hello everyone and welcome to the meeting",
            "We will review the quarterly plan.",
        ]
        for text in samples:
            await ws.send(json.dumps({"text": text, "is_final": True}))
            response = await ws.recv()
            safe_print(response)


if __name__ == "__main__":
    asyncio.run(main())
