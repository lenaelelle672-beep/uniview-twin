# Noto Sans SC 子集（D036 / D037）

输入用官方 Noto Sans SC 2.004 Regular。输出 `public/fonts/NotoSansSC-Regular-subset.woff`。

```bash
pip install fonttools zopfli brotli
python3 assets/tools/font-subset/subset.py \
  --input /path/to/NotoSansSC-Regular.otf \
  --output public/fonts/NotoSansSC-Regular-subset.woff
```

交付用字体以 D037 打包的 `NotoSansSC-Regular-subset.woff` 为准（625,668 B），不要用本脚本覆盖那份文件。字符表仅作备查：ASCII + 中文标点 + 页面文案 + 常用字；不包含「嗆」。
