# D300 merge #79（T077 Clone）

| 项 | 值 |
| --- | --- |
| pre SHA | `72288f808f708f99b8549671feed6633710b61b5` |
| merge SHA | `f3e25a5fc60c8d9be2bed58616c1dcd4ce239923` |
| parents | `72288f808f708f99b8549671feed6633710b61b5` `43f9160b75f1338a5e0d424919e029fa6ca8a5ec` |
| PR head | `43f9160b75f1338a5e0d424919e029fa6ca8a5ec` |
| hardGate | 436317（≤ 436361，余量 44）PASS |
| balancedFx | 104553（≤ 105000，余量 447）PASS |
| twinReady | true |
| pageerror | 0 |
| CloudAgent | `bc-c175a2a2-2944-59ec-b270-c00b5ec6cea3` |

本文件按 `reviews/merge-d300-76.md` / `reviews/merge-d300-77.md` / `reviews/merge-d300-78.md` 的字段来写：合并前 SHA、merge SHA、parents、门禁数字、twinReady / pageerror、CloudAgent id。

## 合并

合并前 `origin/main` 是 `72288f808f708f99b8549671feed6633710b61b5`。PR #79 的 `headRefOid` 是 `43f9160b75f1338a5e0d424919e029fa6ca8a5ec`。合并前 `isDraft` 为 true，`state` 为 OPEN，`mergeable` 为 MERGEABLE，`mergeStateStatus` 为 CLEAN。草稿已标为 ready。标成 ready 之后再查了一次：`headRefOid` 仍是 `43f9160b75f1338a5e0d424919e029fa6ca8a5ec`，`baseRefOid` 仍是 `72288f808f708f99b8549671feed6633710b61b5`。没有改写这条 tip。

`gh pr merge` 没有 `--no-ff` 开关。用的是 merge commit 策略（不是 squash，不是 rebase），并锁了 `--match-head-commit 43f9160b75f1338a5e0d424919e029fa6ca8a5ec`：

```
gh pr ready 79 --repo lenaelelle672-beep/uniview-twin
gh pr merge 79 --repo lenaelelle672-beep/uniview-twin --merge --match-head-commit 43f9160b75f1338a5e0d424919e029fa6ca8a5ec
```

没有 force-push。GitHub [PR #79](https://github.com/lenaelelle672-beep/uniview-twin/pull/79) 状态是 **MERGED**，`mergeCommit` 是 `f3e25a5fc60c8d9be2bed58616c1dcd4ce239923`（`mergedAt` 2026-10-27T05:05:43Z）。两个父提交是 `72288f808f708f99b8549671feed6633710b61b5` 与 `43f9160b75f1338a5e0d424919e029fa6ca8a5ec`。merge 树与 PR head 树相同（`7b8d995047252144b09e019ac7b3d0d161ebf4d9`）。

`origin/integration` 停在 `be8303022a4733060f77ebb1cc83897d20b94aa8`（PR #61 的证据提交），是 `main` 的祖先。到这次证据提交，`git rev-list --count origin/integration..main` 是 48。#62 之后的 merge-d300 证据只推 `main`，没有把 integration 快进到 main。这次同样只推 `main`。

门禁跑在 merge 提交上。本说明是紧随其后的一次提交，只加这个证据文件，不含产品代码，parent 是该 merge commit。

## 门禁

在 `f3e25a5fc60c8d9be2bed58616c1dcd4ce239923` 上 `npm ci`，然后 `SHADER_PREWARM=false npm run build`。`vite preview --port 5190`，再跑 `scripts/measure-first-screen.mjs`，均衡档 1366×768，Python `gzip.compress(9)`。脚本 `ok: true`，`failures` 为空。性能档总览没有请求 balancedFx。相对合前基线 436317 / 104553。

- **hardGate 436317** ≤ 436361，余量 44，**PASS**（相对合前基线 436317 / 104553 为 +0 / +0）
- **balancedFx 104553** ≤ 105000，余量 447，**PASS**
- 性能档总览没有请求 balancedFx（gzip 0），也没有 `street-tree-hi.glb`，也没有 `TreeLod-*.js`，也没有 `BatchSegments.js`，也没有 `MotionPathPlayer.js`，也没有 `FocusCenter.js`，也没有 `FocusBounds.js`，也没有 `TourPathLine.js`，也没有 `FragmentClones.js`。性能档首屏 hardGate 口径 422740（合前 422740，同为 +0）。少掉的正是均衡档才拉的 `street-tree-hi.glb`（gzip9 13577）：436317 − 13577 = 422740
- 入口 `index-DbRjsYXi.js` raw 1413239，gzip9 400116，sha256 `6df4633125ebec2cdfb029e9bfad30d3c7dc837071884e7337821932039b6979`。与合前逐字节相同（文件名仍是 `index-DbRjsYXi.js`）。入口里 `CloneMount`、`FragmentClones`、`mountFragmentClones`、`fragment-clone`、`__twinClone`、`fragmentClone` 都是 0 处。子串 `Clone` 有 5 处，文件与合前相同，是合前就在入口里的 `removeRootViewTransitionClone`、`measureClonedInstance` 和 `ClonedMaterial`，不是 drei Clone。`CatmullRomLine`、`TourPath`、`tour-path`、`mountTourPath`、`TourPathLine`、`TourPathMount` 都是 0 处。`FocusMount`、`FocusCenter`、`FocusBounds`、`mountFocusFit`、`CenterFit`、`BoundsFit`、`focus-fit`、`onCentered`、`__twinFocusFit` 都是 0 处，`MotionPathControls`、`useMotion`、`TourMotionPath`、`MotionPathPlayer`、`BatchSegments`、`SegmentMount`、`segments/mount`、`mountBatchSegments`、`TreeLod`、`Detailed-`、`useDetailedLevel`、`WallDecals`、`DecalMount` 也都是 0 处。`street-tree-hi` 仍是 1 处，精细树仍在首屏 hardGate 里。入口里 `CatmullRomCurve3` 是 5 处、`CatmullRom` 是 13 处，文件与合前相同，这是合前就在入口里的 three 曲线
- `balancedFx-CNf9M9t.js` raw 246234，gzip9 104553，sha256 `9f81d8a80b6a5c664021a23cf746ed5d21c78ce67a5962cb4dce207b210cd78e`。与合前逐字节相同（文件名仍是 `balancedFx-CNf9M9t.js`）。`balancedFx` 里 `Clone`、`CloneMount`、`FragmentClones`、`mountFragmentClones`、`__twinClone`、`materialsOnly`、`CatmullRomLine`、`TourPath`、`tour-path`、`mountTourPath`、`FocusMount`、`FocusCenter`、`FocusBounds`、`CenterFit`、`BoundsFit`、`MotionPathControls`、`useMotion`、`TourMotionPath`、`BatchSegments`、`SegmentMount`、`TreeLod` 都是 0 处
- `index.html` raw 483，gzip9 340，sha256 `f4f59f6133c5e1fb9eca1f9a6369a659ca2ece252e8b4cfccf93605b300769af`。与合前逐字节相同。测量窗口里 `/?q=balanced` 的 gzip9 也是 340
- `shellClipCompile-CTGtCTI.js`、`EastGrille-ux5rLai.js`、`shadowBake-BIDE4SL.js`、`index-DgSBdyaU.css` 都与合前逐字节相同。同参重建合前 `72288f8` 的 dist：160 个既有产物逐字节相同。字节有差的只有 `dock-BmXUbjb.js`，另加两份新懒包 `CloneMount.js`、`FragmentClones.js`。`LayerPanel-DfEgjJK.js` 与合前逐字节相同，不进 hardGate
- `dock-BmXUbjb.js` 文件名不变（哈希定稿后才把接线接回去）。合前 raw 15449、gzip9 6025、sha256 `385e5e68292eacbe107282592e0f51ec9219633c0939dec2640e5bd9ee707fcc`。现在 raw 15519、gzip9 6037、sha256 `2683d42a8618bb4c4af1e001c147284a7f67a2e8eaf7d3a7ab2ba8d89d1c0cc0`。前 15449 字节与合前逐字节相同。多出来的 70 字节就是换行加上 `void import("./CloneMount.js").then((m)=>{m.mountFragmentClones()});` 再一个换行。这 70 字节不进 dock 的文件名哈希，也不进 hardGate。dock 里 `CloneMount` 是 1 处，`mountFragmentClones` 是 1 处，`FragmentClones.js` 是 0 处，`CatmullRomLine`、`TourPathLine`、`FocusCenter`、`FocusBounds` 都是 0 处，`mountTourPath` 是 1 处
- `CloneMount.js` raw 3488，gzip9 1696，sha256 `d0446c2caff27b8bd1df8782bfae7c32a978b95a96494a303281f4d428171151`。静态 import 只有 `./index-DbRjsYXi.js`。动态 import 是 `./FragmentClones.js`。`mountFragmentClones` 1 处，`__twinClone` 2 处，`materialsOnly` 0 处，`isSkinnedMesh` 0 处。不在 hardGate 文件里。gzip9 1696 大于 hardGate 余量 44。dock 只调用 `mountFragmentClones`。默认总览会在 cutoff 之后请求 `CloneMount.js`，不请求 `FragmentClones.js`
- `FragmentClones.js` raw 7798，gzip9 3144，sha256 `9f6a4edea636bec52fd624ea833f08a212238f3e24326ef89da52a13dbc6dcbc`。静态 import 只有 `./index-DbRjsYXi.js`。压缩后没有独立的 `Clone` 导出名，drei Clone 的实现在这个包里：`materialsOnly` 1 处，`isSkinnedMesh` 2 处，`FragmentClones` 2 处，`FragmentClone` 1 处，`__twinClone` 2 处。`deep` 常量是 false，`castShadow` / `receiveShadow` 常量是 true，源是 `street_lamp` 的 `lamp_body` 与 `lamp_light`。不在 hardGate 文件里。gzip9 3144 大于 hardGate 余量 44。默认总览不请求它
- `MotionPathPlayer.js`、`TourPathMount.js`、`TourPathLine.js`、`FocusMount.js`、`FocusCenter.js`、`FocusBounds.js`、`SegmentMount.js`、`BatchSegments.js` 都与合前逐字节相同，都不在 hardGate 文件里。默认总览不请求 `FocusCenter.js`、`FocusBounds.js`、`BatchSegments.js`、`MotionPathPlayer.js`、`TourPathLine.js`、`FragmentClones.js`
- 锁机 cutoff 是首帧 + 64ms。另一次冒烟把页面留到 `__twinReady` 之后 12000ms：均衡档 dock、floorDecor 在首帧后 2612ms，textRuntime 在 2613ms，Detailed 在 2628ms，DecalMount、SegmentMount、FocusMount、TourPathMount 与 CloneMount 都在 2676ms，LayerPanel 在 2713ms，TreeLod 在 2917ms。`street-tree-hi.glb` 与 `street-tree-lo.glb`、balancedFx 都在首帧之前。这次没有请求 `FocusCenter.js`、`FocusBounds.js`、`MotionPathPlayer.js`、`TourPathLine.js`、`BatchSegments.js`、`FragmentClones.js`。性能档 dock、floorDecor、textRuntime 都在 2611ms，Detailed 在 2620ms，DecalMount、SegmentMount、FocusMount、TourPathMount 与 CloneMount 都在 2626ms，LayerPanel 在 2636ms。性能档这次没有请求 balancedFx、`street-tree-hi.glb`、TreeLod、`BatchSegments.js`、`MotionPathPlayer.js`、`FocusCenter.js`、`FocusBounds.js`、`TourPathLine.js`、`FragmentClones.js`。两个总览档位的这些后到分包都在 cutoff 之外。默认 `window.__twinClone` 为 `{ on: false, mounted: false, count: 0, cap: 3, dropped: 0, deep: false, castShadow: true, receiveShadow: true, sharedMaterials: true, source: "off" }`。按钮文案是「浅拷」和「关」，`aria-pressed` 为 false。默认 `window.__twinTourPath` 为 `{ demo: true, on: false, mounted: false, points: 0, segments: 12, tension: 0.35, curve: "centripetal" }`。默认 `window.__twinMotionPath` 为 undefined（播放包没加载）。默认 `window.__twinFocusFit` 为 `{ resident: false, center: false, bounds: false, centerLoaded: false, boundsLoaded: false, mode: "off", subject: null, handedBack: true, blocked: "" }`。默认 `window.__twinSegments` 为 `{ on: false, mounted: false, shown: 0, limit: 48, dropped: 0, source: "off", floorId: null }`
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
