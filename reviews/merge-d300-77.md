# D300 merge #77（T070 Center+Bounds）

| 项 | 值 |
| --- | --- |
| pre SHA | `49412c855bdad04c22d5646bc3a7b90cbb93571f` |
| merge SHA | `94939206e80df43c874877384c399858c4d358e2` |
| parents | `49412c855bdad04c22d5646bc3a7b90cbb93571f` `18b3a2ec3f7f9db8279278f18f14535fc9b37d2e` |
| PR head | `18b3a2ec3f7f9db8279278f18f14535fc9b37d2e` |
| hardGate | 436317（≤ 436361，余量 44）PASS |
| balancedFx | 104553（≤ 105000，余量 447）PASS |
| twinReady | true |
| pageerror | 0 |
| CloudAgent | `bc-67094064-1e3c-51a4-92fa-d20c58f51def` |

本文件按 `reviews/merge-d300-70.md` / `reviews/merge-d300-71.md` / `reviews/merge-d300-72.md` / `reviews/merge-d300-73.md` / `reviews/merge-d300-74.md` / `reviews/merge-d300-75.md` / `reviews/merge-d300-76.md` 的字段来写：合并前 SHA、merge SHA、parents、门禁数字、twinReady / pageerror、CloudAgent id。

## 合并

合并前 `origin/main` 是 `49412c855bdad04c22d5646bc3a7b90cbb93571f`。PR #77 的 `headRefOid` 是 `18b3a2ec3f7f9db8279278f18f14535fc9b37d2e`。合并前 `isDraft` 为 true，`state` 为 OPEN，`mergeable` 为 MERGEABLE，`mergeStateStatus` 为 CLEAN。草稿已标为 ready。标成 ready 之后再查了一次：`headRefOid` 仍是 `18b3a2ec3f7f9db8279278f18f14535fc9b37d2e`，`baseRefOid` 仍是 `49412c855bdad04c22d5646bc3a7b90cbb93571f`。没有改写这条 tip。

`gh pr merge` 没有 `--no-ff` 开关。用的是 merge commit 策略（不是 squash，不是 rebase），并锁了 `--match-head-commit 18b3a2ec3f7f9db8279278f18f14535fc9b37d2e`：

```
gh pr ready 77 --repo lenaelelle672-beep/uniview-twin
gh pr merge 77 --repo lenaelelle672-beep/uniview-twin --merge --match-head-commit 18b3a2ec3f7f9db8279278f18f14535fc9b37d2e
```

没有 force-push。GitHub [PR #77](https://github.com/lenaelelle672-beep/uniview-twin/pull/77) 状态是 **MERGED**，`mergeCommit` 是 `94939206e80df43c874877384c399858c4d358e2`（`mergedAt` 2026-10-25T08:55:07Z）。两个父提交是 `49412c855bdad04c22d5646bc3a7b90cbb93571f` 与 `18b3a2ec3f7f9db8279278f18f14535fc9b37d2e`。merge 树与 PR head 树相同（`2efe1571da65bde7327d92c1b37f2f3e5255de36`）。

`origin/integration` 停在 `be8303022a4733060f77ebb1cc83897d20b94aa8`（PR #61 的证据提交），是 `main` 的祖先。到这次证据提交，`git rev-list --count origin/integration..main` 是 42。#62 之后的 merge-d300 证据只推 `main`，没有把 integration 快进到 main。这次同样只推 `main`。

门禁跑在 merge 提交上。本说明是紧随其后的一次提交，只加这个证据文件，不含产品代码，parent 是该 merge commit。

## 门禁

在 `94939206e80df43c874877384c399858c4d358e2` 上 `npm ci`，然后 `SHADER_PREWARM=false npm run build`。`vite preview --port 5190`，再跑 `scripts/measure-first-screen.mjs`，均衡档 1366×768，Python `gzip.compress(9)`。脚本 `ok: true`，`failures` 为空。性能档总览没有请求 balancedFx。相对合前基线 436320 / 104552。

- **hardGate 436317** ≤ 436361，余量 44，**PASS**（相对合前基线 436320 / 104552 为 −3 / +1）
- **balancedFx 104553** ≤ 105000，余量 447，**PASS**
- 性能档总览没有请求 balancedFx（gzip 0），也没有 `street-tree-hi.glb`，也没有 `TreeLod-*.js`，也没有 `BatchSegments.js`，也没有 `MotionPathPlayer.js`，也没有 `FocusCenter.js`，也没有 `FocusBounds.js`。性能档首屏 hardGate 口径 422740（合前 422743，−3）。少掉的正是均衡档才拉的 `street-tree-hi.glb`（gzip9 13577）：436317 − 13577 = 422740
- 入口 `index-DbRjsYXi.js` raw 1413239，gzip9 400116，sha256 `6df4633125ebec2cdfb029e9bfad30d3c7dc837071884e7337821932039b6979`。raw 与合前入口相同（合前 gzip9 400118，sha256 `34895e3217dfd62cefa9d0a2a19be7681660ad2897fd27016dd86db42fdda5d7`，文件名 `index-0ImjlkmT.js`）。入口里 `FocusMount`、`FocusCenter`、`FocusBounds`、`mountFocusFit`、`CenterFit`、`BoundsFit`、`focus-fit`、`onCentered`、`__twinFocusFit` 都是 0 处，`MotionPathControls`、`useMotion`、`TourMotionPath`、`tour-path`、`MotionPathPlayer`、`BatchSegments`、`SegmentMount`、`segments/mount`、`mountBatchSegments`、`TreeLod`、`Detailed-`、`useDetailedLevel`、`WallDecals`、`DecalMount` 也都是 0 处。`street-tree-hi` 仍是 1 处，精细树仍在首屏 hardGate 里。入口引用了新的 `dock-BmXUbjb.js`（1 处）、`balancedFx-CNf9M9t.js`（3 处）、`shellClipCompile-CTGtCTI.js`（1 处）、`EastGrille-ux5rLai.js`（1 处）。快捷键表在 `host-CuPJFLj.js`，由 `arm-DKcRskJ.js` 再按 `?` 加载，不在入口里。这些文件名的哈希长度与合前相同，所以入口 raw 不变，gzip9 少 2
- `balancedFx-CNf9M9t.js` raw 246234，gzip9 104553，sha256 `9f81d8a80b6a5c664021a23cf746ed5d21c78ce67a5962cb4dce207b210cd78e`。raw 与合前相同（合前 gzip9 104552，sha256 `4c2ac6d8e90a36b7f2a39e121b244a218db2c4f3572c1e3340e88a1b51418fd6`，文件名 `balancedFx-ptY95sN.js`）。`balancedFx` 里 `FocusMount`、`FocusCenter`、`FocusBounds`、`CenterFit`、`BoundsFit`、`MotionPathControls`、`useMotion`、`TourMotionPath`、`tour-path`、`BatchSegments`、`SegmentMount`、`TreeLod` 都是 0 处。它引用新入口文件名，gzip9 多 1
- `index.html` raw 483，gzip9 340，sha256 `f4f59f6133c5e1fb9eca1f9a6369a659ca2ece252e8b4cfccf93605b300769af`。合前 raw 相同，gzip9 341，sha256 `6085225041545f05a1a451b98deaa730dfb28aa7216fee392760e17bba705769`。脚本 src 换成了 `index-DbRjsYXi.js`。测量窗口里 `/?q=balanced` 的 gzip9 也是 340
- `shellClipCompile-CTGtCTI.js` raw 3063，gzip9 1434，sha256 `f56354e9a7d380d35cce7a5f809f20244273092bcf0657913966969e1b4ac27e`（合前 `shellClipCompile-ZyBuKyH.js` gzip9 1433，+1）。`EastGrille-ux5rLai.js` raw 2090，gzip9 1053，sha256 `9547c5c9022f569594d1d7522f68c81406b7780977ae86d2f00c2a047c43ce1f`（合前 `EastGrille-D5B6AXe.js` gzip9 1054，−1）。`shadowBake-BIDE4SL.js` 文件名、raw 4321、gzip9 1709 都与合前相同。入口 −2、html −1、shellClip +1、EastGrille −1，hardGate 合计 436320 − 3 = 436317
- `FocusMount.js` raw 8553，gzip9 3374，sha256 `08044a3ec80137fee5efbdc3126e9281e96e8b8c42410cc869c7393c6c46744d`。静态 import 只有 `./index-DbRjsYXi.js`。动态 import 是 `./FocusCenter.js` 与 `./FocusBounds.js`。`mountFocusFit` 1 处，`__twinFocusFit` 1 处。`CenterFit` 与 `BoundsFit` 各 1 处，是动态 import 之后的属性访问。`onCentered` 与 `maxDuration` 都是 0 处。不在 hardGate 文件里。默认总览不请求 `FocusCenter.js`、`FocusBounds.js`
- `FocusCenter.js` raw 82392，gzip9 25180，sha256 `ebd66d6d7490db6bbbe3535bb667f677a84d58f5fe2ee3b6773022e7df90d4a4`。静态 import 只有 `./index-DbRjsYXi.js`。`onCentered` 2 处，`maxDuration` 0 处，导出 `CenterFit`。不在 hardGate 文件里
- `FocusBounds.js` raw 85920，gzip9 26266，sha256 `841bd290a8906930c4594d00a4ff9122cc2ede24b58776de6dc9ab9b69e75028`。静态 import 只有 `./index-DbRjsYXi.js`。`maxDuration` 2 处，`onCentered` 0 处，导出 `BoundsFit`。不在 hardGate 文件里
- `MotionPathPlayer.js` raw 145823，gzip9 42325，sha256 `f87ff4fd0e7f28af4dba68ffb232be3fb8bba11f972b8b4260bd80b525719735`（合前 gzip9 42324）。`SegmentMount.js` raw 8844，gzip9 3552，sha256 `f42d4d8336de6ee1da07e9da476dec356591696522b052d4ee9447acbf8ce65f`（合前 gzip9 3553）。`BatchSegments.js` raw 22370，gzip9 7297，sha256 `78fa080b25e699cba1d10b66e318f73097bbea8f0cc2c6ee19477ec139b3cd36`（合前 gzip9 7298）。三份都不在 hardGate 文件里，差的是入口文件名引用。默认总览不请求 `BatchSegments.js`，也不请求 `MotionPathPlayer.js`
- `dock-BmXUbjb.js` raw 15382，gzip9 6015，sha256 `9fdd15eb8c7d60b6a21b54a705b8795fe3b2068b17390d70f9802805e8174cd6`。合前是 `dock-B634wVf.js` raw 15318、gzip9 6003、sha256 `be6b540a8a3eeb19aa5e7aea810a8fb0a3bbe8a402e818702cf0e1b54a8fd94a`。多出来的 64 字节就是哈希定稿之后接上的一行：`void import("./FocusMount.js").then((m)=>{m.mountFocusFit()})`。文件名变了，是因为快捷键表改了 `host-CuPJFLj.js`，`arm-DKcRskJ.js` 引用它，dock 在哈希前就 `import("./arm-DKcRskJ.js")`，入口又引用 dock，dock 里的入口引用换成了 `./index-DbRjsYXi.js`。这 64 字节不进 dock 的文件名哈希。`FocusCenter`、`FocusBounds`、`onCentered`、`maxDuration` 在 dock 里都是 0 处。`MotionPathControls`、`useMotion`、`TourMotionPath` 也是 0 处。不在 hardGate 文件里
- 锁机 cutoff 是首帧 + 64ms。另一次冒烟把页面留到 `__twinReady` 之后 12000ms：均衡档 dock、floorDecor 在首帧后 2617ms，textRuntime 在 2619ms，Detailed 在 2629ms，DecalMount、SegmentMount 与 FocusMount 都在 2648ms，LayerPanel 在 2661ms，TreeLod 在 2923ms。`street-tree-hi.glb` 与 `street-tree-lo.glb`、balancedFx 都在首帧之前。这次没有请求 `FocusCenter.js`、`FocusBounds.js`、`MotionPathPlayer.js`。性能档 dock、floorDecor 都在 2604ms，textRuntime 在 2605ms，Detailed 在 2631ms，DecalMount、SegmentMount 与 FocusMount 都在 2654ms，LayerPanel 在 2665ms。性能档这次没有请求 balancedFx、`street-tree-hi.glb`、TreeLod、`BatchSegments.js`、`MotionPathPlayer.js`、`FocusCenter.js`、`FocusBounds.js`。两个总览档位的这些后到分包都在 cutoff 之外。默认 `window.__twinFocusFit` 为 `{ resident: false, center: false, bounds: false, centerLoaded: false, boundsLoaded: false, mode: "off", subject: null, handedBack: true, blocked: "" }`。默认 `window.__twinMotionPath` 为 undefined（播放包没加载）。默认 `window.__twinSegments` 为 `{ on: false, mounted: false, shown: 0, limit: 48, dropped: 0, source: "off", floorId: null }`
- 控制台冒烟：均衡档与性能档各一次，`window.__twinReady === true`，`pageerror` 为 0，`console.error` 为 0。视口 1366×768，swiftshader。`preserveDrawingBuffer` 为 false

结论：**PASS**。

### hardGate 文件

| gzip9 | url |
| ---: | --- |
| 400116 | `/assets/index-DbRjsYXi.js` |
| 13577 | `/models/street-tree-hi.glb` |
| 5061 | `/models/roof-sign.glb` |
| 3666 | `/assets/index-DgSBdyaU.css` |
| 3466 | `/models/street-tree-lo.glb` |
| 3229 | `/models/east-grille-v4-lo.glb` |
| 2666 | `/models/street-lamp.glb` |
| 1709 | `/assets/shadowBake-BIDE4SL.js` |
| 1434 | `/assets/shellClipCompile-CTGtCTI.js` |
| 1053 | `/assets/EastGrille-ux5rLai.js` |
| 340 | `/?q=balanced` |
