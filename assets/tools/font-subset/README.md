# Noto Sans SC 子集（D036 / D037）

输入用官方 Noto Sans SC 2.004 Regular。输出 `public/fonts/NotoSansSC-Regular-subset.woff`。

```bash
pip install fonttools zopfli brotli
python3 assets/tools/font-subset/subset.py \
  --input /path/to/NotoSansSC-Regular.otf \
  --output public/fonts/NotoSansSC-Regular-subset.woff
```

交付用字体以 D133 的 `public/fonts/NotoSansSC-Regular-subset.woff` 为准（628,356 B，sha256 `2b3ff357a4b5d299e45c48b688ff3b356802ccb38cd866d94d09e4bc635fb110`，cmap 3,636）。本目录脚本参数与 D133 核对脚本不同，不要用它覆盖那份文件。字表：一级字 3500 + ASCII + 中文标点 + 盥瑜伽龛㎡∅≥．。不包含「嗆」。
