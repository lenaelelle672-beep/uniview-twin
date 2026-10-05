#!/usr/bin/env python3
"""D036 / D037：从官方 Noto Sans SC 2.004 裁 woff 子集。"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from fontTools.subset import Options, Subsetter, load_font, save_font

ROOT = Path(__file__).resolve().parent
CHARSET = ROOT / "charset.txt"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    text = CHARSET.read_text(encoding="utf-8")
    unicodes = {ord(ch) for ch in text if not ch.isspace()}
    options = Options()
    options.flavor = "woff"
    options.with_zopfli = True
    options.layout_features = ["kern"]
    options.hinting = False
    options.desubroutinize = True
    options.name_IDs = ["*"]
    options.name_legacy = True
    font = load_font(str(args.input), options)
    subsetter = Subsetter(options=options)
    subsetter.populate(unicodes=unicodes)
    subsetter.subset(font)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    save_font(font, str(args.output), options)
    size = args.output.stat().st_size
    print(f"wrote {args.output} ({size} bytes, {len(unicodes)} codepoints)")
    if size > 640 * 1024:
        print(f"warning: {size} exceeds 640 KiB cap", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
