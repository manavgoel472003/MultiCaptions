#!/usr/bin/env bash
set -euo pipefail

uvicorn backend.app.main:app --reload --port 8000
