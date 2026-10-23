# D300 merge #62（T058 TransformControls DEMO）

| 项 | 值 |
| --- | --- |
| pre SHA | `f1a66497c8f9723502fee5c80cdabce9f96a01f1` |
| merge SHA | `faa1a73ba0a04dfbe095cda30a9b4e67c7910290` |
| parents | `f1a66497c8f9723502fee5c80cdabce9f96a01f1` `a387de0882def67e77e8a2a9e5759d52573890dc` |
| PR head | `a387de0882def67e77e8a2a9e5759d52573890dc` |
| hardGate | 436326（≤ 436361，余量 35）PASS |
| balancedFx | 104552（≤ 105000，余量 448）PASS |
| twinReady | true |
| pageerror | 0 |
| CloudAgent | `bc-9450ce1e-1f67-576f-989b-3ae1c7600bee` |

本文件按 `reviews/merge-d300-63.md` 的字段来写：合并前 SHA、merge SHA、parents、门禁数字、twinReady / pageerror、CloudAgent id。

## 合并

合并前 `origin/main` 与 `origin/integration` 都是 `f1a66497c8f9723502fee5c80cdabce9f96a01f1`。PR #62 的 `headRefOid` 是 `a387de0882def67e77e8a2a9e5759d52573890dc`，`baseRefOid` 是 `f1a66497c8f9723502fee5c80cdabce9f96a01f1`，`mergeable` 为 MERGEABLE，`mergeStateStatus` 为 CLEAN。草稿已标为 ready。没有改写这条 tip。

`gh pr merge` 没有 `--no-ff` 开关。用的是 merge commit 策略（不是 squash，不是 rebase），并锁了 `--match-head-commit a387de0882def67e77e8a2a9e5759d52573890dc`：

```
gh pr ready 62 --repo lenaelelle672-beep/uniview-twin
gh pr merge 62 --repo lenaelelle672-beep/uniview-twin --merge --match-head-commit a387de0882def67e77e8a2a9e5759d52573890dc
```

没有 force-push。GitHub [PR #62](https://github.com/lenaelelle672-beep/uniview-twin/pull/62) 状态是 **MERGED**，`mergeCommit` 是 `faa1a73ba0a04dfbe095cda30a9b4e67c7910290`（`mergedAt` 2026-10-23T09:46:12Z）。两个父提交是 `f1a66497c8f9723502fee5c80cdabce9f96a01f1` 与 `a387de0882def67e77e8a2a9e5759d52573890dc`。合并后 `integration` 从 `f1a66497c8f9723502fee5c80cdabce9f96a01f1` 快进到该 merge commit，与当时的 `main` 相同。

门禁跑在 merge 提交上。本说明是紧随其后的一次提交，只加这个证据文件，不含产品代码。`main` 与 `integration` 一起快进到该说明提交，两条引用保持相同。

## 门禁

`npm ci`，然后 `SHADER_PREWARM=false npm run build`。`scripts/measure-first-screen.mjs`，均衡档 1366×768，Python `gzip.compress(9)`。下面是合入后在 merge commit 上的实测。

- **hardGate 436326** ≤ 436361，余量 35，**PASS**（相对 PR #63 合并后 main 基线 436357 / 104552，−31 / 0。增量来自入口 gzip −33、`EastGrille` +1、文档 `/?q=balanced` +1）
- **balancedFx 104552** ≤ 105000，余量 448，**PASS**
- 性能档总览没有请求 balancedFx（gzip 0）；性能档首屏 hardGate 口径 422749
- 入口 `index-DmZaOa7W.js` raw 1413230，gzip9 400121
- `balancedFx-RF8BS8G.js` raw 246234，gzip9 104552
- hardGate 文件里没有 DemoPointEditor、TransformControls、DemandLoop、BalancedSoftShadows、cameraRest、frameSchedule、dock，也没有 PickBvh、three-mesh-bvh、reportShot、shareShot、floorGlb、GLTFExporter。测量窗口（`__twinReady` 后再等 1500ms）也没有请求这几块。TransformControls 打进 `DemoPointEditor-DTY-Dr2.js`，入口包里没有 `DemoPointEditor` / `TransformControls` 字面量
- 锁机 cutoff 是首帧 + 64ms。另一次冒烟把页面留到首帧后约 7.6s（均衡）/ 6.8s（性能）：均衡档 dock 在首帧后 2617ms，DemandLoop（`d-D8Ud1C7.js`）与 BalancedSoftShadows 都在 2623ms，frameSchedule 与 cameraRest 都在 2637ms，pickBvhHome 与 pickBvhTiming 都在 2640ms，PickBvhHost 在 2923ms，PickBvh 在 3354ms，都在 cutoff 之外。性能档 dock 在首帧后 2614ms，DemandLoop 在 2619ms，pickBvhHome 在 2637ms，pickBvhTiming 与 frameSchedule 都在 2638ms，cameraRest 在 2640ms，PickBvhHost 在 2880ms，PickBvh 在 3076ms；性能档没有请求 SoftShadows。两个档位都没有请求 DemoPointEditor / TransformControls，也没有单独请求 three-mesh-bvh（包围树打进 `PickBvh-SgN9-48.js`），也没有请求 reportShot / shareShot / floorGlb / GLTFExporter。`preserveDrawingBuffer` 为 false（URL 没有 `keepDrawingBuffer=1`）
- 控制台冒烟：`window.__twinReady === true`，`pageerror` 为 0（均衡档与性能档各一次）
- `src/demo-edit/demoEdit.test.ts` 5 项通过

### hardGate 文件

| gzip9 | url |
| ---: | --- |
| 400121 | `/assets/index-DmZaOa7W.js` |
| 13577 | `/models/street-tree-hi.glb` |
| 5061 | `/models/roof-sign.glb` |
| 3666 | `/assets/index-DgSBdyaU.css` |
| 3466 | `/models/street-tree-lo.glb` |
| 3229 | `/models/east-grille-v4-lo.glb` |
| 2666 | `/models/street-lamp.glb` |
| 1709 | `/assets/shadowBake-BIDE4SL.js` |
| 1435 | `/assets/shellClipCompile-DbEfLHH.js` |
| 1055 | `/assets/EastGrille-5mqTVt4.js` |
| 341 | `/?q=balanced` |
