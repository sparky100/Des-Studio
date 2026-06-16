import json
from pathlib import Path
from typing import Any
import pandas as pd
import sys

# import_json_for_analysis.py
# Usage in Jupyter: run this cell (or import functions) and call load_json(path) / summarize_json(obj)


def load_json(path: str | Path) -> Any:
    """Load JSON from a file and return the parsed object."""
    p = Path(path)
    if not p.exists():
        raise FileNotFoundError(f"File not found: {p}")
    with p.open('r', encoding='utf-8') as fh:
        return json.load(fh)

def _repr_trunc(v, width=200):
    s = repr(v)
    return s if len(s) <= width else s[:width] + '...'

def summarize_json(obj: Any, max_items=5) -> None:
    """Print a concise summary of the loaded JSON object."""
    t = type(obj)
    print(f"Type: {t.__name__}")
    if isinstance(obj, dict):
        keys = list(obj.keys())
        print(f"Top-level keys ({len(keys)}): {keys[:50]}")
        for k in keys[:max_items]:
            print(f" - {k!r}: {_repr_trunc(obj[k])}")
        if len(keys) > max_items:
            print(f" ... ({len(keys)-max_items} more keys)")
    elif isinstance(obj, list):
        print(f"Length: {len(obj)}")
        if len(obj) == 0:
            return
        sample = obj[:max_items]
        print(f"Sample elements (first {len(sample)}):")
        for i, e in enumerate(sample):
            print(f" [{i}] type={type(e).__name__}: {_repr_trunc(e)}")
        # if elements are dicts, show union of keys
        if all(isinstance(e, dict) for e in obj):
            keys_union = set().union(*(e.keys() for e in obj))
            print(f"Union of keys across elements ({len(keys_union)}): {list(keys_union)[:50]}")
    else:
        print("Value:", _repr_trunc(obj))

def to_dataframe_if_possible(obj):
    """Try converting common JSON shapes to a pandas.DataFrame. Returns (df, reason) or (None, reason)."""
    try:
    except Exception as e:
        return None, f"pandas not available: {e}"
    if isinstance(obj, list) and all(isinstance(e, dict) for e in obj):
        try:
            df = pd.DataFrame(obj)
            return df, "list-of-dicts -> DataFrame"
        except Exception as e:
            return None, f"failed to build DataFrame from list-of-dicts: {e}"
    if isinstance(obj, dict):
        # dict of equal-length lists is a common shape
        if all(isinstance(v, list) for v in obj.values()):
            lengths = {len(v) for v in obj.values()}
            if len(lengths) == 1:
                try:
                    df = pd.DataFrame(obj)
                    return df, "dict-of-equal-length-lists -> DataFrame"
                except Exception as e:
                    return None, f"failed to build DataFrame from dict-of-lists: {e}"
            else:
                return None, "dict contains lists of differing lengths"
    return None, "shape not convertible to DataFrame"

if __name__ == "__main__":
    path = sys.argv[1] if len(sys.argv) > 1 else "data.json"
    obj = load_json(path)
    summarize_json(obj)
    df, reason = to_dataframe_if_possible(obj)
    if df is not None:
        print(f"\nConverted to DataFrame ({reason}) with shape {df.shape}")
        print(df.head(5).to_string(index=False))
    else:
        print(f"\nDataFrame conversion not available: {reason}")