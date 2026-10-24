# D300 merge #71（T068 RectAreaLight）

| 项 | 值 |
| --- | --- |
| pre SHA | `233cf2d91f204bc1e8d79b6020d9ac948de563be` |
| merge SHA | `dfca298585b5b5f6aef518f4dc353240dad12fbc` |
| parents | `233cf2d91f204bc1e8d79b6020d9ac948de563be` `3594d9566e85020aeff2bf36da6cd6f5c45f718b` |
| PR head | `3594d9566e85020aeff2bf36da6cd6f5c45f718b` |
| hardGate | 436322（≤ 436361，余量 39）PASS |
| balancedFx | 104552（≤ 105000，余量 448）PASS |
| twinReady | true |
| pageerror | 0 |
| CloudAgent | `bc-ca5e90d9-18bb-5884-a701-aacab2281689` |

本文件按 `reviews/merge-d300-72.md` 的字段来写：合并前 SHA、merge SHA、parents、门禁数字、twinReady / pageerror、CloudAgent id。

## 合并

合并前 `origin/main` 是 `233cf2d91f204bc1e8d79b6020d9ac948de563be`。PR #71 的 `headRefOid` 是 `3594d9566e85020aeff2bf36da6cd6f5c45f718b`，`baseRefOid` 是 `233cf2d91f204bc1e8d79b6020d9ac948de563be`，tip 的唯一父提交也是 `233cf2d91f204bc1e8d79b6020d9ac948de563be`。合并前 `isDraft` 为 true，`state` 为 OPEN，`mergeable` 为 MERGEABLE，`mergeStateStatus` 为 CLEAN。草稿已标为 ready。没有改写这条 tip。

`gh pr merge` 没有 `--no-ff` 开关。用的是 merge commit 策略（不是 squash，不是 rebase），并锁了 `--match-head-commit 3594d9566e85020aeff2bf36da6cd6f5c45f718b`：

```
gh pr ready 71 --repo lenaelelle672-beep/uniview-twin
gh pr merge 71 --repo lenaelelle672-beep/uniview-twin --merge --match-head-commit 3594d9566e85020aeff2bf36da6cd6f5c45f718b
```

没有 force-push。GitHub [PR #71](https://github.com/lenaelelle672-beep/uniview-twin/pull/71) 状态是 **MERGED**，`mergeCommit` 是 `dfca298585b5b5f6aef518f4dc353240dad12fbc`（`mergedAt` 2026-10-24T05:43:07Z）。两个父提交是 `233cf2d91f204bc1e8d79b6020d9ac948de563be` 与 `3594d9566e85020aeff2bf36da6cd6f5c45f718b`。

门禁跑在 merge 提交上。本说明是紧随其后的一次提交，只加这个证据文件，不含产品代码，parent 是该 merge commit。只推 `main`。

## 门禁

`npm ci`，然后 `SHADER_PREWARM=false npm run build`。`scripts/measure-first-screen.mjs`，均衡档 1366×768，Python `gzip.compress(9)`。下面是合入后在 merge commit 上的实测。相对合前基线 436322 / 104552。脚本 `ok: true`，`failures` 为空。性能档总览没有请求 balancedFx。

- **hardGate 436322** ≤ 436361，余量 39，**PASS**（相对合前 main / PR #72 合并后基线 436322 / 104552 为 +0 / +0）
- **balancedFx 104552** ≤ 105000，余量 448，**PASS**
- 性能档总览没有请求 balancedFx（gzip 0）；性能档首屏 hardGate 口径 422745（合前 422745，同为 +0）。少掉的正是均衡档才拉的 `street-tree-hi.glb`（gzip9 13577）：436322 − 13577 = 422745
- 入口 `index-B61QpNrQ.js` raw 1413239，gzip9 400118，sha256 `ef2187abb11296b3414a57c986681e693b2bc2403c269b9fc224dfbcdca9ade4`。与合前同参构建逐字节相同，文件名也相同，哈希就是 `reviews/merge-d300-72.md` 记下的那一版。入口里 `DemandLoop`、`watchCanvasOffscreen`、`canvasOffscreen`、`useOffscreenPause`、`offscreenPause`、`isIntersecting`、`frameSchedule`、`AuthorHelper`、`useHelper`、`debugHelpers`、`RectAreaLightHelper`、`RectAreaLightUniformsLib`、`RectAreaMount`、`mountRectAreaLights`、`author-lights`、`__twinRectArea`、`LTC_MAT_1` 都是 0 处。`IntersectionObserver` 是 1 处，是 React 的 `setupIntersectionObserver`。`d-CacwR1f` 在入口里只有 1 处，是 `import("./d-CacwR1f.js")` 懒字符串。`scene-root` 是 3 处。`visibilitychange` 是 2 处。入口里原有的 three 着色器字面量还在：`struct RectAreaLight` 1 处，`isRectAreaLight` 3 处，`LTC_FLOAT_1` 1 处；文件哈希没变，这些字节合前就在
- `balancedFx-BeFs3r4.js` raw 246234，gzip9 104552，sha256 `942a82f21b7705afdb5f8f04ed197bc9b161361d736ef9a610c73d12b6d1b47f`。与合前同参构建逐字节相同。`d-CacwR1f.js` raw 10954，gzip9 3936，sha256 `c9b728ce10f7d15021a26367aa9cc62098481ac0a9be40113a1cbc4a193c2afd`，也与合前逐字节相同
- 相对合前 main 的同参构建，142 个产物里 141 个逐字节相同。内容变化只有 `dock-BXk4ePv.js`：文件名没变，raw 12201 → 12532（+331），gzip9 5112 → 5268（+156），sha256 `cab02b2828017304a2dacd9363ea5f470a2266b380af771463e67df2bf9cb1da`。多出来的 331 字节就是哈希定稿后接上的换行、`RECT_AREA_DOCK_BOOT`、再一个换行。这段先看 `demoEdit===1`，观众地址不 `import("./RectAreaMount.js")`。`GridMount.js`、`AuthorHelperMount.js`、`AuthorHelpers.js` 的文件名和字节都没变（sha256 仍是 `768bc0774febc1258e0e5047108ceeb44fc071181a67dd08624eeb2c0873d859`、`549167261ad5202ae6a57691a0456ee8b4135655b11818ed6851369490612123`、`a693adaf017c83291be2a74ae0d7ed629b55c7972505647a629245fe08a3435b`）。新文件不进 vite 内容哈希：`RectAreaMount.js` raw 3693，gzip9 1750，sha256 `7ebab554145b3e7389908a6954af28e2bc23c9e549648f4076d48afd8c06b9f7`；`RectAreaLive.js` raw 357340，gzip9 134307，sha256 `075659c644b2f1c2a349f9d7b336e62500112071aedc5978765c8343e0c72610`。`index.html` raw 仍是 483，gzip9 342，与合前逐字节相同。`shellClipCompile-VG0zSRM.js` raw 仍是 3063，gzip9 1433。`shadowBake-BIDE4SL.js` 与 `index-DgSBdyaU.css` 文件名和字节都没变。`package.json` 与 `package-lock.json` 相对合前 main 无差异，0 个新依赖。产物里 0 个文件含 `ccapture`。全 dist 里字面量 `useHelper` 是 0 处。`RectAreaLightHelper` 只出现在 `RectAreaMount.js`（2 处）和 `RectAreaLive.js`（1 处）。`RectAreaLightUniformsLib` 这个标识符在压缩后的 dist 里是 0 处；`RectAreaLive.js` 里 `LTC_FLOAT_1` 有 4 处，并且从 `./index-B61QpNrQ.js` 复用入口包。`LTC_MAT_1` 与 `author-lights` 在 dist 里都是 0 处
- hardGate 文件里没有 `RectAreaMount`、`RectAreaLive`、`RectAreaLightHelper`、`mountRectAreaLights`、dock、GridMount、AuthorHelperMount、AuthorHelpers、DemandLoop、IntersectionObserver 离屏逻辑、frameSchedule、cameraRest、ClipCapture、AlarmAudioCue、shaderMaterial、PickBvh、structureEdges、structureArm、ShellWireframe。测量窗口（`__twinReady` 后再等 1500ms）也没有请求这些块
- 锁机 cutoff 是首帧 + 64ms。另一次冒烟把页面留到 `__twinReady` 之后 12000ms：均衡档 dock 在首帧后 2614ms，DemandLoop（`d-CacwR1f.js`）在 2619ms，pickBvhHome、pickBvhTiming、frameSchedule 与 shaderMaterial 都在 2627ms，cameraRest 在 2629ms，ClipCapture、AlarmAudioCue、GridMount、AuthorHelperMount、minimap `mount` 与 shortcuts `arm` 都在 2658ms，PickBvhHost 在 2921ms，PickBvh 在 2928ms。性能档 dock 在 2613ms，DemandLoop 在 2621ms，frameSchedule 与 cameraRest 都在 2625ms，pickBvhHome、pickBvhTiming 与 shaderMaterial 都在 2632ms，AlarmAudioCue 在 2641ms，ClipCapture、GridMount、AuthorHelperMount、mount 与 arm 都在 2642ms，PickBvhHost 在 2868ms，PickBvh 在 3494ms。两个档位都在 cutoff 之外。性能档没有请求 balancedFx，也没有 `street-tree-hi.glb`。观众路径这两个档位在这 12s 里都没有请求 `RectAreaMount.js`、`RectAreaLive.js`、`AuthorHelpers.js`，也没有请求 GridAxes、structureEdges、structureArm、ShellWireframe、DemoPointEditor、reportShot、shareShot、floorGlb、GLTFExporter。首帧 + 64ms 之内的请求就是 hardGate 那一组（均衡档另加 balancedFx 与 hdr；性能档没有 balancedFx，也没有 `street-tree-hi.glb`）
- `__twinFirstPrefetchDone` 冒烟读到 `true`。dock、AuthorHelperMount 与 RectArea 相关请求都在首帧 2600ms 之后，没有进首帧 + 64ms。观众路径没有挂上 `__twinRectArea`（dock 引导没去 import 面光开关）。`__twinAuthorHelpers` 为 `on: false`、`mounted: false`、`kinds: []`
- `?q=balanced&demoEdit=1` 的同长度冒烟：`RectAreaMount.js` 在首帧后 2660ms，`AuthorHelpers.js` 在 2686ms。打开开关之前 `__twinRectArea` 为 `author: true`、`on: false`、`init: false`、`cap: 3`、`count: 0`、`ids: []`，`helper` 为 `RectAreaLightHelper`。这 12s 里没有请求 `RectAreaLive.js`。`__twinAuthorHelpers.on` 与 `mounted` 都是 true，kinds 为 camera、hemisphere、directional、shadow。点开面光按钮之后再等 8000ms：`RectAreaLive.js` 在首帧后 9576ms，`__twinRectArea` 变为 `on: true`、`init: true`、`count: 3`、`ids: ['overhead', 'east-fill', 'north-rim']`。第四盏 `spare` 没有挂上。仍在 cutoff 之外。首帧 + 64ms 的请求里仍然没有 RectAreaMount、RectAreaLive、AuthorHelpers、AuthorHelperMount。这次 `pageerror` 为 0，`console.error` 为 0
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
