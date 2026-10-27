# D300 merge #80（T075 useCursor / HoverCursor）

| 项 | 值 |
| --- | --- |
| pre SHA | `4cc0ad4680695d9e8b56af1b370b587a4b688041` |
| merge SHA | `7626816de545d5b740f603b5a1d438d3720f446f` |
| parents | `4cc0ad4680695d9e8b56af1b370b587a4b688041` `d9750ca7f038c431f7e7a0b6c113d04bc49f65f7` |
| PR head | `d9750ca7f038c431f7e7a0b6c113d04bc49f65f7` |
| hardGate | 436317（≤ 436361，余量 44）PASS |
| balancedFx | 104553（≤ 105000，余量 447）PASS |
| twinReady | true |
| pageerror | 0 |
| CloudAgent | `bc-9a68a728-23ec-54d3-92ae-0bdb78d5005e` |

本文件按 `reviews/merge-d300-82.md` / `reviews/merge-d300-79.md` 的字段来写：合并前 SHA、merge SHA、parents、门禁数字、twinReady / pageerror、CloudAgent id。

## 合并

合并前 `origin/main` 是 `4cc0ad4680695d9e8b56af1b370b587a4b688041`。PR #80 的 `headRefOid` 是 `d9750ca7f038c431f7e7a0b6c113d04bc49f65f7`。合并前 `isDraft` 为 true，`state` 为 OPEN，`mergeable` 为 MERGEABLE，`mergeStateStatus` 为 CLEAN。草稿已标为 ready。标成 ready 之后再查了一次：`headRefOid` 仍是 `d9750ca7f038c431f7e7a0b6c113d04bc49f65f7`，`baseRefOid` 仍是 `4cc0ad4680695d9e8b56af1b370b587a4b688041`。没有改写这条 tip。

`gh pr merge` 没有 `--no-ff` 开关。用的是 merge commit 策略（不是 squash，不是 rebase），并锁了 `--match-head-commit d9750ca7f038c431f7e7a0b6c113d04bc49f65f7`：

```
gh pr ready 80 --repo lenaelelle672-beep/uniview-twin
gh pr merge 80 --repo lenaelelle672-beep/uniview-twin --merge --match-head-commit d9750ca7f038c431f7e7a0b6c113d04bc49f65f7
```

没有 force-push。GitHub [PR #80](https://github.com/lenaelelle672-beep/uniview-twin/pull/80) 状态是 **MERGED**，`mergeCommit` 是 `7626816de545d5b740f603b5a1d438d3720f446f`（`mergedAt` 2026-10-27T06:55:27Z）。两个父提交是 `4cc0ad4680695d9e8b56af1b370b587a4b688041` 与 `d9750ca7f038c431f7e7a0b6c113d04bc49f65f7`。merge 树与 PR head 树相同（`e3af45e9853ab5bd82533eab8aa7cd15a3fd5380`）。

`origin/integration` 停在 `be8303022a4733060f77ebb1cc83897d20b94aa8`（PR #61 的证据提交），是 `main` 的祖先。到这次证据提交，`git rev-list --count origin/integration..main` 是 54。#62 之后的 merge-d300 证据只推 `main`，没有把 integration 快进到 main。这次同样只推 `main`。#81 / #83 仍是 OPEN，没有合。

门禁跑在 merge 提交上。本说明是紧随其后的一次提交，只加这个证据文件，不含产品代码，parent 是该 merge commit。

## 门禁

在 `7626816de545d5b740f603b5a1d438d3720f446f` 上 `npm ci`，然后 `SHADER_PREWARM=false npm run build`。`vite preview --port 5190`，再跑 `scripts/measure-first-screen.mjs`，均衡档 1366×768，Python `gzip.compress(9)`。脚本 `ok: true`，`failures` 为空。性能档总览没有请求 balancedFx。相对合前基线 436317 / 104553。

- **hardGate 436317** ≤ 436361，余量 44，**PASS**（相对合前基线 436317 / 104553 为 +0 / +0）
- **balancedFx 104553** ≤ 105000，余量 447，**PASS**
- 性能档总览没有请求 balancedFx（gzip 0），也没有 `street-tree-hi.glb`，也没有 `TreeLod-*.js`，也没有 `BatchSegments.js`，也没有 `MotionPathPlayer.js`，也没有 `FocusCenter.js`，也没有 `FocusBounds.js`，也没有 `TourPathLine.js`，也没有 `FragmentClones.js`，也没有 `DeskScreenVideo.js`，也没有 `desk-cam.mp4`，也没有 `HoverCursor.js`，也没有 `CursorMount.js`。性能档首屏 hardGate 口径 422740（合前 422740，同为 +0）。少掉的正是均衡档才拉的 `street-tree-hi.glb`（gzip9 13577）：436317 − 13577 = 422740
- 入口 `index-DbRjsYXi.js` raw 1413239，gzip9 400116，sha256 `6df4633125ebec2cdfb029e9bfad30d3c7dc837071884e7337821932039b6979`。与合前逐字节相同（文件名仍是 `index-DbRjsYXi.js`）。入口里 `useCursor`、`HoverCursor`、`CursorMount`、`HoverCursor.js`、`mountHoverCursor`、`cursor/mount`、`__twinHoverCursor` 都是 0 处。子串 `Cursor` 有 17 处，文件与合前相同，全是合前就在入口里的 `dollyToCursor`，不是这次悬停指针。入口里 `useVideoTexture`、`DeskScreenVideo`、`ScreenVideoMount`、`mountScreenVideo`、`__twinScreenVideo`、`desk-cam`、`drei-useVideoTexture`、`screen-video`、`hls.js` 都是 0 处。入口里 `isVideoTexture` 是 9 处、`loadedmetadata` 是 1 处、`playsInline` 是 1 处，文件与合前相同，这是合前就在入口里的 three `VideoTexture`，不是工位屏。入口里 `CloneMount`、`FragmentClones`、`mountFragmentClones`、`fragment-clone`、`__twinClone`、`fragmentClone` 都是 0 处。子串 `Clone` 有 5 处，文件与合前相同，是合前就在入口里的 `removeRootViewTransitionClone`、`measureClonedInstance` 和 `ClonedMaterial`，不是 drei Clone。`CatmullRomLine`、`TourPath`、`tour-path`、`mountTourPath`、`TourPathLine`、`TourPathMount` 都是 0 处。`FocusMount`、`FocusCenter`、`FocusBounds`、`mountFocusFit`、`CenterFit`、`BoundsFit`、`focus-fit`、`onCentered`、`__twinFocusFit` 都是 0 处，`MotionPathControls`、`useMotion`、`TourMotionPath`、`MotionPathPlayer`、`BatchSegments`、`SegmentMount`、`segments/mount`、`mountBatchSegments`、`TreeLod`、`Detailed-`、`useDetailedLevel`、`WallDecals`、`DecalMount` 也都是 0 处。`street-tree-hi` 仍是 1 处，精细树仍在首屏 hardGate 里。入口里 `CatmullRomCurve3` 是 5 处、`CatmullRom` 是 13 处，文件与合前相同，这是合前就在入口里的 three 曲线
- `balancedFx-CNf9M9t.js` raw 246234，gzip9 104553，sha256 `9f81d8a80b6a5c664021a23cf746ed5d21c78ce67a5962cb4dce207b210cd78e`。与合前逐字节相同（文件名仍是 `balancedFx-CNf9M9t.js`）。`balancedFx` 里 `useCursor`、`HoverCursor`、`CursorMount`、`HoverCursor.js`、`mountHoverCursor`、`__twinHoverCursor` 都是 0 处。`useVideoTexture`、`DeskScreenVideo`、`ScreenVideoMount`、`mountScreenVideo`、`__twinScreenVideo`、`desk-cam`、`drei-useVideoTexture`、`hls.js`、`isVideoTexture` 都是 0 处。`Clone`、`CloneMount`、`FragmentClones`、`mountFragmentClones`、`__twinClone`、`materialsOnly`、`CatmullRomLine`、`TourPath`、`tour-path`、`mountTourPath`、`FocusMount`、`FocusCenter`、`FocusBounds`、`CenterFit`、`BoundsFit`、`MotionPathControls`、`useMotion`、`TourMotionPath`、`BatchSegments`、`SegmentMount`、`TreeLod` 都是 0 处
- `index.html` raw 483，gzip9 340，sha256 `f4f59f6133c5e1fb9eca1f9a6369a659ca2ece252e8b4cfccf93605b300769af`。与合前逐字节相同。测量窗口里 `/?q=balanced` 的 gzip9 也是 340
- `shellClipCompile-CTGtCTI.js`、`EastGrille-ux5rLai.js`、`shadowBake-BIDE4SL.js`、`index-DgSBdyaU.css` 都与合前逐字节相同。同参重建合前 `4cc0ad4` 的 dist：166 个既有产物里 165 个逐字节相同。字节有差的只有 `dock-BmXUbjb.js`，另加一份新懒包 `HoverCursor.js`。`LayerPanel-DfEgjJK.js` 与合前逐字节相同，不进 hardGate。`GridMount.js` 与合前逐字节相同
- `dock-BmXUbjb.js` 文件名不变（哈希定稿后才把接线接回去）。合前 raw 15592、gzip9 6051、sha256 `22dc7e72363734536be6da30490af3959b84cc00cb2a2275c4e31ee59899a5a3`。现在 raw 15660、gzip9 6065、sha256 `60a6e123625040fa1cb15ff2517cec968f22880436d6e8beb42fd8ae46f14463`。前 15592 字节与合前逐字节相同。多出来的 68 字节就是换行加上 `void import("./HoverCursor.js").then((m)=>{m.mountHoverCursor()});` 再一个换行。这 68 字节不进 dock 的文件名哈希，也不进 hardGate。dock 里 `HoverCursor.js` 是 1 处，`mountHoverCursor` 是 1 处，`useCursor`、`CursorMount`、`DeskScreenVideo`、`useVideoTexture`、`desk-cam` 都是 0 处。`ScreenVideoMount` 是 1 处，`mountScreenVideo` 是 1 处，`CloneMount` 是 1 处，`mountFragmentClones` 是 1 处，`FragmentClones.js` 是 0 处，`mountTourPath` 是 1 处
- `HoverCursor.js` raw 3879，gzip9 1731，sha256 `8798706a6fd7e16fff05e90a89d38013e3d6201bd8619cb459ba77685c815de5`。静态 import 只有 `./index-DbRjsYXi.js`（react 垫片和 `useThree` 各一条，都从入口包进）。没有动态 import，没有 `from"three"`，没有 `WebGLRenderer`，没有 `https://`。`mountHoverCursor` 1 处，`__twinHoverCursor` 3 处。标识 `useCursor` 是 0 处：esbuild 把 drei `useCursor` 压进了这个包，函数体是 `function B(r,e="pointer",t="auto",o=document.body)`，里面写 `o.style.cursor`。调用是 `B(hovered, "pointer", "", canvas)`，第四个参数是画布 `gl.domElement`。`document.body` 只出现在这个默认参数上，这次调用没有把光标写到 `document.body`。`style.cursor` 是 4 处，`pointer` 是 6 处，`FloorShell-` 是 1 处。子串 `CursorMount` 是 1 处，落在导出名字 `resetHoverCursorMountForTests` 里，不是独立的 `CursorMount` 符号。dist 里没有 `CursorMount.js`。不在 hardGate 文件里。gzip9 1731 大于 hardGate 余量 44。dock 只调用 `mountHoverCursor`。默认总览会在 cutoff 之后请求 `HoverCursor.js`
- `ScreenVideoMount.js`、`DeskScreenVideo.js`、`media/desk-cam.mp4`、`CloneMount.js`、`FragmentClones.js`、`MotionPathPlayer.js`、`TourPathMount.js`、`TourPathLine.js`、`FocusMount.js`、`FocusCenter.js`、`FocusBounds.js`、`SegmentMount.js`、`BatchSegments.js` 都与合前逐字节相同，都不在 hardGate 文件里。默认总览不请求 `FocusCenter.js`、`FocusBounds.js`、`BatchSegments.js`、`MotionPathPlayer.js`、`TourPathLine.js`、`FragmentClones.js`、`DeskScreenVideo.js`、`desk-cam.mp4`、`CursorMount.js`
- 锁机 cutoff 是首帧 + 64ms。另一次冒烟把页面留到 `__twinReady` 之后 12000ms：均衡档 dock、floorDecor、textRuntime 都在首帧后 2729ms，Detailed 在 2754ms，GridMount 在 2774ms，DecalMount、SegmentMount、FocusMount 都在 2777ms，TourPathMount、CloneMount、ScreenVideoMount 与 HoverCursor 都在 2778ms，LayerPanel 在 2797ms，TreeLod 在 3027ms。`street-tree-hi.glb` 与 `street-tree-lo.glb`、balancedFx 都在首帧之前。这次没有请求 `FocusCenter.js`、`FocusBounds.js`、`MotionPathPlayer.js`、`TourPathLine.js`、`BatchSegments.js`、`FragmentClones.js`、`DeskScreenVideo.js`、`desk-cam.mp4`、`CursorMount.js`。性能档 dock、floorDecor、textRuntime 都在 2610ms，Detailed 在 2624ms，GridMount、DecalMount 都在 2639ms，SegmentMount、FocusMount、TourPathMount 都在 2640ms，CloneMount、HoverCursor 与 ScreenVideoMount 都在 2641ms，LayerPanel 在 2658ms。性能档这次没有请求 balancedFx、`street-tree-hi.glb`、TreeLod、`BatchSegments.js`、`MotionPathPlayer.js`、`FocusCenter.js`、`FocusBounds.js`、`TourPathLine.js`、`FragmentClones.js`、`DeskScreenVideo.js`、`desk-cam.mp4`、`CursorMount.js`。两个总览档位的这些后到分包都在 cutoff 之外。`useCursor` 没有单独的请求 URL。默认 `window.__twinHoverCursor` 为 `{ enabled: true, hovered: false, target: null, yielded: "", container: "canvas" }`。这次没有新的开关按钮。默认 `window.__twinScreenVideo` 为 `{ demo: true, on: false, mounted: false, src: "/media/desk-cam.mp4", muted: true, playsInline: true, loop: true, desks: 0, camera: false, hls: false, impl: "drei-useVideoTexture" }`。默认 `window.__twinClone` 为 `{ on: false, mounted: false, count: 0, cap: 3, dropped: 0, deep: false, castShadow: true, receiveShadow: true, sharedMaterials: true, source: "off" }`。默认 `window.__twinTourPath` 为 `{ demo: true, on: false, mounted: false, points: 0, segments: 12, tension: 0.35, curve: "centripetal" }`。默认 `window.__twinMotionPath` 为 undefined（播放包没加载）。默认 `window.__twinFocusFit` 为 `{ resident: false, center: false, bounds: false, centerLoaded: false, boundsLoaded: false, mode: "off", subject: null, handedBack: true, blocked: "" }`。默认 `window.__twinSegments` 为 `{ on: false, mounted: false, shown: 0, limit: 48, dropped: 0, source: "off", floorId: null }`
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
