# D300 merge #63（T055 Bvh 拾取加速）

| 项 | 值 |
| --- | --- |
| pre SHA | `17fb8ddd3d24247336ac977053fa841bfe8aaea4` |
| merge SHA | `9783e0c8bdd35c8c2578b0fffc2ee8eee687de4a` |
| parents | `17fb8ddd3d24247336ac977053fa841bfe8aaea4` `3d89bce485c2ffdff486e35ba715424f3a18b0b7` |
| PR head | `3d89bce485c2ffdff486e35ba715424f3a18b0b7` |
| hardGate | 436357（≤ 436361，余量 4）PASS |
| balancedFx | 104552（≤ 105000，余量 448）PASS |
| twinReady | true |
| pageerror | 0 |
| CloudAgent | `bc-980beac9-8a18-5d8f-8581-7f18da0549ff` |

本文件按 `reviews/merge-d300-59.md` 的字段来写：合并前 SHA、merge SHA、parents、门禁数字、twinReady / pageerror、CloudAgent id。

## 合并

合并前 `origin/main` 与 `origin/integration` 都是 `17fb8ddd3d24247336ac977053fa841bfe8aaea4`。PR #63 的 `headRefOid` 是 `3d89bce485c2ffdff486e35ba715424f3a18b0b7`，`mergeable` 为 MERGEABLE，`mergeStateStatus` 为 CLEAN。草稿已标为 ready。没有改写这条 tip。

`gh pr merge` 没有 `--no-ff` 开关。用的是 merge commit 策略（不是 squash，不是 rebase），并锁了 `--match-head-commit 3d89bce485c2ffdff486e35ba715424f3a18b0b7`：

```
gh pr ready 63 --repo lenaelelle672-beep/uniview-twin
gh pr merge 63 --repo lenaelelle672-beep/uniview-twin --merge --match-head-commit 3d89bce485c2ffdff486e35ba715424f3a18b0b7
```

没有 force-push。GitHub [PR #63](https://github.com/lenaelelle672-beep/uniview-twin/pull/63) 状态是 **MERGED**，`mergeCommit` 是 `9783e0c8bdd35c8c2578b0fffc2ee8eee687de4a`（`mergedAt` 2026-10-23T08:26:04Z）。两个父提交是 `17fb8ddd3d24247336ac977053fa841bfe8aaea4` 与 `3d89bce485c2ffdff486e35ba715424f3a18b0b7`。合并后 `integration` 从 `17fb8ddd3d24247336ac977053fa841bfe8aaea4` 快进到该 merge commit，与当时的 `main` 相同。

门禁跑在 merge 提交上。本说明是紧随其后的一次提交，只加这个证据文件，不含产品代码。`main` 与 `integration` 一起快进到该说明提交，两条引用保持相同。

## 门禁

`npm ci`，然后 `SHADER_PREWARM=false npm run build`。`scripts/measure-first-screen.mjs`，均衡档 1366×768，Python `gzip.compress(9)`。PR 正文自称 hardGate 436357 / balancedFx 104552；下面是合入后在 merge commit 上的实测。

- **hardGate 436357** ≤ 436361，余量 4，**PASS**（相对 PR #59 合并后 main 基线 436359 / 104552，−2 / 0。增量来自入口 gzip +1、`shellClipCompile` −1、`EastGrille` −1、文档 `/?q=balanced` −1）
- **balancedFx 104552** ≤ 105000，余量 448，**PASS**
- 性能档总览没有请求 balancedFx（gzip 0）；性能档首屏 hardGate 口径 422780
- 入口 `index-BUAiOOnt.js` raw 1413274，gzip9 400154
- `balancedFx-DcpoL-SD.js` raw 246234，gzip9 104552
- hardGate 文件里没有 PickBvh、three-mesh-bvh、reportShot、shareShot、floorGlb、GLTFExporter、SoftShadows、DemandLoop、cameraRest、frameSchedule、dock。测量窗口（`__twinReady` 后再等 1500ms）也没有请求这几块
- 锁机 cutoff 是首帧 + 64ms。另一次冒烟把页面留到首帧后约 6.3s（均衡）/ 6.2s（性能）：均衡档 dock 在首帧后 2615ms，DemandLoop 与 BalancedSoftShadows 都在 2620ms，frameSchedule、cameraRest、pickBvhHome、pickBvhTiming 都在 2628ms，PickBvhHost 在 2925ms，PickBvh 在 3209ms，都在 cutoff 之外。性能档 dock 在首帧后 2610ms，DemandLoop 在 2613ms，pickBvhHome、pickBvhTiming、frameSchedule、cameraRest 都在 2631ms，PickBvhHost 在 2915ms，PickBvh 在 3142ms；性能档没有请求 SoftShadows。两个档位都没有单独请求 three-mesh-bvh（包围树打进 `PickBvh-Dne4xmBD.js`），也没有请求 reportShot / shareShot / floorGlb / GLTFExporter。`preserveDrawingBuffer` 为 false（URL 没有 `keepDrawingBuffer=1`）
- 控制台冒烟：`window.__twinReady === true`，`pageerror` 为 0（均衡档与性能档各一次）
- `src/scene/pick/pickBvh.test.ts` 9 项通过

### hardGate 文件

| gzip9 | url |
| ---: | --- |
| 400154 | `/assets/index-BUAiOOnt.js` |
| 13577 | `/models/street-tree-hi.glb` |
| 5061 | `/models/roof-sign.glb` |
| 3666 | `/assets/index-DgSBdyaU.css` |
| 3466 | `/models/street-tree-lo.glb` |
| 3229 | `/models/east-grille-v4-lo.glb` |
| 2666 | `/models/street-lamp.glb` |
| 1709 | `/assets/shadowBake-BIDE4SLl.js` |
| 1435 | `/assets/shellClipCompile-CuptXHMu.js` |
| 1054 | `/assets/EastGrille-DRROiPr4.js` |
| 340 | `/?q=balanced` |
