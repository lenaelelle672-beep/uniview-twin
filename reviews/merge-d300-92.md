# D300 merge #92（T088 FileSave lazy OUT）

| 项 | 值 |
| --- | --- |
| PR | [#92](https://github.com/lenaelelle672-beep/uniview-twin/pull/92) T088：GLB 与短录像另存为（懒加载 OUT） |
| pre / base SHA | `e2ff7381aa0389be6c93e5d3d4b4d1de3efb74e0` |
| PR head / tip SHA | `6dee80ba51c32f9f45e509c17a1446c0b2da4035` |
| merge SHA | `df4d9ebad645e1e8eff614626b75059c73f88c4e` |
| parents | `e2ff7381aa0389be6c93e5d3d4b4d1de3efb74e0` `6dee80ba51c32f9f45e509c17a1446c0b2da4035` |
| hardGate | 436346（≤ 436361，余量 15）PASS |
| balancedFx | 104555（≤ 105000，余量 445）PASS |
| 相对合前 | +0 / +0 |
| twinReady | true |
| pageerror | 0 |
| console.error | 0 |
| 结论 | **PASS** |
| CloudAgent | `bc-b42b9625-ad87-5970-a1e7-6cf2e0c59fae` |

本文件是 merge 之后单独的合口证。parent 是 merge commit `df4d9ebad645e1e8eff614626b75059c73f88c4e`。只加这一份说明，没有产品代码。

## 合并

合并前 `origin/main` 与 PR `baseRefOid` 都是 `e2ff7381aa0389be6c93e5d3d4b4d1de3efb74e0`。PR head `6dee80ba51c32f9f45e509c17a1446c0b2da4035`。当时 DRAFT、OPEN、MERGEABLE、`mergeStateStatus` CLEAN。标 ready 之后再查了一次：`isDraft` 变成 false，`headRefOid` 没有变，`mergeable` 仍是 MERGEABLE，`mergeStateStatus` 仍是 CLEAN。没有 force，没有改 feature 分支 tip，没有删分支。

```
gh pr view 92 --json state,isDraft,mergeable,mergeStateStatus,headRefOid,baseRefOid
gh pr ready 92
gh pr merge 92 --merge --match-head-commit 6dee80ba51c32f9f45e509c17a1446c0b2da4035
```

GitHub 状态是 **MERGED**，`mergedAt` 2026-10-29T08:18:41Z。`mergeCommit` 是 `df4d9ebad645e1e8eff614626b75059c73f88c4e`。两个父提交按顺序是 base `e2ff7381aa0389be6c93e5d3d4b4d1de3efb74e0` 与 tip `6dee80ba51c32f9f45e509c17a1446c0b2da4035`。merge 树与 PR head 树相同（`231f95ca34e8d410adafd69fc91055a706a04280`）。`package.json` 与 `package-lock.json` 相对合前 0 diff，相对 tip 树也是 0 diff。

`origin/integration` 仍停在 `be8303022a4733060f77ebb1cc83897d20b94aa8`。这次只把证据推到 `main`，没有快进 integration。没有合其他 PR。这一波最后一张，没有做 mid-VOID。

## 门禁

在 merge 提交 `df4d9ebad645e1e8eff614626b75059c73f88c4e` 上 `npm ci`，然后 `SHADER_PREWARM=false npm run build`。`vite preview --port 5190`，再跑 `node scripts/measure-first-screen.mjs http://127.0.0.1:5190 merge92`，均衡档 1366×768，Python `gzip.compress(9)`。脚本 `ok: true`，`failures` 为空。性能档总览没有请求 balancedFx。合前基线 `e2ff738` 为 436346 / 104555。没有对 merge SHA 做功能冒烟。

- **hardGate 436346** ≤ 436361，余量 15，**PASS**（相对合前 +0）
- **balancedFx 104555** ≤ 105000，余量 445，**PASS**（相对合前 +0）
- 性能档首屏 hardGate 口径 422769（合前 422769，+0）。少掉的是均衡档才拉的 `street-tree-hi.glb`（gzip9 13577）：436346 − 13577 = 422769。性能档没有 balancedFx，也没有 `FileSave.js`
- 相对合前公布表，硬门禁各项 gzip9 都没变。入口、`balancedFx`、`EastGrille`、`shellClipCompile`、`shadowBake`、CSS、`index.html`、五份首屏模型与合口证 #93 逐字节相同
- 入口 `index-DvVbpDCe.js` raw 1413274，gzip9 400148，sha256 `18f76ed1b1266c774bb9510f6d3c566f263fdcc1e5f132a7cc150685bef35dd2`。`showSaveFilePicker`、`createWritable`、`mountFileSave`、`FileSave` 都是 0 处
- `balancedFx-kaJaqP6.js` raw 246234，gzip9 104555，sha256 `9b77a1e195eb09188eb6d9cbffb63ae08cd220e014c1c9d63a09eed8614ea54f`。与合前逐字节相同。上面这些名字也是 0 处
- `index.html` raw 483，gzip9 338，sha256 `5f9165a3d58df929dddd090223cb4d9d0bb0a0b948231f51d8faacd088f385fc`
- `EastGrille-CBQaGDp.js` gzip9 1053，sha256 `55190fe1508af9fe8a1717e05dac368249e7213c50b481b1b9a7036a8d06f5e1`。`shellClipCompile-CmEhQ7D.js` gzip9 1433，sha256 `288d1db2d9f6b7d29109b7ca2ba325c464b2bd1efec4c26b535f7d237315578b`。`shadowBake-BIDE4SL.js` gzip9 1709。`index-DgSBdyaU.css` gzip9 3666。测量窗口的 hardGate 文件里没有 `FileSave.js`、`dock-CXtj27U.js`
- `FileSave.js` raw 2511，gzip9 1148，sha256 `4b6291770842c5747330e235a0ea88e027888b14b077c0872ecce0287d08b7ce`。含 `showSaveFilePicker`、`createWritable`、`mountFileSave`、`uniview-clip.webm`、`.glb`、`AbortError`。没有 `shareShot`、`clipboard`、`ClipboardItem`、`MediaRecorder`、`DocumentWatch`、`PipWatch`、`CycleRaycast`。gzip9 大于余量 15。测量窗口没有请求
- `dock-CXtj27U.js` 文件名不变。合前 raw 16488、gzip9 6235、sha256 `31932cbdf16fffd9db6c8912efc184a8a6d289a415381394cce2cc41fbeedd0d`。现在 raw 16550、gzip9 6248、sha256 `ef2ba4fa3657507ad618eafc05bbb5b4f3361fa0438a80d00e06354c081f3df4`。多出来的 62 字节是 `void import("./FileSave.js").then((m)=>{m.mountFileSave()});` 和它前后的换行。删掉这 62 字节后 sha256 回到合前。dock 里有 `mountFileSave` 与 `FileSave`，`showSaveFilePicker` 与 `createWritable` 是 0 处。dock 不在 hardGate 里
- `DocumentWatch.js` raw 9009，gzip9 3594，sha256 `adee0e4e7e1deb5d363b0ea3c06e50f5e1001fede9dfda9894cdb0c2963b26e6`。`PipWatch.js` raw 6162，gzip9 2432，sha256 `6f6a1f121b1e07b41762aae5f43bb222ca20615465d58297bcaec8e10482136d`。两份与合口证 #93 逐字节相同。测量窗口没有请求
- 这次 dist 185 个。合口证 #93 记录当时产物 184 个。多出来的是 `FileSave.js`

同一预览上，均衡档与性能档 1366×768、swiftshader，`__twinReady` 后再等 1500ms（与量脚本同一窗口）：`window.__twinReady === true`，`pageerror` 0，`console.error` 0。均衡档请求了 balancedFx，性能档没有。这个窗口里没有请求 `FileSave.js` 或 `dock-CXtj27U.js`。

结论：**PASS**。

### hardGate 文件

| gzip9 | url |
| ---: | --- |
| 400148 | `/assets/index-DvVbpDCe.js` |
| 13577 | `/models/street-tree-hi.glb` |
| 5061 | `/models/roof-sign.glb` |
| 3666 | `/assets/index-DgSBdyaU.css` |
| 3466 | `/models/street-tree-lo.glb` |
| 3229 | `/models/east-grille-v4-lo.glb` |
| 2666 | `/models/street-lamp.glb` |
| 1709 | `/assets/shadowBake-BIDE4SL.js` |
| 1433 | `/assets/shellClipCompile-CmEhQ7D.js` |
| 1053 | `/assets/EastGrille-CBQaGDp.js` |
| 338 | `/?q=balanced` |
