# D300 merge #73（T065 Wall Decal lazy）

| 项 | 值 |
| --- | --- |
| pre SHA | `64700a1a49272e29ce79aef879c433c81b79ca97` |
| merge SHA | `8e2c45a8ee3c3a004b5cc0143a9d244f84c2dc66` |
| parents | `64700a1a49272e29ce79aef879c433c81b79ca97` `8e80b00ec8486f990d45322ff2f041d14b0c9a82` |
| PR head | `8e80b00ec8486f990d45322ff2f041d14b0c9a82` |
| hardGate | 436322（≤ 436361，余量 39）PASS |
| balancedFx | 104552（≤ 105000，余量 448）PASS |
| twinReady | true |
| pageerror | 0 |
| CloudAgent | `bc-b46b5990-4f7e-5df9-9566-c54e8a36c787` |

本文件按 `reviews/merge-d300-70.md` / `reviews/merge-d300-71.md` / `reviews/merge-d300-72.md` 的字段来写：合并前 SHA、merge SHA、parents、门禁数字、twinReady / pageerror、CloudAgent id。

## 合并

合并前 `origin/main` 是 `64700a1a49272e29ce79aef879c433c81b79ca97`。PR #73 的 `headRefOid` 是 `8e80b00ec8486f990d45322ff2f041d14b0c9a82`，tip 的唯一父提交也是 `64700a1a49272e29ce79aef879c433c81b79ca97`。合并前 `isDraft` 为 true，`state` 为 OPEN，`mergeable` 为 MERGEABLE，`mergeStateStatus` 为 CLEAN。草稿已标为 ready。没有改写这条 tip。

`gh pr merge` 没有 `--no-ff` 开关。用的是 merge commit 策略（不是 squash，不是 rebase），并锁了 `--match-head-commit 8e80b00ec8486f990d45322ff2f041d14b0c9a82`：

```
gh pr ready 73 --repo lenaelelle672-beep/uniview-twin
gh pr merge 73 --repo lenaelelle672-beep/uniview-twin --merge --match-head-commit 8e80b00ec8486f990d45322ff2f041d14b0c9a82
```

没有 force-push。GitHub [PR #73](https://github.com/lenaelelle672-beep/uniview-twin/pull/73) 状态是 **MERGED**，`mergeCommit` 是 `8e2c45a8ee3c3a004b5cc0143a9d244f84c2dc66`（`mergedAt` 2026-10-24T07:09:05Z）。两个父提交是 `64700a1a49272e29ce79aef879c433c81b79ca97` 与 `8e80b00ec8486f990d45322ff2f041d14b0c9a82`。merge 树与 PR head 树相同（`1eca5553e446be484c9baadd0d614fa37ea788c8`）。

门禁跑在 merge 提交上。本说明是紧随其后的一次提交，只加这个证据文件，不含产品代码，parent 是该 merge commit。只推 `main`。

## 门禁

`npm ci`，然后 `SHADER_PREWARM=false npm run build`。`scripts/measure-first-screen.mjs`，均衡档 1366×768，Python `gzip.compress(9)`。下面是合入后在 merge commit 上的实测。相对合前基线 436322 / 104552。脚本 `ok: true`，`failures` 为空。性能档总览没有请求 balancedFx。

- **hardGate 436322** ≤ 436361，余量 39，**PASS**（相对合前 main / PR #70 合并后基线 436322 / 104552 为 +0 / +0）
- **balancedFx 104552** ≤ 105000，余量 448，**PASS**
- 性能档总览没有请求 balancedFx（gzip 0），也没有 `street-tree-hi.glb`；性能档首屏 hardGate 口径 422745（合前 422745，同为 +0）。少掉的正是均衡档才拉的 `street-tree-hi.glb`（gzip9 13577）：436322 − 13577 = 422745
- 入口 `index-B_0OL4ix.js` raw 1413239，gzip9 400118，sha256 `7a5bb9e68abba4c5651fc7924100c04cea1fb1fdf36c13d55bb51ebe9746f48c`。与合前同参构建逐字节相同，文件名也相同，哈希就是 `reviews/merge-d300-70.md` 记下的那一版。入口里 `WallDecals`、`DecalMount`、`DecalGeometry`、`DemoPlaques`、`Billboard`、`__twinPlaques`、`plaques` 都是 0 处，也没有 `ColorManagement-` / `Vector3-` 这种新共享块的文件名。`cameraRest` 仍是 2 处。`BalancedSoftShadows` 仍是 2 处。`dock-` 仍是 1 处，是 `import("./dock-CheMkHl.js")` 懒字符串。`d-BQ2aWWl` 是 1 处，是 `import("./d-BQ2aWWl.js")` 懒字符串。`textRuntime` 是 1 处懒字符串。`frameSchedule` 文件名在入口里是 0。`EdgesGeometry` 仍是 3 处，`Wireframe` 仍是 5 处，是 three 自带的。入口里原有的 `ColorManagement` 字面量仍是 3 处
- `balancedFx-hTI5QIy.js` raw 246234，gzip9 104552，sha256 `8f4e10f301bacc0a3780ac018ce8b736c966d8f5eaa5a6555ef1f0771b28be80`。与合前同参构建逐字节相同。`balancedFx` 里 `WallDecals`、`DecalMount`、`DecalGeometry`、`decals/mount` 都是 0 处
- 相对合前 main 的同参构建，产物 147 → 151。146 个文件逐字节相同。内容变化只有 `dock-CheMkHl.js`：文件名没变（哈希定稿后才把接线接回去），raw 12532 → 12598（+66），gzip9 5268 → 5282（+14），sha256 `ffc126fc1410ba073741ab53b110c8e6a918800a5133e50eb88f87fc923a099c`。合前 sha256 `930a21f6d44a74c4c523c8509809b7196c6d5ffefd612407aa3b451c3974daca`，就是 `reviews/merge-d300-70.md` 记下的那一版。多出来的 66 字节就是哈希定稿后接上的换行、`void import("./DecalMount.js").then((m)=>{m.mountWallDecals()});`、再一个换行。dock 不在 hardGate 里，这 +14 gzip 不进门禁。新文件不进 vite 内容哈希：`assets/DecalMount.js` raw 9790，gzip9 3968，sha256 `06d2d9bb7216adfafe477cac97cd4f439d87272a00a7d5f8f14753cd15e7f447`；`assets/WallDecals.js` raw 11656，gzip9 4783，sha256 `ba63702f3e5bc799df75b1b92b224ef3fa583f9a89f4c32d4f490ae4cccf6ae9`；`textures/decals/alarm.png` raw 163，gzip9 166，sha256 `a7407b93da49b1045be99943b0e69136df8fd45388ce7ce990bdbca8d0b454f5`；`textures/decals/demo.png` raw 267，gzip9 290，sha256 `c4f878dee72c26eb70b76c0c05bc83da23bc39d3e2f4b833a6d31c4e7c691e00`。`index.html` raw 仍是 483，gzip9 343，sha256 `d973eb96d7b3cca054952348b796f41875ac1d1799a0cb3fe9f15424e2b96e25`，与合前逐字节相同。`EastGrille-CqkuGOS.js`、`shellClipCompile-D3GaUEd.js`、`shadowBake-BIDE4SL.js`、`index-DgSBdyaU.css`、`d-BQ2aWWl.js`、`LayerPanel-CQCJzT5.js`、`DemoPlaques-5YGliVz.js` 的文件名和字节都没变。`package.json` 与 `package-lock.json` 相对合前 main 无差异，依赖仍是 11 个，0 个新依赖。`@react-three/drei` 仍是 `10.7.9`（`package.json`、lock、`node_modules` 三处都是），没有升版本。产物里 0 个文件含 `ccapture`。全 dist 里 `DecalGeometry` 只出现在 `WallDecals.js`（1 处）。`Decal must have a Mesh` 与 `requires a url or texture` 也只在 `WallDecals.js`（各 1 处）。`DecalMount.js` 含 `./WallDecals.js` 与 `mountWallDecals`，不含 `DecalGeometry`。两个贴花分包都 `import` 自 `./index-B_0OL4ix.js`，里面 0 处 `https://`、0 处 `jsdelivr`
- hardGate 文件里没有 `WallDecals`、`DecalMount`、`DecalGeometry`、`alarm.png`、`demo.png`、`DemoPlaques`、`Billboard`、`ColorManagement-`、`Vector3-`、`dock`、DemandLoop（`d-`）、`LayerPanel`、`textRuntime`、`frameSchedule`、`cameraRest`、`shaderMaterial`、`PickBvh`、`Ray`、`structureEdges`、`structureArm`、`ShellWireframe`、`RectAreaMount`、`RectAreaLive`、`AuthorHelpers`、`ClipCapture`、`AlarmAudioCue`。测量窗口（`__twinReady` 后再等 1500ms）也没有请求这些块
- 锁机 cutoff 是首帧 + 64ms。另一次冒烟把页面留到 `__twinReady` 之后 12000ms：均衡档总览（`view` 为 `building`）dock 在首帧后 2605ms，floorDecor 在 2605ms，BlueprintView 在 2605ms，textRuntime 在 2605ms，DemandLoop（`d-BQ2aWWl.js`）在 2607ms，frameSchedule 与 cameraRest 都在 2615ms，shaderMaterial 在 2615ms，AlarmAudioCue 在 2626ms，ClipCapture、AuthorHelperMount、GridMount、DecalMount、minimap `mount` 与 shortcuts `arm` 都在 2627ms，LayerPanel 在 2640ms，PickBvhHost 在 2908ms，PickBvh、Vector3 与 Ray 都在 2920ms。性能档 dock 与 floorDecor 都在 2609ms，BlueprintView 与 textRuntime 都在 2610ms，DemandLoop 在 2614ms，frameSchedule 与 cameraRest 都在 2622ms，shaderMaterial 在 2623ms，AlarmAudioCue、ClipCapture、GridMount 与 AuthorHelperMount 都在 2632ms，DecalMount 在 2633ms，arm 在 2634ms，LayerPanel 在 2644ms，PickBvhHost 在 2898ms，PickBvh、Vector3 与 Ray 都在 3152ms。两个总览档位都在 cutoff 之外。性能档没有请求 balancedFx，也没有 `street-tree-hi.glb`。两个总览档位在这 12s 里都没有请求 `WallDecals.js`，也没有请求 `textures/decals/alarm.png`、`textures/decals/demo.png`，也没有名为 `DecalGeometry` 的资源，也没有请求 DemoPlaques、ColorManagement、structureEdges、structureArm、ShellWireframe、RectAreaMount、RectAreaLive、AuthorHelpers。`window.__twinDecals` 为 `on: false`、`mounted: 0`、`decals: 0`、`images: 0`、`cap: 3`、`blocked: false`。首帧 + 64ms 之内的请求就是 hardGate 那一组（均衡档另加 balancedFx、hdr 与 favicon；性能档没有 balancedFx，也没有 `street-tree-hi.glb`，hdr 仍在）
- dock 没有抢走 firstPrefetch。`__twinFirstPrefetchDone` 仍由 textRuntime 的 import 落下（`prefetchLazyChunks.ts` 里的 `markFirstPrefetchDone`），均衡档与性能档冒烟都读到 `true`。均衡档 textRuntime 在首帧后 2605ms，标志在 2650ms 落下；dock 在 2605ms，与 floorDecor 同一波楼层壳，没有进首帧 + 64ms。性能档 textRuntime 在 2610ms，标志在 2688ms 落下；dock 在 2609ms。贴花分包不在这波请求里：DecalMount 要等 dock 求值之后才发，均衡档 2627ms，性能档 2633ms
- `?q=balanced&view=floor&floor=F12` 的冒烟：等 `__twinReady` 之后点 `[data-layer="decals"]`，再等到 `WallDecals.js` 和 `__twinDecals.mounted > 0`。`view` 为 `floor`，`__twinDecals` 为 `on: true`、`mounted: 2`、`decals: 2`、`images: 0`、`cap: 3`、`blocked: false`。`DecalMount.js` 在首帧后 709ms，`WallDecals.js` 在 8025ms，`textures/decals/demo.png` 在 8053ms，都在 cutoff 之外。这次没有告警焦点，所以没有请求 `alarm.png`。`DecalGeometry` 没有单独的请求，它打在 `WallDecals.js` 里。单层会提前挂上 DemandLoop，`d-BQ2aWWl.js` 落在首帧之前；这一轮 dock 请求开始于首帧后 27ms，textRuntime 在 30ms，`__twinFirstPrefetchDone` 在 4072ms 落下，仍是 textRuntime 的 import，dock 没有把标志提前置上。DecalMount 没有跟着 dock 的请求起点进首帧 + 64ms。这次 `pageerror` 为 0，`console.error` 为 0
- 控制台冒烟：`window.__twinReady === true`，`pageerror` 为 0，`console.error` 为 0（均衡档总览、性能档总览、单层贴花开关各一次）。`preserveDrawingBuffer` 为 false（URL 没有 `keepDrawingBuffer=1`）

结论：**PASS**。

### hardGate 文件

| gzip9 | url |
| ---: | --- |
| 400118 | `/assets/index-B_0OL4ix.js` |
| 13577 | `/models/street-tree-hi.glb` |
| 5061 | `/models/roof-sign.glb` |
| 3666 | `/assets/index-DgSBdyaU.css` |
| 3466 | `/models/street-tree-lo.glb` |
| 3229 | `/models/east-grille-v4-lo.glb` |
| 2666 | `/models/street-lamp.glb` |
| 1709 | `/assets/shadowBake-BIDE4SL.js` |
| 1433 | `/assets/shellClipCompile-D3GaUEd.js` |
| 1054 | `/assets/EastGrille-CqkuGOS.js` |
| 343 | `/?q=balanced` |
