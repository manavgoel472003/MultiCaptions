from __future__ import annotations

from functools import lru_cache
from typing import Iterable

import torch
from huggingface_hub import hf_hub_download
from transformers import AutoConfig, AutoModelForSeq2SeqLM, AutoTokenizer


MODEL_NAME = "facebook/nllb-200-distilled-600M"
SRC_LANG = "eng_Latn"


@lru_cache(maxsize=1)
def _load_model():
    tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
    model = AutoModelForSeq2SeqLM.from_pretrained(
        MODEL_NAME,
        use_safetensors=False,
        weights_only=False,
    )
    if any(getattr(param, "is_meta", False) for param in model.parameters()):
        config = AutoConfig.from_pretrained(MODEL_NAME)
        weights_path = hf_hub_download(MODEL_NAME, filename="pytorch_model.bin")
        state_dict = torch.load(weights_path, map_location="cpu")
        model = AutoModelForSeq2SeqLM.from_config(config)
        model.load_state_dict(state_dict, strict=False)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model.to(device)
    return tokenizer, model, device


def translate_texts(text: str, target_langs: Iterable[str]) -> dict[str, str]:
    tokenizer, model, device = _load_model()
    tokenizer.src_lang = SRC_LANG

    results: dict[str, str] = {}
    for lang in target_langs:
        target_id = tokenizer.convert_tokens_to_ids(lang)
        if target_id is None:
            continue
        encoded = tokenizer(text, return_tensors="pt").to(device)
        generated_tokens = model.generate(
            **encoded, forced_bos_token_id=target_id
        )
        translated = tokenizer.batch_decode(generated_tokens, skip_special_tokens=True)[0]
        results[lang] = translated

    return results
