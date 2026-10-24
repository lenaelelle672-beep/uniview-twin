# D300 merge #72（T066 useHelper）

| 项 | 值 |
| --- | --- |
| pre SHA | `eb624d4b53e9d9533e82ccac6fedd070e280d583` |
| merge SHA | `41ac7bbddb4fe0cd53a25fd76a275f4f1b9bb278` |
| parents | `eb624d4b53e9d9533e82ccac6fedd070e280d583` `540e74996f8bb631d57801865e0d28380f41ea06` |
| PR head | `540e74996f8bb631d57801865e0d28380f41ea06` |
| hardGate | 436322（≤ 436361，余量 39）PASS |
| balancedFx | 104552（≤ 105000，余量 448）PASS |
| twinReady | true |
| pageerror | 0 |
| CloudAgent | `bc-9e015e7a-e315-56ba-ae02-e4fafbe07e7d` |

本文件按 `reviews/merge-d300-69.md` 的字段来写：合并前 SHA、merge SHA、parents、门禁数字、twinReady / pageerror、CloudAgent id。

## 合并

合并前 `origin/main` 是 `eb624d4b53e9d9533e82ccac6fedd070e280d583`。PR #72 的 `headRefOid` 是 `540e74996f8bb631d57801865e0d28380f41ea06`，`baseRefOid` 是 `eb624d4b53e9d9533e82ccac6fedd070e280d583`，tip 的唯一父提交也是 `eb624d4b53e9d9533e82ccac6fedd070e280d583`。合并前 `isDraft` 为 true，`state` 为 OPEN，`mergeable` 为 MERGEABLE，`mergeStateStatus` 为 CLEAN。草稿已标为 ready。没有改写这条 tip。

`gh pr merge` 没有 `--no-ff` 开关。用的是 merge commit 策略（不是 squash，不是 rebase），并锁了 `--match-head-commit 540e74996f8bb631d57801865e0d28380f41ea06`：

```
gh pr ready 72 --repo lenaelelle672-beep/uniview-twin
gh pr merge 72 --repo lenaelelle672-beep/uniview-twin --merge --match-head-commit 540e74996f8bb631d57801865e0d28380f41ea06
```

没有 force-push。GitHub [PR #72](https://github.com/lenaelelle672-beep/uniview-twin/pull/72) 状态是 **MERGED**，`mergeCommit` 是 `41ac7bbddb4fe0cd53a25fd76a275f4f1b9bb278`（`mergedAt` 2026-10-24T05:00:02Z）。两个父提交是 `eb624d4b53e9d9533e82ccac6fedd070e280d583` 与 `540e74996f8bb631d57801865e0d28380f41ea06`。

门禁跑在 merge 提交上。本说明是紧随其后的一次提交，只加这个证据文件，不含产品代码，parent 是该 merge commit。只推 `main`。

## 门禁

`npm ci`，然后 `SHADER_PREWARM=false npm run build`。`scripts/measure-first-screen.mjs`，均衡档 1366×768，Python `gzip.compress(9)`。下面是合入后在 merge commit 上的实测。相对合前基线 436322 / 104552。脚本 `ok: true`，`failures` 为空。性能档总览没有请求 balancedFx。

- **hardGate 436322** ≤ 436361，余量 39，**PASS**（相对合前 main / PR #69 合并后基线 436322 / 104552 为 +0 / +0）
- **balancedFx 104552** ≤ 105000，余量 448，**PASS**
- 性能档总览没有请求 balancedFx（gzip 0）；性能档首屏 hardGate 口径 422745（合前 422745，同为 +0）。少掉的正是均衡档才拉的 `street-tree-hi.glb`（gzip9 13577）：436322 − 13577 = 422745
- 入口 `index-B61QpNrQ.js` raw 1413239，gzip9 400118，sha256 `ef2187abb11296b3414a57c986681e693b2bc2403c269b9fc224dfbcdca9ade4`。与合前同参构建逐字节相同，文件名也相同，哈希就是 `reviews/merge-d300-69.md` 记下的那一版。入口里 `DemandLoop`、`watchCanvasOffscreen`、`canvasOffscreen`、`useOffscreenPause`、`offscreenPause`、`isIntersecting`、`frameSchedule`、`AuthorHelper`、`useHelper`、`debugHelpers` 都是 0 处。`IntersectionObserver` 是 1 处，是 React 的 `setupIntersectionObserver`。`d-CacwR1f` 在入口里只有 1 处，是 `import("./d-CacwR1f.js")` 懒字符串。`scene-root` 是 3 处。`visibilitychange` 是 2 处
- `balancedFx-BeFs3r4.js` raw 246234，gzip9 104552，sha256 `942a82f21b7705afdb5f8f04ed197bc9b161361d736ef9a610c73d12b6d1b47f`。与合前同参构建逐字节相同。`d-CacwR1f.js` raw 10954，gzip9 3936，sha256 `c9b728ce10f7d15021a26367aa9cc62098481ac0a9be40113a1cbc4a193c2afd`，也与合前逐字节相同
- 相对合前 main 的同参构建，138 个产物逐字节相同。内容变化只有两处，都在 cutoff 之外：`dock-BXk4ePv.js` 文件名没变（哈希定稿后才把接线接回去），raw 12125 → 12201（+76），gzip9 5096 → 5112（+16），sha256 `f73cf65a9111d8486b992c4e31ed9b277cfa377202e6ab80d3f68d547e844565`。多出来的是 `void import("./AuthorHelperMount.js").then((m)=>{m.mountAuthorHelpers()});`。`GridMount.js` raw 5685 → 5863（+178），gzip9 2397 → 2482（+85），sha256 `768bc0774febc1258e0e5047108ceeb44fc071181a67dd08624eeb2c0873d859`。格网槽多了作者节点的空位，默认是 null。新文件不进 vite 内容哈希：`AuthorHelperMount.js` raw 1647，gzip9 856，sha256 `549167261ad5202ae6a57691a0456ee8b4135655b11818ed6851369490612123`；`AuthorHelpers.js` raw 3157，gzip9 1329，sha256 `a693adaf017c83291be2a74ae0d7ed629b55c7972505647a629245fe08a3435b`。`index.html` raw 仍是 483，gzip9 342，与合前逐字节相同。`shellClipCompile-VG0zSRM.js` raw 仍是 3063，gzip9 1433。`shadowBake-BIDE4SL.js` 与 `index-DgSBdyaU.css` 文件名和字节都没变。`package.json` 与 `package-lock.json` 相对合前 main 无差异，0 个新依赖。产物里 0 个文件含 `ccapture`。全 dist 里字面量 `useHelper` 是 0 处（esbuild 压掉了标识符）。`directionalLightHelper` 与 `cameraHelper` 只出现在 `AuthorHelpers.js`。`AuthorHelperMount.js` 用 `import("./AuthorHelpers.js")` 再取 `LightCameraHelpers`，里面没有 `useHelper`、`directionalLightHelper`、`cameraHelper`。`AuthorHelpers.js` 用 `isRectAreaLight` 跳过矩形面光，没有 `RectAreaLightHelper`
- hardGate 文件里没有 `AuthorHelpers`、`AuthorHelperMount`、`useHelper`、dock、GridMount、DemandLoop、IntersectionObserver 离屏逻辑、frameSchedule、cameraRest、ClipCapture、AlarmAudioCue、shaderMaterial、PickBvh、structureEdges、structureArm、ShellWireframe。测量窗口（`__twinReady` 后再等 1500ms）也没有请求 AuthorHelperMount、AuthorHelpers、dock、GridMount
- 锁机 cutoff 是首帧 + 64ms。另一次冒烟把页面留到 `__twinReady` 之后 12000ms：均衡档 dock 在首帧后 2614ms，DemandLoop（`d-CacwR1f.js`）在 2617ms，frameSchedule 与 cameraRest 都在 2623ms，pickBvhHome、pickBvhTiming 与 shaderMaterial 都在 2624ms，ClipCapture、AlarmAudioCue、GridMount 与 AuthorHelperMount 都在 2669ms，PickBvhHost 在 2918ms，PickBvh 在 3185ms。同一次方法的补测里，minimap `mount` 在 2634ms，shortcuts `arm` 在 2634ms。性能档 dock 在 2617ms，DemandLoop 在 2622ms，frameSchedule 与 cameraRest 都在 2628ms，pickBvhHome、pickBvhTiming 与 shaderMaterial 都在 2629ms，ClipCapture、AlarmAudioCue 与 GridMount 都在 2645ms，AuthorHelperMount 在 2646ms，PickBvhHost 在 2872ms，PickBvh 在 3066ms。补测里性能档 mount 在 2632ms，arm 在 2633ms。两个档位都在 cutoff 之外。性能档没有请求 balancedFx。观众路径这两个档位在这 12s 里都没有请求 `AuthorHelpers.js`，也没有请求 GridAxes、structureEdges、structureArm、ShellWireframe、DemoPointEditor、reportShot、shareShot、floorGlb、GLTFExporter。首帧 + 64ms 之内的请求就是 hardGate 那一组（均衡档另加 balancedFx 与 hdr；性能档没有 balancedFx，也没有 `street-tree-hi.glb`）
- `__twinFirstPrefetchDone` 冒烟读到 `true`。AuthorHelperMount 与 dock 都在首帧 2600ms 之后，没有进首帧 + 64ms。观众路径 `__twinAuthorHelpers` 为 `on: false`、`mounted: false`、`kinds: []`
- `?q=balanced&demoEdit=1` 的同长度冒烟：`AuthorHelpers.js` 在首帧后 2686ms，`__twinAuthorHelpers.on` 与 `mounted` 都是 true，kinds 为 camera、hemisphere、directional、shadow。仍在 cutoff 之外。首帧 + 64ms 的请求里仍然没有 AuthorHelpers、AuthorHelperMount、useHelper。这次 `pageerror` 为 0，`console.error` 为 0
- 控制台冒烟：`window.__twinReady === true`，`pageerror` 为 0，`console.error` 为 0（均衡档与性能档各一次）。`preserveDrawingBuffer` 为 false（URL 没有 `keepDrawingBuffer=1`）

结论：**PASS**。

### hardGate 文件

| gzip9 | url |
| ---: | --- |
| 400118 | `/assets/index-B61QpNrQ.js` |
| 13577 | `/models/street-tree-hi.glb` |
| 5061 | `/models/roof-sign.glb` |
| 3666 | `/assets/index-DgSBdyaU.css` |
| 3466 | `/models/street-tree-lo.glb` |
| 3229 | `/models/east-grille-v4-lo.glb` |
| 2666 | `/models/street-lamp.glb` |
| 1709 | `/assets/shadowBake-BIDE4SL.js` |
| 1433 | `/assets/shellClipCompile-VG0zSRM.js` |
| 1055 | `/assets/EastGrille-DoxvHl8.js` |
| 342 | `/?q=balanced` |
