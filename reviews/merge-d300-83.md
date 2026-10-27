# D300 merge #83（T076 useIntersect）

| 项 | 值 |
| --- | --- |
| pre SHA | `24a52d3c9db578fa85b14ed9050fd311809953ae` |
| merge SHA | `de3a90806c24af7a50ccf987f853b1d64fd24405` |
| parents | `24a52d3c9db578fa85b14ed9050fd311809953ae` `5bf6eb81128f93d3aa7dc754dcf0c11db28f4f8d` |
| PR head | `5bf6eb81128f93d3aa7dc754dcf0c11db28f4f8d` |
| hardGate | 436319（≤ 436361，余量 42）PASS |
| balancedFx | 104552（≤ 105000，余量 448）PASS |
| twinReady | true |
| pageerror | 0 |
| CloudAgent | `bc-01e20b71-e25e-53c8-81f0-2f9f76d40b66` |

本文件按 `reviews/merge-d300-79.md` / `reviews/merge-d300-78.md` / `reviews/merge-d300-77.md` 的字段来写：合并前 SHA、merge SHA、parents、门禁数字、twinReady / pageerror、CloudAgent id。

## 合并

合并前 `origin/main` 是 `24a52d3c9db578fa85b14ed9050fd311809953ae`。PR #83 的 `headRefOid` 是 `5bf6eb81128f93d3aa7dc754dcf0c11db28f4f8d`。合并前 `isDraft` 为 true，`state` 为 OPEN，`mergeable` 为 MERGEABLE，`mergeStateStatus` 为 CLEAN。草稿已标为 ready。标成 ready 之后再查了一次：`headRefOid` 仍是 `5bf6eb81128f93d3aa7dc754dcf0c11db28f4f8d`，`baseRefOid` 仍是 `24a52d3c9db578fa85b14ed9050fd311809953ae`。没有改写这条 tip。

`gh pr merge` 没有 `--no-ff` 开关。用的是 merge commit 策略（不是 squash，不是 rebase），并锁了 `--match-head-commit 5bf6eb81128f93d3aa7dc754dcf0c11db28f4f8d`：

```
gh pr ready 83 --repo lenaelelle672-beep/uniview-twin
gh pr merge 83 --repo lenaelelle672-beep/uniview-twin --merge --match-head-commit 5bf6eb81128f93d3aa7dc754dcf0c11db28f4f8d
```

没有 force-push。GitHub [PR #83](https://github.com/lenaelelle672-beep/uniview-twin/pull/83) 状态是 **MERGED**，`mergeCommit` 是 `de3a90806c24af7a50ccf987f853b1d64fd24405`（`mergedAt` 2026-10-27T07:45:56Z）。两个父提交是 `24a52d3c9db578fa85b14ed9050fd311809953ae` 与 `5bf6eb81128f93d3aa7dc754dcf0c11db28f4f8d`。merge 树与 PR head 树相同（`ec6bb6cea829bdf61f9075ba040b385f6208d185`）。

`origin/integration` 停在 `be8303022a4733060f77ebb1cc83897d20b94aa8`（PR #61 的证据提交），是 `main` 的祖先。到这次证据提交，`git rev-list --count origin/integration..main` 是 57。#62 之后的 merge-d300 证据只推 `main`，没有把 integration 快进到 main。这次同样只推 `main`。#81 仍是 OPEN，没有合。

门禁跑在 merge 提交上。本说明是紧随其后的一次提交，只加这个证据文件，不含产品代码，parent 是该 merge commit。

## 门禁

在 `de3a90806c24af7a50ccf987f853b1d64fd24405` 上 `npm ci`，然后 `SHADER_PREWARM=false npm run build`。`vite preview --port 5190`，再跑 `scripts/measure-first-screen.mjs`，均衡档 1366×768，Python `gzip.compress(9)`。脚本 `ok: true`，`failures` 为空。性能档总览没有请求 balancedFx。相对合前基线 436317 / 104553。

- **hardGate 436319** ≤ 436361，余量 42，**PASS**（相对合前基线 436317 / 104553 为 +2 / −1）
- **balancedFx 104552** ≤ 105000，余量 448，**PASS**
- 性能档总览没有请求 balancedFx（gzip 0），也没有 `street-tree-hi.glb`，也没有 `TreeLod-*.js`，也没有 `BatchSegments.js`，也没有 `MotionPathPlayer.js`，也没有 `FocusCenter.js`，也没有 `FocusBounds.js`，也没有 `TourPathLine.js`，也没有 `FragmentClones.js`，也没有 `DeskScreenVideo.js`，也没有 `desk-cam.mp4`，也没有 `CursorMount.js`。性能档会在 cutoff 之后请求 `BlinkFrustum.js`（性能档默认开）。性能档首屏 hardGate 口径 422742（合前 422740，+2）。少掉的正是均衡档才拉的 `street-tree-hi.glb`（gzip9 13577）：436319 − 13577 = 422742
- 入口 `index-DR969EVf.js` raw 1413239，gzip9 400115，sha256 `b56ded3cb3ae7a2fae78d7699ef86452fa3d0b1b4bd39269db1828fb55ed9321`。合前是 `index-DbRjsYXi.js`，raw 同为 1413239，gzip9 400116，sha256 `6df4633125ebec2cdfb029e9bfad30d3c7dc837071884e7337821932039b6979`。同长文件里有 28 处差异，全是动态 `import("./…js")` 的分包文件名哈希。入口里 `useIntersect`、`BlinkFrustum`、`FrustumMount`、`mountFrustumPause`、`__twinFrustumBlink`、`frustum/mount`、`twin-frustum` 都是 0 处。`frustum` 仍是 33 处，与合前相同，是 three 的 `frustumCulled` / `_frustums`。`onBeforeRender` 仍是 8 处，与合前相同。入口里 `useCursor`、`HoverCursor`、`CursorMount`、`mountHoverCursor`、`__twinHoverCursor` 都是 0 处。子串 `Cursor` 有 17 处，与合前相同，全是 `dollyToCursor`。入口里 `useVideoTexture`、`DeskScreenVideo`、`ScreenVideoMount`、`mountScreenVideo`、`__twinScreenVideo`、`desk-cam`、`drei-useVideoTexture`、`hls.js` 都是 0 处。入口里 `isVideoTexture` 是 9 处、`loadedmetadata` 是 1 处、`playsInline` 是 1 处，与合前相同，这是合前就在入口里的 three `VideoTexture`。入口里 `CloneMount`、`FragmentClones`、`mountFragmentClones`、`fragment-clone`、`__twinClone`、`fragmentClone` 都是 0 处。子串 `Clone` 有 5 处，与合前相同，是 `removeRootViewTransitionClone`、`measureClonedInstance` 和 `ClonedMaterial`。`CatmullRomLine`、`TourPath`、`tour-path`、`mountTourPath`、`TourPathLine`、`TourPathMount` 都是 0 处。`FocusMount`、`FocusCenter`、`FocusBounds`、`mountFocusFit`、`__twinFocusFit` 都是 0 处，`MotionPathPlayer`、`BatchSegments`、`SegmentMount`、`TreeLod`、`DecalMount` 也都是 0 处。`street-tree-hi` 仍是 1 处。入口里 `CatmullRomCurve3` 是 5 处、`CatmullRom` 是 13 处，与合前相同
- `balancedFx-BB0zAHf.js` raw 246234，gzip9 104552，sha256 `659559f1ef3808fa5b50c2dc69a8d41b993a61f680280777bdcab4f8ecba5710`。合前是 `balancedFx-CNf9M9t.js`，raw 同为 246234，gzip9 104553，sha256 `9f81d8a80b6a5c664021a23cf746ed5d21c78ce67a5962cb4dce207b210cd78e`。唯一差异是静态 import 从 `./index-DbRjsYXi.js` 换成 `./index-DR969EVf.js`。`balancedFx` 里 `useIntersect`、`BlinkFrustum`、`FrustumMount`、`mountFrustumPause`、`__twinFrustumBlink` 都是 0 处。`frustum` 仍是 2 处，与合前相同，是 `frustumCulled`。`useCursor`、`HoverCursor`、`useVideoTexture`、`DeskScreenVideo`、`Clone`、`CloneMount`、`FragmentClones`、`CatmullRomLine`、`TourPath`、`FocusCenter`、`FocusBounds`、`MotionPathPlayer`、`BatchSegments`、`SegmentMount`、`TreeLod` 都是 0 处
- `index.html` raw 483，gzip9 341，sha256 `b76aba44d6cbcc015a75fe2411d223c3153c688b0bfb3f992ca7b782c6fcaf60`。合前 raw 483，gzip9 340，sha256 `f4f59f6133c5e1fb9eca1f9a6369a659ca2ece252e8b4cfccf93605b300769af`。唯一差异是脚本地址从 `index-DbRjsYXi.js` 换成 `index-DR969EVf.js`。测量窗口里 `/?q=balanced` 的 gzip9 是 341
- `shadowBake-BIDE4SL.js`、`index-DgSBdyaU.css` 与五份首屏模型都与合前逐字节相同。`shellClipCompile-jy31OgF.js` raw 3063，gzip9 1434，sha256 `c300a021ff221e802d92027197c65a48f492e175fb24529a8022863acc7a2cf8`。合前 `shellClipCompile-CTGtCTI.js` raw 3063，gzip9 1434。唯一差异是入口文件名。`EastGrille-qSYZ9dB.js` raw 2090，gzip9 1055，sha256 `625f2632422b2202e996bd1017a86a97eb49c765acee83f78b15d8c800d56c81`。合前 `EastGrille-ux5rLai.js` raw 2090，gzip9 1053。唯一差异也是入口文件名。这两份仍在 hardGate 里。hardGate 的 +2 就是入口 gzip −1、EastGrille gzip +2、`/?q=balanced` gzip +1。`useIntersect` 不在这些文件里
- 同参重建合前 `24a52d3` 的 dist：167 个产物。这次 dist 169 个，多出来的是 `FrustumMount.js` 与 `BlinkFrustum.js`。既有懒包的正文差异是把入口引用改到 `index-DR969EVf.js`，外加下面三份真正长出来的包。`LayerPanel` 不进 hardGate
- `dock-nsaIj73.js` raw 15730，gzip9 6081，sha256 `8cafb9a1521f2caac66f9937000664106b11e62821c8f5573cae313c81fdb39a`。合前 `dock-BmXUbjb.js` raw 15660，gzip9 6065，sha256 `60a6e123625040fa1cb15ff2517cec968f22880436d6e8beb42fd8ae46f14463`。把两边的 `./….js` 引用归一之后，只多出 70 字节：换行加上 `void import("./FrustumMount.js").then((m)=>{m.mountFrustumPause()});` 再一个换行。文件名变了，是因为 dock 正文里的分包引用哈希变了（入口、`layerGate`、`LayerPanel` 等）。dock 里 `FrustumMount` 是 1 处，`mountFrustumPause` 是 1 处，`useIntersect`、`BlinkFrustum`、`FragmentClones.js`、`CursorMount.js`、`useCursor`、`useVideoTexture`、`desk-cam` 都是 0 处。`mountHoverCursor`、`mountFragmentClones`、`mountTourPath` 仍各是 1 处。不进 hardGate
- `FrustumMount.js` raw 3947，gzip9 1845，sha256 `563b8b9628d36f3f9c7b0802ca96ec1a7f6620c1958cbb21a267b0f31481264d`。静态 import 只有 `./index-DR969EVf.js`。动态 import 是 `./BlinkFrustum.js`。`mountFrustumPause` 1 处，`__twinFrustumBlink` 1 处，`BlinkFrustum` 2 处，`twin-frustum-blink` 1 处。`useIntersect` 是 0 处，`onBeforeRender` 是 0 处。不在 hardGate 文件里。gzip9 1845 大于 hardGate 余量 42。dock 只调用 `mountFrustumPause`。默认总览会在 cutoff 之后请求 `FrustumMount.js`，不请求 `BlinkFrustum.js`
- `BlinkFrustum.js` raw 7586，gzip9 3206，sha256 `f0e7b75dc2816483e921be94ce7134f4d2059f1ff3a05266cdd233656db0497d`。静态 import 只有 `./index-DR969EVf.js`。没有动态 import。标识 `useIntersect` 是 0 处：esbuild 把 drei 的视锥助手压进这个包，落点是 `onBeforeRender`（3 处），赋值 `a.onBeforeRender=()=>n.current=!0`。`__twinFrustumBlink` 1 处，`BlinkFrustum` 1 处，`twin-frustum-blink` 1 处。没有 `hls`，没有 `VideoTexture`，没有 `IntersectionObserver`，没有 `https://`，没有 `WebGLRenderer`。不在 hardGate 文件里。gzip9 3206 大于 hardGate 余量 42。均衡档默认总览不请求它。性能档默认开会在 cutoff 之后请求它
- `layerGate-3oaYL24.js` raw 587，gzip9 372，sha256 `0f575cb98245b34fdb063a15e12754428176e1629f2c4e25dd21f4c9a4bc4d41`。合前 `layerGate-nP6f9Q4.js` raw 277，gzip9 225。多出来的是视锥标志的读法和 `twin-frustum-blink` 订阅。`__twinFrustumBlink` 1 处。`useIntersect`、`onBeforeRender`、`BlinkFrustum` 都是 0 处。不在 hardGate 文件里。gzip9 372 大于 hardGate 余量 42
- `Workstations-m2d84Nl.js` raw 14990，gzip9 5462（合前 `Workstations-DKHWDk2.js` raw 14848，gzip9 5403）。`floorDecor-D3S_AVv.js` raw 29303，gzip9 11510（合前 `floorDecor-CEN-kva.js` raw 29156，gzip9 11454）。告警徽章和聚焦环改从 `layerGate` 读视锥标志。这两份都不在 hardGate 文件里，都在 cutoff 之后
- `HoverCursor.js`、`ScreenVideoMount.js`、`DeskScreenVideo.js`、`CloneMount.js`、`FragmentClones.js`、`MotionPathPlayer.js`、`TourPathMount.js`、`TourPathLine.js`、`FocusMount.js`、`FocusCenter.js`、`FocusBounds.js`、`SegmentMount.js`、`BatchSegments.js`、`GridMount.js` 的功能正文没有视锥代码。它们把入口引用改到 `index-DR969EVf.js`，所以与合前不是逐字节相同。都不在 hardGate 文件里。默认总览不请求 `FocusCenter.js`、`FocusBounds.js`、`BatchSegments.js`、`MotionPathPlayer.js`、`TourPathLine.js`、`FragmentClones.js`、`DeskScreenVideo.js`、`desk-cam.mp4`、`CursorMount.js`、`BlinkFrustum.js`
- 锁机 cutoff 是首帧 + 64ms。另一次冒烟把页面留到 `__twinReady` 之后 12000ms：均衡档 dock、floorDecor 在首帧后 2611ms，textRuntime 在 2612ms，Detailed 与 layerGate 都在 2623ms，GridMount 在 2635ms，DecalMount、SegmentMount、FocusMount、TourPathMount 与 CloneMount 都在 2636ms，ScreenVideoMount 在 2637ms，HoverCursor 与 FrustumMount 都在 2638ms，LayerPanel 在 2645ms，TreeLod 在 2927ms。`street-tree-hi.glb` 与 `street-tree-lo.glb`、balancedFx、EastGrille、shellClipCompile 都在首帧之前。这次没有请求 `BlinkFrustum.js`、`FocusCenter.js`、`FocusBounds.js`、`MotionPathPlayer.js`、`TourPathLine.js`、`BatchSegments.js`、`FragmentClones.js`、`DeskScreenVideo.js`、`desk-cam.mp4`、`CursorMount.js`。性能档 dock、floorDecor 都在 2608ms，textRuntime 在 2609ms，layerGate 在 2618ms，Detailed 在 2619ms，GridMount 在 2643ms，DecalMount、TourPathMount、SegmentMount、FocusMount、CloneMount、ScreenVideoMount、HoverCursor 与 FrustumMount 都在 2644ms，LayerPanel 在 2654ms，BlinkFrustum 在 2693ms。性能档这次没有请求 balancedFx、`street-tree-hi.glb`、TreeLod、`BatchSegments.js`、`MotionPathPlayer.js`、`FocusCenter.js`、`FocusBounds.js`、`TourPathLine.js`、`FragmentClones.js`、`DeskScreenVideo.js`、`desk-cam.mp4`、`CursorMount.js`。两个总览档位的这些后到分包都在 cutoff 之外。`useIntersect` 没有单独的请求 URL。均衡档默认 `window.__twinFrustumBlink` 为 `{ on: false, reason: "off", scale: 1, primed: false, alarm: null, flash: null, sign: null, lamps: 0, lampsHidden: 0 }`。按钮文案是「视锥」和「关」，`aria-pressed` 为 false。性能档默认开，`reason` 为 `"perf"`，`scale` 为 0.72，按钮文案是「视锥」和「开」。默认 `window.__twinHoverCursor` 为 `{ enabled: true, hovered: false, target: null, yielded: "", container: "canvas" }`。默认 `window.__twinScreenVideo` 为 `{ demo: true, on: false, mounted: false, src: "/media/desk-cam.mp4", muted: true, playsInline: true, loop: true, desks: 0, camera: false, hls: false, impl: "drei-useVideoTexture" }`。默认 `window.__twinClone` 为 `{ on: false, mounted: false, count: 0, cap: 3, dropped: 0, deep: false, castShadow: true, receiveShadow: true, sharedMaterials: true, source: "off" }`。默认 `window.__twinTourPath` 为 `{ demo: true, on: false, mounted: false, points: 0, segments: 12, tension: 0.35, curve: "centripetal" }`。默认 `window.__twinMotionPath` 为 undefined（播放包没加载）。默认 `window.__twinFocusFit` 为 `{ resident: false, center: false, bounds: false, centerLoaded: false, boundsLoaded: false, mode: "off", subject: null, handedBack: true, blocked: "" }`。默认 `window.__twinSegments` 为 `{ on: false, mounted: false, shown: 0, limit: 48, dropped: 0, source: "off", floorId: null }`
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
