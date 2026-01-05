# build.md — LinguaLink (Google Meet) Multi-Language Captions (Spanish + Hindi)

LinguaLink is a Chrome extension that **reads Google Meet live captions** from the page and shows **two translated caption streams** (Spanish + Hindi) in an overlay panel. A Dockerized **FastAPI WebSocket** backend performs translation using a pretrained MT model (recommended: **NLLB distilled 600M**) with optional lightweight fine-tuning later.

---

## 0) What you will build

**Runtime flow**
1. Join a Google Meet.
2. Turn on **Captions**.
3. Chrome extension observes caption text updates.
4. Extension streams caption chunks to backend via WebSocket.
5. Backend returns translations:
   - Spanish (es)
   - Hindi (hi)
6. Extension overlays translated captions live.

---

## 1) Repo structure

```
lingualink/
  build.md
  backend/
    app/
      main.py
      translate.py
      chunker.py
    requirements.txt
    Dockerfile
  extension/
    manifest.json
    service_worker.js
    content_script.js
    overlay.css
  scripts/
    dev_run_backend.sh
    test_ws_client.py
```

---

## 2) Prerequisites

- Google Chrome
- Docker Desktop
- Python 3.10+

Optional:
- NVIDIA GPU for faster inference

---

## 3) Environment setup

### Python venv (optional)
```
python -m venv .venv
source .venv/bin/activate
pip install -U pip
```

### Backend requirements
See `backend/requirements.txt`:
```
fastapi
uvicorn[standard]
websockets
numpy
pydantic
transformers
torch
sentencepiece
```

---

## 4) Backend

### Caption chunker
See `backend/app/chunker.py` — merges partial caption fragments into sentence-like chunks.

### Translation
Uses `facebook/nllb-200-distilled-600M`.
Target languages:
- `spa_Latn`
- `hin_Deva`

### Run locally
```
uvicorn backend.app.main:app --reload --port 8000
curl http://localhost:8000/health
```

---

## 5) Docker

```
docker build -t lingualink-backend backend/
docker run -p 8000:8000 lingualink-backend
```

---

## 6) Chrome Extension

### Load extension
1. Go to `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select `lingualink/extension`

### Usage
- Join Meet
- Enable captions
- Overlay appears with Spanish + Hindi subtitles

---

## 7) Testing WebSocket

```
python scripts/test_ws_client.py
```

---

## 8) Deployment

Backend:
- Fly.io / Render / Railway / AWS ECS / GCP Cloud Run

Update backend URL in `service_worker.js` to use `wss://` in production.

---

## DONE
