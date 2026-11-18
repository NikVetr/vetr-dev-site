"""Exploratory validation of contextual film-dialogue embeddings, using the existing validation split."""

import argparse
import csv
import json
from pathlib import Path

import numpy as np
import onnxruntime as ort
from tokenizers import Tokenizer

from evaluate_full import (
    dialogue_documents,
    cosine,
    evaluate,
    kernels,
    paired,
    profiles,
    read,
    summary,
)


def encode(root, documents):
    settings = ort.SessionOptions()
    settings.intra_op_num_threads = 2
    settings.inter_op_num_threads = 1
    session = ort.InferenceSession(
        str(root / "minilm.onnx"), settings, providers=["CPUExecutionProvider"]
    )
    tokenizer = Tokenizer.from_file(str(root / "tokenizer.json"))
    tokenizer.enable_truncation(max_length=128)
    tokenizer.enable_padding()
    features = np.zeros((len(documents), 384))
    for i, document in enumerate(documents):
        words = document.split()
        if not words:
            continue
        # Cover the whole chronology with up to 16 evenly spaced, adjacent dialogue windows.
        chunks = [" ".join(words[j : j + 80]) for j in range(0, len(words), 80)]
        batch = tokenizer.encode_batch(
            [
                chunks[j]
                for j in np.linspace(
                    0, len(chunks) - 1, min(16, len(chunks)), dtype=int
                )
            ]
        )
        mask = np.array([b.attention_mask for b in batch], dtype=np.int64)
        feed = dict(
            input_ids=np.array([b.ids for b in batch], dtype=np.int64),
            attention_mask=mask,
            token_type_ids=np.zeros_like(mask),
        )
        hidden = session.run(None, feed)[0]
        if not isinstance(hidden, np.ndarray) or hidden.ndim != 3:
            raise ValueError("Expected batch × token × feature encoder output")
        pooled = (hidden * mask[:, :, None]).sum(axis=1) / mask.sum(
            axis=1, keepdims=True
        )
        features[i] = (
            pooled / np.maximum(1e-12, np.linalg.norm(pooled, axis=1, keepdims=True))
        ).mean(axis=0)
    seen = features.any(axis=1)
    features[seen] -= features[seen].mean(axis=0)
    return cosine(features)


def main(root, catalog, output):
    items = read(catalog)["items"]
    text = dialogue_documents(root / "dialogues.zip", items)
    kernel = encode(root, text)
    rated = np.memmap(root / "ratings.u8", dtype="uint8", mode="r").reshape(
        -1, len(items)
    )
    with (root / "split.csv").open() as src:
        val = [
            int(r["row"]) for r in csv.DictReader(src) if r["partition"] == "validation"
        ]
    base = kernels(root, items)[0]["ratings+tags"]
    candidates = {
        "ratings+tags": ("base", base, 0.5),
        "ratings+tags+context": ("context", (2 * base + kernel) / 3, 0.5),
    }
    scores = evaluate(
        read(root / "large.json")["model"], profiles(rated, val, 307), candidates
    )
    output.write_text(
        json.dumps(
            dict(
                matched=sum(bool(d) for d in text),
                validationUsers=len(val),
                scores=[summary(k, v) for k, v in scores.items()],
                versusRatingsTags=paired(
                    scores["ratings+tags+context"], scores["ratings+tags"]
                ),
            ),
            indent=2,
        )
        + "\n"
    )


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    for key in ("root", "catalog", "output"):
        p.add_argument(key, type=Path)
    args = p.parse_args()
    main(args.root, args.catalog, args.output)
