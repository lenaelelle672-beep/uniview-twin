#!/usr/bin/env python3
"""把场景外轮廓叠到 docs/ref/site.pdf 上。蓝色是图纸，红色是场景。

用法（在仓库根目录）：
  python3 scripts/overlay-massing.py [输出目录]
默认写到 /opt/cursor/artifacts。
"""

import json
import math
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
PDF = ROOT / "docs" / "ref" / "site.pdf"
PT_PER_M = 415.3 / 50
NAMES = {
    "tower": "塔楼",
    "east": "8F楼",
    "plaza": "下沉广场",
    "podium": "弧形裙楼",
}


def inside(x, y, poly):
    hit = False
    j = len(poly) - 1
    for i in range(len(poly)):
        xi, yi = poly[i]
        xj, yj = poly[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            hit = not hit
        j = i
    return hit


def centroid(poly):
    area = cx = cy = 0.0
    for i in range(len(poly)):
        x1, y1 = poly[i]
        x2, y2 = poly[(i + 1) % len(poly)]
        cross = x1 * y2 - x2 * y1
        area += cross
        cx += (x1 + x2) * cross
        cy += (y1 + y2) * cross
    area *= 0.5
    return cx / (6 * area), cy / (6 * area)


def metrics(drawing, scene):
    pts = drawing + scene
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    step = 1.4
    inter = union = 0
    y = min(ys)
    while y <= max(ys):
        x = min(xs)
        while x <= max(xs):
            ind = inside(x, y, drawing)
            ins = inside(x, y, scene)
            if ind or ins:
                union += 1
            if ind and ins:
                inter += 1
            x += step
        y += step
    dx, dy = centroid(drawing)
    sx, sy = centroid(scene)
    shift = math.hypot(dx - sx, dy - sy) / PT_PER_M
    return (inter / union if union else 0.0), shift


def raster():
    out = Path("/tmp/site-overlay-page")
    subprocess.check_call(
        ["pdftocairo", "-png", "-r", "72", "-f", "1", "-l", "1", str(PDF), str(out)],
        stdout=subprocess.DEVNULL,
    )
    return Image.open(f"{out}-1.png").convert("RGB")


def font(size):
    for path in (
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
        "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ):
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def draw_poly(base, poly, fill, line):
    overlay = Image.new("RGBA", base.size, (0, 0, 0, 0))
    pen = ImageDraw.Draw(overlay)
    pen.polygon(poly, fill=fill)
    pen.line(poly + [poly[0]], fill=line, width=3)
    return Image.alpha_composite(base.convert("RGBA"), overlay).convert("RGB")


def main():
    dest = Path(sys.argv[1] if len(sys.argv) > 1 else "/opt/cursor/artifacts")
    dest.mkdir(parents=True, exist_ok=True)
    raw = subprocess.check_output(
        [str(ROOT / "node_modules" / ".bin" / "vite-node"), str(ROOT / "scripts" / "export-outlines.ts")],
        cwd=ROOT,
    )
    data = json.loads(raw)
    page = raster()
    report = {}
    label_font = font(28)
    for key, pair in data["masses"].items():
        drawing = [tuple(p) for p in pair["drawing"]]
        scene = [tuple(p) for p in pair["scene"]]
        overlap, shift = metrics(drawing, scene)
        report[key] = {"overlap": round(overlap, 4), "centerM": round(shift, 3)}
        image = draw_poly(page, drawing, (30, 90, 220, 70), (20, 70, 200, 255))
        image = draw_poly(image, scene, (220, 40, 40, 80), (200, 20, 20, 255))
        pts = drawing + scene
        pad = 90
        box = (
            max(0, int(min(p[0] for p in pts) - pad)),
            max(0, int(min(p[1] for p in pts) - pad)),
            min(image.width, int(max(p[0] for p in pts) + pad)),
            min(image.height, int(max(p[1] for p in pts) + pad)),
        )
        crop = image.crop(box)
        text = f"{NAMES[key]}  重叠 {overlap * 100:.1f}%   中心偏差 {shift:.2f} m"
        banner = Image.new("RGB", (crop.width, 46), (255, 255, 255))
        ImageDraw.Draw(banner).text((10, 8), text, fill=(20, 20, 20), font=label_font)
        frame = Image.new("RGB", (crop.width, crop.height + 46), (255, 255, 255))
        frame.paste(banner, (0, 0))
        frame.paste(crop, (0, 46))
        frame.save(dest / f"overlay-{key}.png")
        print(f"{NAMES[key]} overlap {overlap * 100:.2f}% center {shift:.3f} m")
    (dest / "overlay-metrics.json").write_text(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
