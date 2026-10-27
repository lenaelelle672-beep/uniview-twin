# D300 merge #81（T078 meshBounds）

| 项 | 值 |
| --- | --- |
| pre SHA | `1a0343df6c015f98d962e6206e1039a16c81827f` |
| merge SHA | `5d4bdbd49a21a0ec0f0d6a9cadace79aef45af62` |
| parents | `1a0343df6c015f98d962e6206e1039a16c81827f` `745d58cd49a043ee5ca08957384d14d6696af892` |
| PR head | `745d58cd49a043ee5ca08957384d14d6696af892` |
| hardGate | 436319（≤ 436361，余量 42）PASS |
| balancedFx | 104552（≤ 105000，余量 448）PASS |
| twinReady | true |
| pageerror | 0 |
| CloudAgent | `bc-801abadc-02bb-517d-b183-8cdbd0a0da40` |

本文件按 `reviews/merge-d300-83.md` / `reviews/merge-d300-79.md` 的字段来写：合并前 SHA、merge SHA、parents、门禁数字、twinReady / pageerror、CloudAgent id。

## 合并

合并前 `origin/main` 是 `1a0343df6c015f98d962e6206e1039a16c81827f`。PR #81 的 `headRefOid` 是 `745d58cd49a043ee5ca08957384d14d6696af892`。合并前 `isDraft` 为 true，`state` 为 OPEN，`mergeable` 为 MERGEABLE，`mergeStateStatus` 为 CLEAN。草稿已标为 ready。标成 ready 之后再查了一次：`headRefOid` 仍是 `745d58cd49a043ee5ca08957384d14d6696af892`，`baseRefOid` 仍是 `1a0343df6c015f98d962e6206e1039a16c81827f`。没有改写这条 tip。

`gh pr merge` 没有 `--no-ff` 开关。用的是 merge commit 策略（不是 squash，不是 rebase），并锁了 `--match-head-commit 745d58cd49a043ee5ca08957384d14d6696af892`：

```
gh pr ready 81 --repo lenaelelle672-beep/uniview-twin
gh pr merge 81 --repo lenaelelle672-beep/uniview-twin --merge --match-head-commit 745d58cd49a043ee5ca08957384d14d6696af892
```

没有 force-push。GitHub [PR #81](https://github.com/lenaelelle672-beep/uniview-twin/pull/81) 状态是 **MERGED**，`mergeCommit` 是 `5d4bdbd49a21a0ec0f0d6a9cadace79aef45af62`（`mergedAt` 2026-10-27T08:33:53Z）。两个父提交是 `1a0343df6c015f98d962e6206e1039a16c81827f` 与 `745d58cd49a043ee5ca08957384d14d6696af892`。merge 树与 PR head 树相同（`88d749c544298f093ff2d670fce1391c912e8c26`）。

`origin/integration` 停在 `be8303022a4733060f77ebb1cc83897d20b94aa8`（PR #61 的证据提交），是 `main` 的祖先。到这次证据提交，`git rev-list --count origin/integration..main` 是 60。#62 之后的 merge-d300 证据只推 `main`，没有把 integration 快进到 main。这次同样只推 `main`。

门禁跑在 merge 提交上。本说明是紧随其后的一次提交，只加这个证据文件，不含产品代码，parent 是该 merge commit。

## 门禁

在 `5d4bdbd49a21a0ec0f0d6a9cadace79aef45af62` 上 `npm ci`，然后 `SHADER_PREWARM=false npm run build`。`vite preview --port 5190`，再跑 `scripts/measure-first-screen.mjs`，均衡档 1366×768，Python `gzip.compress(9)`。脚本 `ok: true`，`failures` 为空。性能档总览没有请求 balancedFx。相对合前基线 436319 / 104552。`package.json` 与 `package-lock.json` 相对合前 0 diff。

- **hardGate 436319** ≤ 436361，余量 42，**PASS**（相对合前基线 436319 / 104552 为 +0 / +0）
- **balancedFx 104552** ≤ 105000，余量 448，**PASS**
- 性能档总览没有请求 balancedFx（gzip 0），也没有 `street-tree-hi.glb`，也没有 `TreeLod-*.js`，也没有 `BatchSegments.js`，也没有 `MotionPathPlayer.js`，也没有 `FocusCenter.js`，也没有 `FocusBounds.js`，也没有 `TourPathLine.js`，也没有 `FragmentClones.js`，也没有 `DeskScreenVideo.js`，也没有 `desk-cam.mp4`，也没有 `CursorMount.js`。性能档会在 cutoff 之后请求 `BlinkFrustum.js`（性能档默认开），也会在 cutoff 之后请求 `MeshBounds.js`。性能档首屏 hardGate 口径 422742（合前 422742，+0）。少掉的正是均衡档才拉的 `street-tree-hi.glb`（gzip9 13577）：436319 − 13577 = 422742
- 入口 `index-DR969EVf.js` raw 1413239，gzip9 400115，sha256 `b56ded3cb3ae7a2fae78d7699ef86452fa3d0b1b4bd39269db1828fb55ed9321`。与合前逐字节相同（文件名仍是 `index-DR969EVf.js`）。入口里 `meshBounds`、`MeshBounds`、`mountCoarseMeshBounds`、`__twinMeshBounds` 都是 0 处。`useIntersect`、`BlinkFrustum`、`FrustumMount`、`mountFrustumPause`、`__twinFrustumBlink`、`frustum/mount`、`twin-frustum` 都是 0 处。`frustum` 仍是 33 处，与合前相同，是 three 的 `frustumCulled` / `_frustums`。`onBeforeRender` 仍是 8 处，与合前相同。入口里 `useCursor`、`HoverCursor`、`CursorMount`、`mountHoverCursor`、`__twinHoverCursor` 都是 0 处。子串 `Cursor` 有 17 处，与合前相同，全是 `dollyToCursor`。入口里 `useVideoTexture`、`DeskScreenVideo`、`ScreenVideoMount`、`mountScreenVideo`、`__twinScreenVideo`、`desk-cam`、`drei-useVideoTexture`、`hls.js` 都是 0 处。入口里 `isVideoTexture` 是 9 处、`loadedmetadata` 是 1 处、`playsInline` 是 1 处，与合前相同，这是合前就在入口里的 three `VideoTexture`。入口里 `CloneMount`、`FragmentClones`、`mountFragmentClones`、`fragment-clone`、`__twinClone`、`fragmentClone` 都是 0 处。子串 `Clone` 有 5 处，与合前相同，是 `removeRootViewTransitionClone`、`measureClonedInstance` 和 `ClonedMaterial`。`CatmullRomLine`、`TourPath`、`tour-path`、`mountTourPath`、`TourPathLine`、`TourPathMount` 都是 0 处。`FocusMount`、`FocusCenter`、`FocusBounds`、`mountFocusFit`、`__twinFocusFit` 都是 0 处，`MotionPathPlayer`、`BatchSegments`、`SegmentMount`、`TreeLod`、`DecalMount` 也都是 0 处。`street-tree-hi` 仍是 1 处。入口里 `CatmullRomCurve3` 是 5 处、`CatmullRom` 是 13 处，与合前相同
- `balancedFx-BB0zAHf.js` raw 246234，gzip9 104552，sha256 `659559f1ef3808fa5b50c2dc69a8d41b993a61f680280777bdcab4f8ecba5710`。与合前逐字节相同（文件名仍是 `balancedFx-BB0zAHf.js`）。`balancedFx` 里 `meshBounds`、`MeshBounds`、`mountCoarseMeshBounds`、`__twinMeshBounds` 都是 0 处。`useIntersect`、`BlinkFrustum`、`FrustumMount`、`mountFrustumPause`、`__twinFrustumBlink` 都是 0 处。`frustum` 仍是 2 处，与合前相同，是 `frustumCulled`。`useCursor`、`HoverCursor`、`useVideoTexture`、`DeskScreenVideo`、`Clone`、`CloneMount`、`FragmentClones`、`CatmullRomLine`、`TourPath`、`FocusCenter`、`FocusBounds`、`MotionPathPlayer`、`BatchSegments`、`SegmentMount`、`TreeLod` 都是 0 处
- `index.html` raw 483，gzip9 341，sha256 `b76aba44d6cbcc015a75fe2411d223c3153c688b0bfb3f992ca7b782c6fcaf60`。与合前逐字节相同。测量窗口里 `/?q=balanced` 的 gzip9 也是 341。`meshBounds`、`MeshBounds`、`mountCoarseMeshBounds` 都是 0 处
- `shadowBake-BIDE4SL.js`、`index-DgSBdyaU.css`、`shellClipCompile-jy31OgF.js`、`EastGrille-qSYZ9dB.js` 与五份首屏模型都与合前逐字节相同。`shellClipCompile-jy31OgF.js` raw 3063，gzip9 1434，sha256 `c300a021ff221e802d92027197c65a48f492e175fb24529a8022863acc7a2cf8`。`EastGrille-qSYZ9dB.js` raw 2090，gzip9 1055，sha256 `625f2632422b2202e996bd1017a86a97eb49c765acee83f78b15d8c800d56c81`。这两份仍在 hardGate 里。hardGate 文件里没有 `meshBounds`、`MeshBounds`、`mountCoarseMeshBounds`
- 同参重建合前 `1a0343d` 的 dist：169 个产物。这次 dist 170 个，多出来的是 `MeshBounds.js`。168 个既有产物逐字节相同。变了的只有 DemandLoop `d-zQWf5D7.js`，文件名没变。`dock-nsaIj73.js` raw 15730，gzip9 6081，sha256 `8cafb9a1521f2caac66f9937000664106b11e62821c8f5573cae313c81fdb39a`，与合前逐字节相同。dock 不调用 `mountCoarseMeshBounds`，也不引用 `MeshBounds.js`。`layerGate-3oaYL24.js`、`Workstations-m2d84Nl.js`、`floorDecor-D3S_AVv.js`、`FrustumMount.js`、`BlinkFrustum.js` 都与合前逐字节相同，都不在 hardGate 文件里
- `d-zQWf5D7.js` 文件名不变（门闩接在哈希定稿之后）。合前 raw 12366、gzip9 4271、sha256 `4f15126a42ef5f0dbe414b8041e2762862ed8c38559d2d54d3d54988ca43f851`。现在 raw 13402、gzip9 4675、sha256 `3ce4e1a32e84ad377c619915ab74d4f6b677434d76bdf46f2d1d20f6cfc35c03`。前 12366 字节与合前逐字节相同。多出来的 1036 字节是换行加上门闩 IIFE 再一个换行。IIFE 读 `meshBounds` 查询参数，默认关时写 `window.__twinMeshBounds`，性能档或 `meshBounds=1` 时 `import("./MeshBounds.js")` 再调 `mountCoarseMeshBounds`。`meshBounds` 1 处，`MeshBounds` 3 处（`__twinMeshBounds`、`mountCoarseMeshBounds`、`./MeshBounds.js`），`mountCoarseMeshBounds` 1 处，`__twinMeshBounds` 1 处，`computeBoundingBox` 0 处。不在 hardGate 文件里。gzip9 4675 大于 hardGate 余量 42。均衡档在首帧后 2610ms 请求它，性能档在 2615ms，都在 cutoff 之外
- `MeshBounds.js` raw 40837，gzip9 13290，sha256 `6f777b8e4d2595afa7db8a8234d73cf5b70c5e825c9f6d52254f3e66e8fe4f2d`。这是哈希定稿后单独发出的懒包。`mountCoarseMeshBounds` 1 处，`meshBounds` 1 处，`computeBoundingBox` 3 处（drei 包围盒留在这个包里）。没有 `hls`，没有 `FogExp2`，没有 `VideoTexture`，没有 `balancedFx`，没有 `three-mesh-bvh`，没有 `WebGLRenderer`，没有 `IntersectionObserver`，没有 `https://`。不在 hardGate 文件里。gzip9 13290 大于 hardGate 余量 42。均衡档默认总览不请求它。性能档默认开，在首帧后 3626ms 请求它
- `HoverCursor.js`、`ScreenVideoMount.js`、`DeskScreenVideo.js`、`CloneMount.js`、`FragmentClones.js`、`MotionPathPlayer.js`、`TourPathMount.js`、`TourPathLine.js`、`FocusMount.js`、`FocusCenter.js`、`FocusBounds.js`、`SegmentMount.js`、`BatchSegments.js`、`GridMount.js` 都与合前逐字节相同，都不在 hardGate 文件里。默认总览不请求 `FocusCenter.js`、`FocusBounds.js`、`BatchSegments.js`、`MotionPathPlayer.js`、`TourPathLine.js`、`FragmentClones.js`、`DeskScreenVideo.js`、`desk-cam.mp4`、`CursorMount.js`。均衡档默认总览也不请求 `MeshBounds.js`、`BlinkFrustum.js`
- 锁机 cutoff 是首帧 + 64ms。另一次冒烟把页面留到 `__twinReady` 之后 12000ms：均衡档 dock、floorDecor 在首帧后 2607ms，textRuntime 在 2608ms，DemandLoop 在 2610ms，Detailed 与 layerGate 都在 2621ms，GridMount、DecalMount、SegmentMount、FocusMount、CloneMount、TourPathMount、ScreenVideoMount、HoverCursor 与 FrustumMount 都在 2632ms，LayerPanel 在 2643ms，PickBvhHost 与 TreeLod 都在 2911ms，PickBvh 在 2916ms。`street-tree-hi.glb` 与 `street-tree-lo.glb`、balancedFx、EastGrille、shellClipCompile 都在首帧之前。这次没有请求 `MeshBounds.js`、`BlinkFrustum.js`、`FocusCenter.js`、`FocusBounds.js`、`MotionPathPlayer.js`、`TourPathLine.js`、`BatchSegments.js`、`FragmentClones.js`、`DeskScreenVideo.js`、`desk-cam.mp4`、`CursorMount.js`。性能档 dock、floorDecor 都在 2612ms，textRuntime 在 2613ms，DemandLoop 在 2615ms，layerGate 与 Detailed 都在 2623ms，GridMount、DecalMount、SegmentMount、FocusMount、TourPathMount、CloneMount、ScreenVideoMount、HoverCursor 与 FrustumMount 都在 2659ms，LayerPanel 在 2667ms，BlinkFrustum 在 2718ms，PickBvhHost 在 2883ms，PickBvh 在 2898ms，MeshBounds 在 3626ms。性能档这次没有请求 balancedFx、`street-tree-hi.glb`、TreeLod、`BatchSegments.js`、`MotionPathPlayer.js`、`FocusCenter.js`、`FocusBounds.js`、`TourPathLine.js`、`FragmentClones.js`、`DeskScreenVideo.js`、`desk-cam.mp4`、`CursorMount.js`。两个总览档位的这些后到分包都在 cutoff 之外。`meshBounds` 没有单独的请求 URL。均衡档默认 `window.__twinMeshBounds` 为 `{ on: false, reason: "off", count: 0, kinds: { grille: 0, tree: 0, lamp: 0, sign: 0, person: 0 }, names: [] }`。性能档默认开，`reason` 为 `"perf"`，`on` 为 true，`count` 为 8，`kinds` 为 `{ grille: 1, tree: 2, lamp: 2, sign: 3, person: 0 }`。均衡档默认 `window.__twinFrustumBlink` 为 `{ on: false, reason: "off", scale: 1, primed: false, alarm: null, flash: null, sign: null, lamps: 0, lampsHidden: 0 }`。按钮文案是「视锥」和「关」，`aria-pressed` 为 false。性能档默认开，`reason` 为 `"perf"`，`scale` 为 0.72，按钮文案是「视锥」和「开」。默认 `window.__twinHoverCursor` 为 `{ enabled: true, hovered: false, target: null, yielded: "", container: "canvas" }`。默认 `window.__twinScreenVideo` 为 `{ demo: true, on: false, mounted: false, src: "/media/desk-cam.mp4", muted: true, playsInline: true, loop: true, desks: 0, camera: false, hls: false, impl: "drei-useVideoTexture" }`。默认 `window.__twinClone` 为 `{ on: false, mounted: false, count: 0, cap: 3, dropped: 0, deep: false, castShadow: true, receiveShadow: true, sharedMaterials: true, source: "off" }`。默认 `window.__twinTourPath` 为 `{ demo: true, on: false, mounted: false, points: 0, segments: 12, tension: 0.35, curve: "centripetal" }`。默认 `window.__twinMotionPath` 为 undefined（播放包没加载）。默认 `window.__twinFocusFit` 为 `{ resident: false, center: false, bounds: false, centerLoaded: false, boundsLoaded: false, mode: "off", subject: null, handedBack: true, blocked: "" }`。默认 `window.__twinSegments` 为 `{ on: false, mounted: false, shown: 0, limit: 48, dropped: 0, source: "off", floorId: null }`
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
