# D300 merge #82（T074 useVideoTexture）

| 项 | 值 |
| --- | --- |
| pre SHA | `602c2c595d54ddeaac0d39fc38a739797f764ba1` |
| merge SHA | `573fe8e3b530216ddbdb525a3c0ce53d5df4f296` |
| parents | `602c2c595d54ddeaac0d39fc38a739797f764ba1` `e8a9882e5e42f6bf89c000dc0afebf4a64c79792` |
| PR head | `e8a9882e5e42f6bf89c000dc0afebf4a64c79792` |
| hardGate | 436317（≤ 436361，余量 44）PASS |
| balancedFx | 104553（≤ 105000，余量 447）PASS |
| twinReady | true |
| pageerror | 0 |
| CloudAgent | `bc-36a46599-676a-5d06-8c7e-157feb915ed7` |

本文件按 `reviews/merge-d300-79.md` 的字段来写：合并前 SHA、merge SHA、parents、门禁数字、twinReady / pageerror、CloudAgent id。

## 合并

合并前 `origin/main` 是 `602c2c595d54ddeaac0d39fc38a739797f764ba1`。PR #82 的 `headRefOid` 是 `e8a9882e5e42f6bf89c000dc0afebf4a64c79792`。合并前 `isDraft` 为 true，`state` 为 OPEN，`mergeable` 为 MERGEABLE，`mergeStateStatus` 为 CLEAN。草稿已标为 ready。标成 ready 之后再查了一次：`headRefOid` 仍是 `e8a9882e5e42f6bf89c000dc0afebf4a64c79792`，`baseRefOid` 仍是 `602c2c595d54ddeaac0d39fc38a739797f764ba1`。没有改写这条 tip。

`gh pr merge` 没有 `--no-ff` 开关。用的是 merge commit 策略（不是 squash，不是 rebase），并锁了 `--match-head-commit e8a9882e5e42f6bf89c000dc0afebf4a64c79792`：

```
gh pr ready 82 --repo lenaelelle672-beep/uniview-twin
gh pr merge 82 --repo lenaelelle672-beep/uniview-twin --merge --match-head-commit e8a9882e5e42f6bf89c000dc0afebf4a64c79792
```

没有 force-push。GitHub [PR #82](https://github.com/lenaelelle672-beep/uniview-twin/pull/82) 状态是 **MERGED**，`mergeCommit` 是 `573fe8e3b530216ddbdb525a3c0ce53d5df4f296`（`mergedAt` 2026-10-27T06:02:33Z）。两个父提交是 `602c2c595d54ddeaac0d39fc38a739797f764ba1` 与 `e8a9882e5e42f6bf89c000dc0afebf4a64c79792`。merge 树与 PR head 树相同（`586202e8b5eaf43c80da8de1afe62eefd32ef8d3`）。

`origin/integration` 停在 `be8303022a4733060f77ebb1cc83897d20b94aa8`（PR #61 的证据提交），是 `main` 的祖先。到这次证据提交，`git rev-list --count origin/integration..main` 是 51。#62 之后的 merge-d300 证据只推 `main`，没有把 integration 快进到 main。这次同样只推 `main`。

门禁跑在 merge 提交上。本说明是紧随其后的一次提交，只加这个证据文件，不含产品代码，parent 是该 merge commit。

## 门禁

在 `573fe8e3b530216ddbdb525a3c0ce53d5df4f296` 上 `npm ci`，然后 `SHADER_PREWARM=false npm run build`。`vite preview --port 5190`，再跑 `scripts/measure-first-screen.mjs`，均衡档 1366×768，Python `gzip.compress(9)`。脚本 `ok: true`，`failures` 为空。性能档总览没有请求 balancedFx。相对合前基线 436317 / 104553。

- **hardGate 436317** ≤ 436361，余量 44，**PASS**（相对合前基线 436317 / 104553 为 +0 / +0）
- **balancedFx 104553** ≤ 105000，余量 447，**PASS**
- 性能档总览没有请求 balancedFx（gzip 0），也没有 `street-tree-hi.glb`，也没有 `TreeLod-*.js`，也没有 `BatchSegments.js`，也没有 `MotionPathPlayer.js`，也没有 `FocusCenter.js`，也没有 `FocusBounds.js`，也没有 `TourPathLine.js`，也没有 `FragmentClones.js`，也没有 `DeskScreenVideo.js`，也没有 `desk-cam.mp4`。性能档首屏 hardGate 口径 422740（合前 422740，同为 +0）。少掉的正是均衡档才拉的 `street-tree-hi.glb`（gzip9 13577）：436317 − 13577 = 422740
- 入口 `index-DbRjsYXi.js` raw 1413239，gzip9 400116，sha256 `6df4633125ebec2cdfb029e9bfad30d3c7dc837071884e7337821932039b6979`。与合前逐字节相同（文件名仍是 `index-DbRjsYXi.js`）。入口里 `useVideoTexture`、`DeskScreenVideo`、`ScreenVideoMount`、`mountScreenVideo`、`__twinScreenVideo`、`desk-cam`、`drei-useVideoTexture`、`screen-video`、`hls.js` 都是 0 处。入口里 `isVideoTexture` 是 9 处、`loadedmetadata` 是 1 处、`playsInline` 是 1 处，文件与合前相同，这是合前就在入口里的 three `VideoTexture`，不是这次工位屏。入口里 `CloneMount`、`FragmentClones`、`mountFragmentClones`、`fragment-clone`、`__twinClone`、`fragmentClone` 都是 0 处。子串 `Clone` 有 5 处，文件与合前相同，是合前就在入口里的 `removeRootViewTransitionClone`、`measureClonedInstance` 和 `ClonedMaterial`，不是 drei Clone。`CatmullRomLine`、`TourPath`、`tour-path`、`mountTourPath`、`TourPathLine`、`TourPathMount` 都是 0 处。`FocusMount`、`FocusCenter`、`FocusBounds`、`mountFocusFit`、`CenterFit`、`BoundsFit`、`focus-fit`、`onCentered`、`__twinFocusFit` 都是 0 处，`MotionPathControls`、`useMotion`、`TourMotionPath`、`MotionPathPlayer`、`BatchSegments`、`SegmentMount`、`segments/mount`、`mountBatchSegments`、`TreeLod`、`Detailed-`、`useDetailedLevel`、`WallDecals`、`DecalMount` 也都是 0 处。`street-tree-hi` 仍是 1 处，精细树仍在首屏 hardGate 里。入口里 `CatmullRomCurve3` 是 5 处、`CatmullRom` 是 13 处，文件与合前相同，这是合前就在入口里的 three 曲线
- `balancedFx-CNf9M9t.js` raw 246234，gzip9 104553，sha256 `9f81d8a80b6a5c664021a23cf746ed5d21c78ce67a5962cb4dce207b210cd78e`。与合前逐字节相同（文件名仍是 `balancedFx-CNf9M9t.js`）。`balancedFx` 里 `useVideoTexture`、`DeskScreenVideo`、`ScreenVideoMount`、`mountScreenVideo`、`__twinScreenVideo`、`desk-cam`、`drei-useVideoTexture`、`hls.js`、`isVideoTexture` 都是 0 处。`Clone`、`CloneMount`、`FragmentClones`、`mountFragmentClones`、`__twinClone`、`materialsOnly`、`CatmullRomLine`、`TourPath`、`tour-path`、`mountTourPath`、`FocusMount`、`FocusCenter`、`FocusBounds`、`CenterFit`、`BoundsFit`、`MotionPathControls`、`useMotion`、`TourMotionPath`、`BatchSegments`、`SegmentMount`、`TreeLod` 都是 0 处
- `index.html` raw 483，gzip9 340，sha256 `f4f59f6133c5e1fb9eca1f9a6369a659ca2ece252e8b4cfccf93605b300769af`。与合前逐字节相同。测量窗口里 `/?q=balanced` 的 gzip9 也是 340
- `shellClipCompile-CTGtCTI.js`、`EastGrille-ux5rLai.js`、`shadowBake-BIDE4SL.js`、`index-DgSBdyaU.css` 都与合前逐字节相同。同参重建合前 `602c2c5` 的 dist：163 个既有产物里 161 个逐字节相同。字节有差的只有 `dock-BmXUbjb.js` 和 `GridMount.js`，另加两份新懒包 `ScreenVideoMount.js`、`DeskScreenVideo.js`，以及 `media/desk-cam.mp4`。`LayerPanel-DfEgjJK.js` 与合前逐字节相同，不进 hardGate。图层类型多了 `screenVideo`，只写在类型上，面板产物没有「工位屏」
- `dock-BmXUbjb.js` 文件名不变（哈希定稿后才把接线接回去）。合前 raw 15519、gzip9 6037、sha256 `2683d42a8618bb4c4af1e001c147284a7f67a2e8eaf7d3a7ab2ba8d89d1c0cc0`。现在 raw 15592、gzip9 6051、sha256 `22dc7e72363734536be6da30490af3959b84cc00cb2a2275c4e31ee59899a5a3`。前 15519 字节与合前逐字节相同。多出来的 73 字节就是换行加上 `void import("./ScreenVideoMount.js").then((m)=>{m.mountScreenVideo()});` 再一个换行。这 73 字节不进 dock 的文件名哈希，也不进 hardGate。dock 里 `ScreenVideoMount` 是 1 处，`mountScreenVideo` 是 1 处，`DeskScreenVideo`、`useVideoTexture`、`desk-cam` 都是 0 处。`CloneMount` 是 1 处，`mountFragmentClones` 是 1 处，`FragmentClones.js` 是 0 处，`mountTourPath` 是 1 处
- `ScreenVideoMount.js` raw 2997，gzip9 1430，sha256 `215e816647dda724625a9596faf5f620b93eaffbd784aa94a5abacef4fc863f0`。静态 import 只有 `./index-DbRjsYXi.js`。动态 import 是 `./DeskScreenVideo.js`。`mountScreenVideo` 1 处，`__twinScreenVideo` 3 处，`DeskScreenVideo` 2 处。`isVideoTexture`、`loadedmetadata`、`.m3u8` 都是 0 处。`useVideoTexture` 这处只出现在标签 `drei-useVideoTexture` 里，drei 的钩子本体不在这个包。不在 hardGate 文件里。gzip9 1430 大于 hardGate 余量 44。dock 只调用 `mountScreenVideo`。默认总览会在 cutoff 之后请求 `ScreenVideoMount.js`，不请求 `DeskScreenVideo.js`，也不请求 `desk-cam.mp4`
- `DeskScreenVideo.js` raw 35512，gzip9 11488，sha256 `b03d64776948f7ba3db9a539761b4ac2e5d9b4bb4c8bbb33fe3cd3a729d76fb8`。静态 import 只有 `./index-DbRjsYXi.js`。drei `useVideoTexture` 的实现在这个包里：`loadedmetadata` 2 处，`playsInline` 5 处，`.m3u8` 1 处，`isVideoTexture` 1 处，标签 `drei-useVideoTexture` 1 处，源是 `/media/desk-cam.mp4`。`hls.js` 被打成空桩，`Hls.isSupported()` 返回 false，没有 `bufferStalledError`，没有 `hls.js version`，没有 `ScreenVideoTexture`，没有 `WebcamVideoTexture`，没有 `WebGLRenderer`，也没有 `https://`。不在 hardGate 文件里。gzip9 11488 大于 hardGate 余量 44。默认总览不请求它
- `media/desk-cam.mp4` raw 20211，gzip9 19610，sha256 `6fa7be5ab24c9ee563e012ead76de48b973d82186f119a75f8fbd614fd817f2e`，文件头是 `ftypisom`。不在 hardGate 文件里。gzip9 19610 大于 hardGate 余量 44。默认总览不请求它
- `GridMount.js` 文件名不变。合前 raw 6027、gzip9 2547、sha256 `e31f53cb228b7c141f16f61e515675d823179484b55a5c763d90ec11684475b4`。现在 raw 6073、gzip9 2562、sha256 `35fc70419270b278055e1444b7e450014f1736cbe897e413123840ffc4794ce3`。功能上的差别是格网槽多传了 `window.__twinScreenVideoNode ?? null`。其余字节差是压缩局部名字换档。`DeskScreenVideo`、`useVideoTexture`、`ScreenVideoMount` 都是 0 处，`__twinScreenVideoNode` 是 1 处。不在 hardGate 文件里。gzip9 只多 15，整份仍在 cutoff 之外
- `CloneMount.js`、`FragmentClones.js`、`MotionPathPlayer.js`、`TourPathMount.js`、`TourPathLine.js`、`FocusMount.js`、`FocusCenter.js`、`FocusBounds.js`、`SegmentMount.js`、`BatchSegments.js` 都与合前逐字节相同，都不在 hardGate 文件里。默认总览不请求 `FocusCenter.js`、`FocusBounds.js`、`BatchSegments.js`、`MotionPathPlayer.js`、`TourPathLine.js`、`FragmentClones.js`、`DeskScreenVideo.js`
- 锁机 cutoff 是首帧 + 64ms。另一次冒烟把页面留到 `__twinReady` 之后 12000ms：均衡档 dock、floorDecor 在首帧后 2616ms，textRuntime 在 2617ms，Detailed 在 2627ms，GridMount、DecalMount、SegmentMount、FocusMount、TourPathMount、CloneMount 与 ScreenVideoMount 都在 2645ms，LayerPanel 在 2652ms，TreeLod 在 2924ms。`street-tree-hi.glb` 与 `street-tree-lo.glb`、balancedFx 都在首帧之前。这次没有请求 `FocusCenter.js`、`FocusBounds.js`、`MotionPathPlayer.js`、`TourPathLine.js`、`BatchSegments.js`、`FragmentClones.js`、`DeskScreenVideo.js`、`desk-cam.mp4`。性能档 dock、floorDecor、textRuntime 都在 2610ms，Detailed 在 2619ms，GridMount 在 2663ms，DecalMount、SegmentMount、FocusMount、TourPathMount、CloneMount 与 ScreenVideoMount 都在 2664ms，LayerPanel 在 2683ms。性能档这次没有请求 balancedFx、`street-tree-hi.glb`、TreeLod、`BatchSegments.js`、`MotionPathPlayer.js`、`FocusCenter.js`、`FocusBounds.js`、`TourPathLine.js`、`FragmentClones.js`、`DeskScreenVideo.js`、`desk-cam.mp4`。两个总览档位的这些后到分包都在 cutoff 之外。默认 `window.__twinScreenVideo` 为 `{ demo: true, on: false, mounted: false, src: "/media/desk-cam.mp4", muted: true, playsInline: true, loop: true, desks: 0, camera: false, hls: false, impl: "drei-useVideoTexture" }`。按钮文案是「工位屏」和「关」，`aria-pressed` 为 false。默认 `window.__twinClone` 为 `{ on: false, mounted: false, count: 0, cap: 3, dropped: 0, deep: false, castShadow: true, receiveShadow: true, sharedMaterials: true, source: "off" }`。默认 `window.__twinTourPath` 为 `{ demo: true, on: false, mounted: false, points: 0, segments: 12, tension: 0.35, curve: "centripetal" }`。默认 `window.__twinMotionPath` 为 undefined（播放包没加载）。默认 `window.__twinFocusFit` 为 `{ resident: false, center: false, bounds: false, centerLoaded: false, boundsLoaded: false, mode: "off", subject: null, handedBack: true, blocked: "" }`。默认 `window.__twinSegments` 为 `{ on: false, mounted: false, shown: 0, limit: 48, dropped: 0, source: "off", floorId: null }`
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
