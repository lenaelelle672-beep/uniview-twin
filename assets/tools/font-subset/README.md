# Noto Sans SC 子集（D036 / D037）

输入用官方 Noto Sans SC 2.004 Regular。输出 `public/fonts/NotoSansSC-Regular-subset.woff`。

```bash
pip install fonttools zopfli brotli
python3 assets/tools/font-subset/subset.py \
  --input /path/to/NotoSansSC-Regular.otf \
  --output public/fonts/NotoSansSC-Regular-subset.woff
```

字符表：`charset.txt` = ASCII 可打印 + 中文标点 + 页面固定文案 + 《现代汉语常用字表》3500 字（及少量页面补字）。不包含「嗆」，用来验收缺字不走 CDN。产物 625,660 字节（D037 口径 625,668 B，woff + zopfli + kern）。
