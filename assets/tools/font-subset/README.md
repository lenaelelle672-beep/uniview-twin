# Noto Sans SC 子集（D036 / D037）

输入用官方 Noto Sans SC 2.004 Regular。输出 `public/fonts/NotoSansSC-Regular-subset.woff`。

```bash
pip install fonttools zopfli brotli
python3 assets/tools/font-subset/subset.py \
  --input /path/to/NotoSansSC-Regular.otf \
  --output public/fonts/NotoSansSC-Regular-subset.woff
```

字符表：`charset.txt` = ASCII 可打印 + 页面固定文案 + 词频前 3500 汉字。不包含「嗆」，用来验收缺字不走 CDN。当前产物约 640,060 字节，低于 640 KiB 上限。
