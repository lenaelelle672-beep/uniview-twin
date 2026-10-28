# D300 merge #86（T079 Image screen posters）

| 项 | 值 |
| --- | --- |
| pre SHA | `86cdd326647202a3ce72b3fbd0b7c4619710d18e` |
| merge SHA | `91dc81cb3a2405898622b2b9088db20470cb8416` |
| parents | `86cdd326647202a3ce72b3fbd0b7c4619710d18e` `941f281636bf7e80c6e046cd171c6660783c3feb` |
| PR head | `941f281636bf7e80c6e046cd171c6660783c3feb` |
| hardGate | 436319（≤ 436361，余量 42）PASS |
| balancedFx | 104552（≤ 105000，余量 448）PASS |
| twinReady | true |
| pageerror | 0 |
| CloudAgent | `bc-8a9c86a4-b4a7-510d-ad7e-45108c432f47` |

本文件按 `reviews/merge-d300-81.md` / `reviews/merge-d300-83.md` 的字段来写：合并前 SHA、merge SHA、parents、门禁数字、twinReady / pageerror、CloudAgent id。

## 合并

合并前 `origin/main` 是 `86cdd326647202a3ce72b3fbd0b7c4619710d18e`。PR #86 的 `headRefOid` 是 `941f281636bf7e80c6e046cd171c6660783c3feb`。合并前 `isDraft` 为 true，`state` 为 OPEN，`mergeable` 为 MERGEABLE，`mergeStateStatus` 为 CLEAN。草稿已标为 ready。标成 ready 之后再查了一次：`headRefOid` 仍是 `941f281636bf7e80c6e046cd171c6660783c3feb`，`baseRefOid` 仍是 `86cdd326647202a3ce72b3fbd0b7c4619710d18e`。没有改写这条 tip。

`gh pr merge` 没有 `--no-ff` 开关。用的是 merge commit 策略（不是 squash，不是 rebase），并锁了 `--match-head-commit 941f281636bf7e80c6e046cd171c6660783c3feb`：

```
gh pr ready 86 --repo lenaelelle672-beep/uniview-twin
gh pr merge 86 --repo lenaelelle672-beep/uniview-twin --merge --match-head-commit 941f281636bf7e80c6e046cd171c6660783c3feb
```

没有 force-push。GitHub [PR #86](https://github.com/lenaelelle672-beep/uniview-twin/pull/86) 状态是 **MERGED**，`mergeCommit` 是 `91dc81cb3a2405898622b2b9088db20470cb8416`（`mergedAt` 2026-10-28T07:52:35Z）。两个父提交是 `86cdd326647202a3ce72b3fbd0b7c4619710d18e` 与 `941f281636bf7e80c6e046cd171c6660783c3feb`。merge 树与 PR head 树相同（`c34804ac629ae1991f96c48b1c2a2da7deb61d15`）。

`origin/integration` 停在 `be8303022a4733060f77ebb1cc83897d20b94aa8`（PR #61 的证据提交），是 `main` 的祖先。到这次证据提交，`git rev-list --count origin/integration..main` 是 63。#62 之后的 merge-d300 证据只推 `main`，没有把 integration 快进到 main。这次同样只推 `main`。

门禁跑在 merge 提交上。本说明是紧随其后的一次提交，只加这个证据文件，不含产品代码，parent 是该 merge commit。

## 门禁

在 `91dc81cb3a2405898622b2b9088db20470cb8416` 上 `npm ci`，然后 `SHADER_PREWARM=false npm run build`。`vite preview --port 5190`，再跑 `scripts/measure-first-screen.mjs`，均衡档 1366×768，Python `gzip.compress(9)`。脚本 `ok: true`，`failures` 为空。性能档总览没有请求 balancedFx。相对合前基线 436319 / 104552。`package.json` 与 `package-lock.json` 相对合前 0 diff。

- **hardGate 436319** ≤ 436361，余量 42，**PASS**（相对合前基线 436319 / 104552 为 +0 / +0）
- **balancedFx 104552** ≤ 105000，余量 448，**PASS**
- 性能档总览没有请求 balancedFx（gzip 0），也没有 `street-tree-hi.glb`，也没有 `TreeLod-*.js`，也没有 `BatchSegments.js`，也没有 `MotionPathPlayer.js`，也没有 `FocusCenter.js`，也没有 `FocusBounds.js`，也没有 `TourPathLine.js`，也没有 `FragmentClones.js`，也没有 `DeskScreenVideo.js`，也没有 `desk-cam.mp4`，也没有 `CursorMount.js`。性能档会在 cutoff 之后请求 `BlinkFrustum.js`（性能档默认开），也会在 cutoff 之后请求 `MeshBounds.js`，也会在 cutoff 之后请求 `ScreenImageMount.js`、`DeskScreenPosters.js`、`desk.webp`、`camera.jpg`（屏海报默认开，不看画质档）。性能档首屏 hardGate 口径 422742（合前 422742，+0）。少掉的正是均衡档才拉的 `street-tree-hi.glb`（gzip9 13577）：436319 − 13577 = 422742
- 入口 `index-DR969EVf.js` raw 1413239，gzip9 400115，sha256 `b56ded3cb3ae7a2fae78d7699ef86452fa3d0b1b4bd39269db1828fb55ed9321`。与合前逐字节相同（文件名仍是 `index-DR969EVf.js`）。入口里 `screenImage`、`ScreenImage`、`mountScreenImage`、`DeskScreenPoster`、`__twinScreenImage`、`ScreenImageMount`、`textures/screens`、`desk.webp`、`camera.jpg` 都是 0 处。`meshBounds`、`MeshBounds`、`mountCoarseMeshBounds`、`__twinMeshBounds` 都是 0 处。`useIntersect`、`BlinkFrustum`、`FrustumMount`、`mountFrustumPause`、`__twinFrustumBlink`、`frustum/mount`、`twin-frustum` 都是 0 处。`frustum` 仍是 33 处，与合前相同，是 three 的 `frustumCulled` / `_frustums`。`onBeforeRender` 仍是 8 处，与合前相同。入口里 `useCursor`、`HoverCursor`、`CursorMount`、`mountHoverCursor`、`__twinHoverCursor` 都是 0 处。子串 `Cursor` 有 17 处，与合前相同，全是 `dollyToCursor`。入口里 `useVideoTexture`、`DeskScreenVideo`、`ScreenVideoMount`、`mountScreenVideo`、`__twinScreenVideo`、`desk-cam`、`drei-useVideoTexture`、`hls.js` 都是 0 处。入口里 `isVideoTexture` 是 9 处、`loadedmetadata` 是 1 处、`playsInline` 是 1 处，与合前相同，这是合前就在入口里的 three `VideoTexture`。入口里 `CloneMount`、`FragmentClones`、`mountFragmentClones`、`fragment-clone`、`__twinClone`、`fragmentClone` 都是 0 处。子串 `Clone` 有 5 处，与合前相同，是 `removeRootViewTransitionClone`、`measureClonedInstance` 和 `ClonedMaterial`。`CatmullRomLine`、`TourPath`、`tour-path`、`mountTourPath`、`TourPathLine`、`TourPathMount` 都是 0 处。`FocusMount`、`FocusCenter`、`FocusBounds`、`mountFocusFit`、`__twinFocusFit` 都是 0 处，`MotionPathPlayer`、`BatchSegments`、`SegmentMount`、`TreeLod`、`DecalMount` 也都是 0 处。`street-tree-hi` 仍是 1 处。入口里 `CatmullRomCurve3` 是 5 处、`CatmullRom` 是 13 处，与合前相同
- `balancedFx-BB0zAHf.js` raw 246234，gzip9 104552，sha256 `659559f1ef3808fa5b50c2dc69a8d41b993a61f680280777bdcab4f8ecba5710`。与合前逐字节相同（文件名仍是 `balancedFx-BB0zAHf.js`）。`balancedFx` 里 `screenImage`、`ScreenImage`、`mountScreenImage`、`DeskScreenPoster`、`__twinScreenImage`、`textures/screens`、`desk.webp`、`camera.jpg` 都是 0 处。`meshBounds`、`MeshBounds`、`mountCoarseMeshBounds`、`__twinMeshBounds` 都是 0 处。`useIntersect`、`BlinkFrustum`、`FrustumMount`、`mountFrustumPause`、`__twinFrustumBlink` 都是 0 处。`frustum` 仍是 2 处，与合前相同，是 `frustumCulled`。`useCursor`、`HoverCursor`、`useVideoTexture`、`DeskScreenVideo`、`Clone`、`CloneMount`、`FragmentClones`、`CatmullRomLine`、`TourPath`、`FocusCenter`、`FocusBounds`、`MotionPathPlayer`、`BatchSegments`、`SegmentMount`、`TreeLod` 都是 0 处
- `index.html` raw 483，gzip9 341，sha256 `b76aba44d6cbcc015a75fe2411d223c3153c688b0bfb3f992ca7b782c6fcaf60`。与合前逐字节相同。测量窗口里 `/?q=balanced` 的 gzip9 也是 341。`screenImage`、`ScreenImage`、`mountScreenImage`、`DeskScreenPoster` 都是 0 处
- `shadowBake-BIDE4SL.js`、`index-DgSBdyaU.css`、`shellClipCompile-jy31OgF.js`、`EastGrille-qSYZ9dB.js` 与五份首屏模型都与合前逐字节相同。`shellClipCompile-jy31OgF.js` raw 3063，gzip9 1434，sha256 `c300a021ff221e802d92027197c65a48f492e175fb24529a8022863acc7a2cf8`。`EastGrille-qSYZ9dB.js` raw 2090，gzip9 1055，sha256 `625f2632422b2202e996bd1017a86a97eb49c765acee83f78b15d8c800d56c81`。这两份仍在 hardGate 里。hardGate 文件里没有 `screenImage`、`ScreenImage`、`mountScreenImage`、`DeskScreenPoster`、`__twinScreenImage`、`textures/screens`
- 同参重建合前 `86cdd32` 的 dist：170 个产物。这次 dist 174 个。168 个既有产物逐字节相同。变了的是 `dock-nsaIj73.js` 和 `GridMount.js`，文件名都没变。多出来的是 `ScreenImageMount.js`、`DeskScreenPosters.js`、`textures/screens/desk.webp`、`textures/screens/camera.jpg`。`d-zQWf5D7.js` raw 13402，gzip9 4675，sha256 `3ce4e1a32e84ad377c619915ab74d4f6b677434d76bdf46f2d1d20f6cfc35c03`，与合前逐字节相同。`layerGate-3oaYL24.js`、`Workstations-m2d84Nl.js`、`floorDecor-D3S_AVv.js`、`FrustumMount.js`、`BlinkFrustum.js`、`MeshBounds.js`、`HoverCursor.js`、`ScreenVideoMount.js`、`DeskScreenVideo.js`、`CloneMount.js`、`FragmentClones.js`、`MotionPathPlayer.js`、`TourPathMount.js`、`TourPathLine.js`、`FocusMount.js`、`FocusCenter.js`、`FocusBounds.js`、`SegmentMount.js`、`BatchSegments.js`、`DecalMount.js`、`WallDecals.js` 都与合前逐字节相同。`DecalMount.js` 与 `WallDecals.js` 里没有 `mountScreenImage`、`DeskScreenPoster`、`textures/screens`、`ScreenImageMount`、`__twinScreenImage`。海报没有并进贴花包
- `dock-nsaIj73.js` 文件名不变（接线接在哈希定稿之后）。合前 raw 15730、gzip9 6081、sha256 `8cafb9a1521f2caac66f9937000664106b11e62821c8f5573cae313c81fdb39a`。现在 raw 15803、gzip9 6094、sha256 `9390c08a84ebea58737cff4ac3f9bbae6cff920c0af267c89446e45a7aa574a6`。前 15730 字节与合前逐字节相同。多出来的 73 字节是换行加上 `void import("./ScreenImageMount.js").then((m)=>{m.mountScreenImage()});` 再一个换行。`mountScreenImage` 1 处，`ScreenImageMount` 1 处。不在 hardGate 文件里。gzip9 6094 大于 hardGate 余量 42。均衡档在首帧后 2609ms 请求它，性能档在 2603ms，都在 cutoff 之外
- `GridMount.js` 文件名不变。合前 raw 6073、gzip9 2562、sha256 `41e662e4093d4ce6f8b2bc25345449d585197be576266be4a761fcc7e1f90b68`。现在 raw 6119、gzip9 2573、sha256 `1c0140271c1363fa4e99836136cb20bc24c0b8ab5d3cebd636fac17cd84448d0`。共用槽多传了 `window.__twinScreenImageNode??null`。压缩器改了局部变量名，所以不是前缀逐字节相同。`__twinScreenImageNode` 1 处，`screenImage` 0 处。没有 `DeskScreenPosters`，没有 `textures/screens`，没有 `https://`，没有 `WebGLRenderer`。不在 hardGate 文件里。gzip9 2573 大于 hardGate 余量 42。均衡档在首帧后 2635ms 请求它，性能档在 2619ms
- `ScreenImageMount.js` raw 3214，gzip9 1536，sha256 `deadfc3cd949e3e3e26ba8d9fd0a19763f4fe802b5b3c52648116dd0fd800d8b`。这是哈希定稿后单独发出的懒包。`mountScreenImage` 1 处，`__twinScreenImage` 3 处，动态 import 是 `./DeskScreenPosters.js`。`drei-Image` 1 处，是探针里的 `impl` 字符串，不是 drei 组件。`textures/screens` 2 处，`desk.webp` 1 处，`camera.jpg` 1 处。没有 `planeGeometry`，没有 `imageMaterial`，没有 `requires a url or texture`，没有 `hls`，没有 `WebGLRenderer`，没有 `https://`。不在 hardGate 文件里。gzip9 1536 大于 hardGate 余量 42。均衡档在首帧后 2637ms 请求它，性能档在 2621ms
- `DeskScreenPosters.js` raw 8749，gzip9 3948，sha256 `39c1c01b1e8328b94daa8530df28ea14854292349425aa0b84877c8984490499`。静态 import 复用入口包。`drei-Image` 1 处，`planeGeometry` 1 处，`imageMaterial` 1 处，`requires a url or texture` 1 处，`textures/screens` 4 处。没有 `hls`，没有 `WebGLRenderer`，没有 `https://`。不在 hardGate 文件里。gzip9 3948 大于 hardGate 余量 42。均衡档在首帧后 2688ms 请求它，性能档在 2693ms
- `textures/screens/desk.webp` raw 534，gzip9 557，sha256 `010ec5b64623636b1a0387d243cc1cb04902cdca27b1dd224112dcd201a7c7a1`。`textures/screens/camera.jpg` raw 2054，gzip9 1419，sha256 `2811d59683ebad982e9bcff7fd48280a2d66d83f58dbe729a96518d6fa43b0ba`。两张都是本地 `public/textures/screens` 贴图。gzip9 都大于 hardGate 余量 42。均衡档在首帧后 3394ms 请求这两张，性能档在 3451ms。测量窗口的 hardGate 文件里没有它们
- 锁机 cutoff 是首帧 + 64ms。另一次冒烟把页面留到 `__twinReady` 之后 12000ms：均衡档 dock、floorDecor、textRuntime 都在首帧后 2609ms，DemandLoop 在 2613ms，Detailed 与 layerGate 都在 2620ms，GridMount 在 2635ms，DecalMount 与 SegmentMount 都在 2636ms，FocusMount、CloneMount、ScreenVideoMount、HoverCursor、FrustumMount 与 ScreenImageMount 都在 2637ms，LayerPanel 在 2654ms，DeskScreenPosters 在 2688ms，PickBvhHost 与 TreeLod 都在 2913ms，PickBvh 在 2923ms，`desk.webp` 与 `camera.jpg` 都在 3394ms。`street-tree-hi.glb` 与 `street-tree-lo.glb`、balancedFx、EastGrille、shellClipCompile 都在首帧之前。这次没有请求 `MeshBounds.js`、`BlinkFrustum.js`、`FocusCenter.js`、`FocusBounds.js`、`MotionPathPlayer.js`、`TourPathLine.js`、`BatchSegments.js`、`FragmentClones.js`、`DeskScreenVideo.js`、`desk-cam.mp4`、`CursorMount.js`。性能档 dock 与 floorDecor 都在 2603ms，textRuntime 在 2604ms，DemandLoop 在 2607ms，layerGate 与 Detailed 都在 2611ms，GridMount 在 2619ms，DecalMount、FocusMount 与 SegmentMount 都在 2620ms，CloneMount、ScreenVideoMount、FrustumMount、HoverCursor 与 ScreenImageMount 都在 2621ms，LayerPanel 在 2633ms，BlinkFrustum 在 2692ms，DeskScreenPosters 在 2693ms，PickBvhHost 在 2867ms，PickBvh 在 2871ms，MeshBounds 在 3444ms，`desk.webp` 与 `camera.jpg` 都在 3451ms。性能档这次没有请求 balancedFx、`street-tree-hi.glb`、TreeLod、`BatchSegments.js`、`MotionPathPlayer.js`、`FocusCenter.js`、`FocusBounds.js`、`TourPathLine.js`、`FragmentClones.js`、`DeskScreenVideo.js`、`desk-cam.mp4`、`CursorMount.js`。两个总览档位的这些后到分包都在 cutoff 之外
- 均衡档默认 `window.__twinScreenImage` 为 `{ demo: true, on: true, mounted: true, desks: 0, camera: false, cap: 4, deskSrc: "/textures/screens/desk.webp", cameraSrc: "/textures/screens/camera.jpg", impl: "drei-Image", rounded: false }`。按钮文案是「屏海报」和「开」，`aria-pressed` 为 true。性能档相同：`on` 为 true，`mounted` 为 true，`desks` 为 0，`camera` 为 false。总览这 12 秒里没有扫到工位屏实例，所以张数是 0；海报分包已经挂上，两张本地贴图也已经发出。均衡档默认 `window.__twinMeshBounds` 为 `{ on: false, reason: "off", count: 0, kinds: { grille: 0, tree: 0, lamp: 0, sign: 0, person: 0 }, names: [] }`。性能档默认开，`reason` 为 `"perf"`，`on` 为 true，`count` 为 8，`kinds` 为 `{ grille: 1, tree: 2, lamp: 2, sign: 3, person: 0 }`。均衡档默认 `window.__twinFrustumBlink` 为 `{ on: false, reason: "off", scale: 1, primed: false, alarm: null, flash: null, sign: null, lamps: 0, lampsHidden: 0 }`。性能档默认开，`reason` 为 `"perf"`，`scale` 为 0.72。默认 `window.__twinHoverCursor` 为 `{ enabled: true, hovered: false, target: null, yielded: "", container: "canvas" }`。默认 `window.__twinScreenVideo` 为 `{ demo: true, on: false, mounted: false, src: "/media/desk-cam.mp4", muted: true, playsInline: true, loop: true, desks: 0, camera: false, hls: false, impl: "drei-useVideoTexture" }`。默认 `window.__twinClone` 为 `{ on: false, mounted: false, count: 0, cap: 3, dropped: 0, deep: false, castShadow: true, receiveShadow: true, sharedMaterials: true, source: "off" }`。默认 `window.__twinTourPath` 为 `{ demo: true, on: false, mounted: false, points: 0, segments: 12, tension: 0.35, curve: "centripetal" }`。默认 `window.__twinMotionPath` 为 undefined（播放包没加载）。默认 `window.__twinFocusFit` 为 `{ resident: false, center: false, bounds: false, centerLoaded: false, boundsLoaded: false, mode: "off", subject: null, handedBack: true, blocked: "" }`。默认 `window.__twinSegments` 为 `{ on: false, mounted: false, shown: 0, limit: 48, dropped: 0, source: "off", floorId: null }`
- 控制台冒烟：均衡档与性能档各一次，`window.__twinReady === true`，`pageerror` 为 0，`console.error` 为 0。视口 1366×768，swiftshader。`preserveDrawingBuffer` 为 false

结论：**PASS**。

### hardGate 文件

| gzip9 | url |
| ---: | --- |
| 400115 | `/assets/index-DR969EVf.js` |
| 13577 | `/models/street-tree-hi.glb` |
| 5061 | `/models/roof-sign.glb` |
| 3666 | `/assets/index-DgSBdyaU.css` |
| 3466 | `/models/street-tree-lo.glb` |
| 3229 | `/models/east-grille-v4-lo.glb` |
| 2666 | `/models/street-lamp.glb` |
| 1709 | `/assets/shadowBake-BIDE4SL.js` |
| 1434 | `/assets/shellClipCompile-jy31OgF.js` |
| 1055 | `/assets/EastGrille-qSYZ9dB.js` |
| 341 | `/?q=balanced` |
