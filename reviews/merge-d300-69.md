# D300 merge #69（T067 IntersectionObserver 离屏停泵）

| 项 | 值 |
| --- | --- |
| pre SHA | `e2830ce55b429de9d71326666aca55cc8ee1f683` |
| merge SHA | `efc9d598923df456c2c3603b2c0a045e0b93a4a4` |
| parents | `e2830ce55b429de9d71326666aca55cc8ee1f683` `e45b17ddff004a692699d1d06fd6ecf44d60abe8` |
| PR head | `e45b17ddff004a692699d1d06fd6ecf44d60abe8` |
| hardGate | 436322（≤ 436361，余量 39）PASS |
| balancedFx | 104552（≤ 105000，余量 448）PASS |
| twinReady | true |
| pageerror | 0 |
| CloudAgent | `bc-bb85f96a-2774-57d6-9ec4-e27fcec56b02` |

本文件按 `reviews/merge-d300-68.md` 的字段来写：合并前 SHA、merge SHA、parents、门禁数字、twinReady / pageerror、CloudAgent id。

## 合并

合并前 `origin/main` 是 `e2830ce55b429de9d71326666aca55cc8ee1f683`。PR #69 的 `headRefOid` 是 `e45b17ddff004a692699d1d06fd6ecf44d60abe8`，`baseRefOid` 是 `e2830ce55b429de9d71326666aca55cc8ee1f683`，tip 的唯一父提交也是 `e2830ce55b429de9d71326666aca55cc8ee1f683`。合并前 `isDraft` 为 true，`state` 为 OPEN，`mergeable` 为 MERGEABLE，`mergeStateStatus` 为 CLEAN。草稿已标为 ready。没有改写这条 tip。

`gh pr merge` 没有 `--no-ff` 开关。用的是 merge commit 策略（不是 squash，不是 rebase），并锁了 `--match-head-commit e45b17ddff004a692699d1d06fd6ecf44d60abe8`：

```
gh pr ready 69 --repo lenaelelle672-beep/uniview-twin
gh pr merge 69 --repo lenaelelle672-beep/uniview-twin --merge --match-head-commit e45b17ddff004a692699d1d06fd6ecf44d60abe8
```

没有 force-push。GitHub [PR #69](https://github.com/lenaelelle672-beep/uniview-twin/pull/69) 状态是 **MERGED**，`mergeCommit` 是 `efc9d598923df456c2c3603b2c0a045e0b93a4a4`（`mergedAt` 2026-10-24T04:20:49Z）。两个父提交是 `e2830ce55b429de9d71326666aca55cc8ee1f683` 与 `e45b17ddff004a692699d1d06fd6ecf44d60abe8`。

门禁跑在 merge 提交上。本说明是紧随其后的一次提交，只加这个证据文件，不含产品代码，parent 是该 merge commit。只推 `main`。

## 门禁

`npm ci`，然后 `SHADER_PREWARM=false npm run build`。`scripts/measure-first-screen.mjs`，均衡档 1366×768，Python `gzip.compress(9)`。下面是合入后在 merge commit 上的实测。相对合前基线 436321 / 104552。脚本 `ok: true`，`failures` 为空。性能档总览没有请求 balancedFx。

- **hardGate 436322** ≤ 436361，余量 39，**PASS**（相对合前 main / PR #66 合并后基线 436321 / 104552 为 +1 / 0）
- **balancedFx 104552** ≤ 105000，余量 448，**PASS**
- 性能档总览没有请求 balancedFx（gzip 0）；性能档首屏 hardGate 口径 422745（合前 422744，同为 +1）。少掉的正是均衡档才拉的 `street-tree-hi.glb`（gzip9 13577）：436322 − 13577 = 422745
- 入口 `index-B61QpNrQ.js` raw 1413239，gzip9 400118，sha256 `ef2187abb11296b3414a57c986681e693b2bc2403c269b9fc224dfbcdca9ade4`。合前同参构建是 `index-Dz8VanOr.js`，raw 同样 1413239，gzip9 400119，sha256 `8213aca39fba396ba2d22794defa407aa3111f8ec1614d17352d61ca1f7c62e1`。把两边内容哈希文件名都归一之后，入口逐字相同。gzip 差 1 来自懒说明符 `d-D7P3zsV.js` → `d-CacwR1f.js` 的哈希字节。入口里 `DemandLoop`、`watchCanvasOffscreen`、`canvasOffscreen`、`useOffscreenPause`、`offscreenPause`、`isIntersecting`、`frameSchedule` 都是 0 处。`IntersectionObserver` 两边都是 1 处，是 React 的 `setupIntersectionObserver`，不是这条离屏观察器。`d-CacwR1f` 在入口里只有 1 处，是 `import("./d-CacwR1f.js")` 懒字符串。`scene-root` 两边都是 3 处。`visibilitychange` 两边都是 2 处
- `balancedFx-BeFs3r4.js` raw 246234，gzip9 104552，sha256 `942a82f21b7705afdb5f8f04ed197bc9b161361d736ef9a610c73d12b6d1b47f`。合前 `balancedFx-DT5iqJk.js` raw 同样 246234，gzip9 同样 104552，sha256 `7e7b75c12a10f4065e57cc48b0de67ac6e3027fea0a85e10766dd47da982b2d5`。内容哈希归一后两份 balancedFx 逐字相同，sha256 差在下游块文件名里的哈希字节
- 相对合前 main 的同参构建，按文件名里的内容哈希归一后，唯一内容变化是 `assets/d-CacwR1f.js`（DemandLoop，raw 9619 → 10954，gzip9 3411 → 3936，sha256 `c9b728ce10f7d15021a26367aa9cc62098481ac0a9be40113a1cbc4a193c2afd`；合前 `d-D7P3zsV.js` sha256 `0a060fcc5eba3b5a71c6f1e3c38a9a4e595bf275588bba44a1ff9b4c68eef6af`）。归一后正文多 1335 字节。T067 的 `IntersectionObserver`、`isIntersecting` 和 `.scene-root` 只出现在这块里（合前这块三者都是 0）。没有单独的 offscreen 产物。其余产物（含 dock、shellClipCompile、EastGrille、shadowBake、balancedFx、入口）归一后逐字相同。`shellClipCompile` raw 仍是 3063，gzip9 1434 → 1433；`/?q=balanced` 的 HTML raw 仍是 483，gzip9 339 → 342（script src 从 `index-Dz8VanOr.js` 换成 `index-B61QpNrQ.js`）。−1 −1 +3 = hardGate 净 +1。`shadowBake-BIDE4SL.js` 与 `index-DgSBdyaU.css` 文件名和字节都没变。`package.json` 与 `package-lock.json` 相对合前 main 无差异。产物里 0 个文件含 `ccapture`
- hardGate 文件里没有 `d-CacwR1f`、DemandLoop、IntersectionObserver 离屏逻辑、dock、frameSchedule、cameraRest、ClipCapture、AlarmAudioCue、GridMount、GridAxes、shaderMaterial、PickBvh、structureEdges、structureArm、ShellWireframe。测量窗口（`__twinReady` 后再等 1500ms）也没有请求 DemandLoop 这块
- 锁机 cutoff 是首帧 + 64ms。另一次冒烟把页面留到 `__twinReady` 之后 12000ms：均衡档 dock 在首帧后 2607ms，DemandLoop（`d-CacwR1f.js`，离屏停泵打在这块里）在 2625ms，frameSchedule 在 2653ms，cameraRest 在 2654ms，pickBvhHome、pickBvhTiming 与 shaderMaterial 都在 2654ms，ClipCapture、AlarmAudioCue 与 GridMount 都在 2670ms，minimap `mount` 在 2672ms，shortcuts `arm` 在 2673ms，PickBvhHost 在 2925ms，PickBvh 在 2938ms。性能档 dock 在 2605ms，DemandLoop 在 2608ms，frameSchedule 与 cameraRest 都在 2616ms，pickBvhHome 与 pickBvhTiming 与 shaderMaterial 都在 2617ms，ClipCapture、AlarmAudioCue 与 GridMount 都在 2642ms，mount 与 arm 都在 2642ms，PickBvhHost 在 2827ms，PickBvh 在 2832ms。两个档位都在 cutoff 之外。性能档没有请求 balancedFx。两个档位在这 12s 里都没有单独请求 offscreen 块，也没有请求 GridAxes、structureEdges、structureArm、ShellWireframe、DemoPointEditor、reportShot、shareShot、floorGlb、GLTFExporter。首帧 + 64ms 之内的请求就是 hardGate 那一组（均衡档另加 balancedFx 与 hdr；性能档没有 balancedFx，也没有 `street-tree-hi.glb`）
- `__twinFirstPrefetchDone` 冒烟读到 `true`。dock 与 DemandLoop 都在首帧 2600ms 之后，没有进首帧 + 64ms
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
