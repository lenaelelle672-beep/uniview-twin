/**
 * 替换 troika 自带的 unicode-font-resolver 客户端。
 * 缺字不再去 jsDelivr 拉回退字体，一律落到本地子集；子集里没有的字显示占位字形。
 */
export default function unicodeFontResolverClientFactory() {
  return {
    CodePointSet: function CodePointSet() {},
    clearCache: function clearCache() {},
    getFontsForString: function getFontsForString(text) {
      return Promise.resolve({
        fontUrls: ['/fonts/NotoSansSC-Regular-subset.woff'],
        chars: new Uint8Array(text.length),
      })
    },
  }
}
