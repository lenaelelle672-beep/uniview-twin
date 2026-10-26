# D300 merge #78（T069 CatmullRomLine）

| 项 | 值 |
| --- | --- |
| pre SHA | `c88990683e2c29adcf1ea3406175d3864e04610c` |
| merge SHA | `137db8a42b5299db1d636d179d3c9c1342ba7acd` |
| parents | `c88990683e2c29adcf1ea3406175d3864e04610c` `4eb28834b4afdb9a3814bcacd6d5641aa83bbd06` |
| PR head | `4eb28834b4afdb9a3814bcacd6d5641aa83bbd06` |
| hardGate | 436317（≤ 436361，余量 44）PASS |
| balancedFx | 104553（≤ 105000，余量 447）PASS |
| twinReady | true |
| pageerror | 0 |
| CloudAgent | `bc-10ab715b-aab9-5513-aab0-0cd2030ccf13` |

本文件按 `reviews/merge-d300-75.md` / `reviews/merge-d300-76.md` / `reviews/merge-d300-77.md` 的字段来写：合并前 SHA、merge SHA、parents、门禁数字、twinReady / pageerror、CloudAgent id。

## 合并

合并前 `origin/main` 是 `c88990683e2c29adcf1ea3406175d3864e04610c`。PR #78 的 `headRefOid` 是 `4eb28834b4afdb9a3814bcacd6d5641aa83bbd06`。合并前 `isDraft` 为 true，`state` 为 OPEN，`mergeable` 为 MERGEABLE，`mergeStateStatus` 为 CLEAN。草稿已标为 ready。标成 ready 之后再查了一次：`headRefOid` 仍是 `4eb28834b4afdb9a3814bcacd6d5641aa83bbd06`，`baseRefOid` 仍是 `c88990683e2c29adcf1ea3406175d3864e04610c`。没有改写这条 tip。

`gh pr merge` 没有 `--no-ff` 开关。用的是 merge commit 策略（不是 squash，不是 rebase），并锁了 `--match-head-commit 4eb28834b4afdb9a3814bcacd6d5641aa83bbd06`：

```
gh pr ready 78 --repo lenaelelle672-beep/uniview-twin
gh pr merge 78 --repo lenaelelle672-beep/uniview-twin --merge --match-head-commit 4eb28834b4afdb9a3814bcacd6d5641aa83bbd06
```

没有 force-push。GitHub [PR #78](https://github.com/lenaelelle672-beep/uniview-twin/pull/78) 状态是 **MERGED**，`mergeCommit` 是 `137db8a42b5299db1d636d179d3c9c1342ba7acd`（`mergedAt` 2026-10-26T14:32:46Z）。两个父提交是 `c88990683e2c29adcf1ea3406175d3864e04610c` 与 `4eb28834b4afdb9a3814bcacd6d5641aa83bbd06`。merge 树与 PR head 树相同（`5a6f146f0d3a8a4d1ae91d564b74a6ba4f91ec00`）。

`origin/integration` 停在 `be8303022a4733060f77ebb1cc83897d20b94aa8`（PR #61 的证据提交），是 `main` 的祖先。到这次证据提交，`git rev-list --count origin/integration..main` 是 45。#62 之后的 merge-d300 证据只推 `main`，没有把 integration 快进到 main。这次同样只推 `main`。

门禁跑在 merge 提交上。本说明是紧随其后的一次提交，只加这个证据文件，不含产品代码，parent 是该 merge commit。

## 门禁

在 `137db8a42b5299db1d636d179d3c9c1342ba7acd` 上 `npm ci`，然后 `SHADER_PREWARM=false npm run build`。`vite preview --port 5190`，再跑 `scripts/measure-first-screen.mjs`，均衡档 1366×768，Python `gzip.compress(9)`。脚本 `ok: true`，`failures` 为空。性能档总览没有请求 balancedFx。相对合前基线 436317 / 104553。

- **hardGate 436317** ≤ 436361，余量 44，**PASS**（相对合前基线 436317 / 104553 为 +0 / +0）
- **balancedFx 104553** ≤ 105000，余量 447，**PASS**
- 性能档总览没有请求 balancedFx（gzip 0），也没有 `street-tree-hi.glb`，也没有 `TreeLod-*.js`，也没有 `BatchSegments.js`，也没有 `MotionPathPlayer.js`，也没有 `FocusCenter.js`，也没有 `FocusBounds.js`，也没有 `TourPathLine.js`。性能档首屏 hardGate 口径 422740（合前 422740，同为 +0）。少掉的正是均衡档才拉的 `street-tree-hi.glb`（gzip9 13577）：436317 − 13577 = 422740
- 入口 `index-DbRjsYXi.js` raw 1413239，gzip9 400116，sha256 `6df4633125ebec2cdfb029e9bfad30d3c7dc837071884e7337821932039b6979`。与合前逐字节相同（文件名仍是 `index-DbRjsYXi.js`）。入口里 `CatmullRomLine`、`TourPath`、`tour-path`、`mountTourPath`、`TourPathLine`、`TourPathMount` 都是 0 处。`FocusMount`、`FocusCenter`、`FocusBounds`、`mountFocusFit`、`CenterFit`、`BoundsFit`、`focus-fit`、`onCentered`、`__twinFocusFit` 都是 0 处，`MotionPathControls`、`useMotion`、`TourMotionPath`、`MotionPathPlayer`、`BatchSegments`、`SegmentMount`、`segments/mount`、`mountBatchSegments`、`TreeLod`、`Detailed-`、`useDetailedLevel`、`WallDecals`、`DecalMount` 也都是 0 处。`street-tree-hi` 仍是 1 处，精细树仍在首屏 hardGate 里。入口里 `CatmullRomCurve3` 是 5 处、`CatmullRom` 是 13 处，文件与合前相同，这是合前就在入口里的 three 曲线
- `balancedFx-CNf9M9t.js` raw 246234，gzip9 104553，sha256 `9f81d8a80b6a5c664021a23cf746ed5d21c78ce67a5962cb4dce207b210cd78e`。与合前逐字节相同（文件名仍是 `balancedFx-CNf9M9t.js`）。`balancedFx` 里 `CatmullRomLine`、`TourPath`、`tour-path`、`mountTourPath`、`FocusMount`、`FocusCenter`、`FocusBounds`、`CenterFit`、`BoundsFit`、`MotionPathControls`、`useMotion`、`TourMotionPath`、`BatchSegments`、`SegmentMount`、`TreeLod` 都是 0 处
- `index.html` raw 483，gzip9 340，sha256 `f4f59f6133c5e1fb9eca1f9a6369a659ca2ece252e8b4cfccf93605b300769af`。与合前逐字节相同。测量窗口里 `/?q=balanced` 的 gzip9 也是 340
- `shellClipCompile-CTGtCTI.js`、`EastGrille-ux5rLai.js`、`shadowBake-BIDE4SL.js`、`index-DgSBdyaU.css` 都与合前逐字节相同。同参重建合前 `c889906` 的 dist：157 个既有产物逐字节相同。字节有差的只有 `dock-BmXUbjb.js` 和 `MotionPathPlayer.js`，另加两份新懒包 `TourPathMount.js`、`TourPathLine.js`。图层类型多了 `tourPath`，`LayerPanel-DfEgjJK.js` 与合前逐字节相同，不进 hardGate
- `dock-BmXUbjb.js` 文件名不变（哈希定稿后才把接线接回去）。合前 raw 15382、gzip9 6015、sha256 `9fdd15eb8c7d60b6a21b54a705b8795fe3b2068b17390d70f9802805e8174cd6`。现在 raw 15449、gzip9 6025、sha256 `385e5e68292eacbe107282592e0f51ec9219633c0939dec2640e5bd9ee707fcc`。前 15382 字节与合前逐字节相同。多出来的 67 字节就是换行加上 `void import("./TourPathMount.js").then((m)=>{m.mountTourPath()});` 再一个换行。这 67 字节不进 dock 的文件名哈希，也不进 hardGate。dock 里 `CatmullRomLine`、`TourPathLine`、`FocusCenter`、`FocusBounds` 都是 0 处，`mountTourPath` 是 1 处
- `TourPathMount.js` raw 4473，gzip9 1937，sha256 `601ecfa59a0a32fae6fe531cdcea6de5d3479fbfb40b2d40a42ce643c0dccd62`。静态 import 只有 `./index-DbRjsYXi.js`。动态 import 是 `./TourPathLine.js`。`mountTourPath` 1 处，`__twinTourPath` 2 处，`CatmullRomLine` 0 处。不在 hardGate 文件里。同一份 mount 源里还留着沿轨点击处理的 `import("./session.js")`。dock 的沿轨引导仍是合前那份，点到导览才 `import("./MotionPathPlayer.js")`，dock 只调用 `mountTourPath`。默认总览不请求 `session.js`，也不请求 `MotionPathPlayer.js`，也不请求 `TourPathLine.js`
- `TourPathLine.js` raw 29606，gzip9 9721，sha256 `4dcd349adab99c75a00e03f85ba76d7d0db7b0aa782f23cc2c8ef732e8234d67`。静态 import 只有 `./index-DbRjsYXi.js`。压缩后标识符 `CatmullRomLine` 是 0，曲线实现在这个包里：`CatmullRomCurve3` 2 处，`tour-path` 1 处，`TourPathLine` 1 处，`__twinTourPath` 3 处。不在 hardGate 文件里。gzip9 9721 大于 hardGate 余量 44。默认总览不请求它
- `MotionPathPlayer.js` raw 仍是 145823，gzip9 仍是 42325。sha256 从合前 `f87ff4fd0e7f28af4dba68ffb232be3fb8bba11f972b8b4260bd80b525719735` 变成 `24969c51c82658ba76e4412a25a8f50050f42f499f71516289f199dbf4eef583`。两边差 66 个字节，都是压缩局部名字对调（`Q` 与 `$`，以及 `startMotionPathTour` 的内部名 `np` 变成 `op`）。导出名仍是 `startMotionPathTour`。没有 `tourPath`、`demoEdit`、`TourPath`、`CatmullRomLine`。不在 hardGate 文件里。`points.ts` 仍从改过的 `gate.ts` 引 `motionPathLoopOn`，esbuild 压名字时换了一档，gzip9 没变
- `FocusMount.js`、`FocusCenter.js`、`FocusBounds.js`、`SegmentMount.js`、`BatchSegments.js` 都与合前逐字节相同，都不在 hardGate 文件里。默认总览不请求 `FocusCenter.js`、`FocusBounds.js`、`BatchSegments.js`
- 锁机 cutoff 是首帧 + 64ms。另一次冒烟把页面留到 `__twinReady` 之后 12000ms：均衡档 dock、floorDecor 在首帧后 2607ms，textRuntime 在 2608ms，Detailed 在 2618ms，DecalMount、SegmentMount、FocusMount 与 TourPathMount 都在 2630ms，LayerPanel 在 2638ms，TreeLod 在 2911ms。`street-tree-hi.glb` 与 `street-tree-lo.glb`、balancedFx 都在首帧之前。这次没有请求 `FocusCenter.js`、`FocusBounds.js`、`MotionPathPlayer.js`、`TourPathLine.js`、`BatchSegments.js`。性能档 dock、floorDecor 都在 2609ms，textRuntime 在 2610ms，Detailed 在 2619ms，DecalMount、SegmentMount、FocusMount 与 TourPathMount 都在 2645ms，LayerPanel 在 2651ms。性能档这次没有请求 balancedFx、`street-tree-hi.glb`、TreeLod、`BatchSegments.js`、`MotionPathPlayer.js`、`FocusCenter.js`、`FocusBounds.js`、`TourPathLine.js`。两个总览档位的这些后到分包都在 cutoff 之外。默认 `window.__twinTourPath` 为 `{ demo: true, on: false, mounted: false, points: 0, segments: 12, tension: 0.35, curve: "centripetal" }`。按钮文案是「导览轨」和「关」，`aria-pressed` 为 false。默认 `window.__twinMotionPath` 为 undefined（播放包没加载）。默认 `window.__twinFocusFit` 为 `{ resident: false, center: false, bounds: false, centerLoaded: false, boundsLoaded: false, mode: "off", subject: null, handedBack: true, blocked: "" }`。默认 `window.__twinSegments` 为 `{ on: false, mounted: false, shown: 0, limit: 48, dropped: 0, source: "off", floorId: null }`
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
