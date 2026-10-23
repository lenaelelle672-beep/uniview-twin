# D300 merge #61（T054 告警音频 lazy AlarmAudioCue）

| 项 | 值 |
| --- | --- |
| pre SHA | `54ed4eefbc96d0d4ed4a42e4a413c19af58662ef` |
| merge SHA | `08025747551e29131736017dd7c3fcaaf570b654` |
| parents | `54ed4eefbc96d0d4ed4a42e4a413c19af58662ef` `d1c6a226cc9829267297f0975f39f56afa7b427a` |
| PR head | `d1c6a226cc9829267297f0975f39f56afa7b427a` |
| hardGate | 436326（≤ 436361，余量 35）PASS |
| balancedFx | 104552（≤ 105000，余量 448）PASS |
| twinReady | true |
| pageerror | 0 |
| CloudAgent | `bc-6f811934-5b23-5eb8-9169-46939e1862e6` |

本文件按 `reviews/merge-d300-62.md` 的字段来写：合并前 SHA、merge SHA、parents、门禁数字、twinReady / pageerror、CloudAgent id。

## 合并

合并前 `origin/main` 与 `origin/integration` 都是 `54ed4eefbc96d0d4ed4a42e4a413c19af58662ef`。PR #61 的 `headRefOid` 是 `d1c6a226cc9829267297f0975f39f56afa7b427a`，`baseRefOid` 是 `54ed4eefbc96d0d4ed4a42e4a413c19af58662ef`，`mergeable` 为 MERGEABLE，`mergeStateStatus` 为 CLEAN。草稿已标为 ready。没有改写这条 tip。

`gh pr merge` 没有 `--no-ff` 开关。用的是 merge commit 策略（不是 squash，不是 rebase），并锁了 `--match-head-commit d1c6a226cc9829267297f0975f39f56afa7b427a`：

```
gh pr ready 61 --repo lenaelelle672-beep/uniview-twin
gh pr merge 61 --repo lenaelelle672-beep/uniview-twin --merge --match-head-commit d1c6a226cc9829267297f0975f39f56afa7b427a
```

没有 force-push。GitHub [PR #61](https://github.com/lenaelelle672-beep/uniview-twin/pull/61) 状态是 **MERGED**，`mergeCommit` 是 `08025747551e29131736017dd7c3fcaaf570b654`（`mergedAt` 2026-10-23T10:46:23Z）。两个父提交是 `54ed4eefbc96d0d4ed4a42e4a413c19af58662ef` 与 `d1c6a226cc9829267297f0975f39f56afa7b427a`。合并后 `integration` 从 `54ed4eefbc96d0d4ed4a42e4a413c19af58662ef` 快进到该 merge commit，与当时的 `main` 相同。

门禁跑在 merge 提交上。本说明是紧随其后的一次提交，只加这个证据文件，不含产品代码。`main` 与 `integration` 一起快进到该说明提交，两条引用保持相同。

## 门禁

`npm ci`，然后 `SHADER_PREWARM=false npm run build`。`scripts/measure-first-screen.mjs`，均衡档 1366×768，Python `gzip.compress(9)`。下面是合入后在 merge commit 上的实测。Cloud HG 数字以这次合口为准。

- **hardGate 436326** ≤ 436361，余量 35，**PASS**（与合前 main / PR #62 合并后基线 436326 / 104552 相同，0 / 0。early index 与合前 main 的生产构建逐字节相同）
- **balancedFx 104552** ≤ 105000，余量 448，**PASS**
- 性能档总览没有请求 balancedFx（gzip 0）；性能档首屏 hardGate 口径 422749
- 入口 `index-DmZaOa7W.js` raw 1413230，gzip9 400121，sha256 `c7cba07b1f065f9cc2f95a18c4167b0288de63632b471a3a97f5ac888b37d766`。与合前 `54ed4eef` 的 `SHADER_PREWARM=false` 构建逐字节相同，文件名也相同
- `balancedFx-RF8BS8G.js` raw 246234，gzip9 104552
- 相对合前 main，产物只多 `assets/AlarmAudioCue.js`（raw 5183）。`dock-BRS_ZLo.js` 文件名未变；内容是合前 dock 再接一行 `import("./AlarmAudioCue.js")`。其余 75 个同名资源逐字节相同。early index 里没有 `AlarmAudioCue` 字面量
- hardGate 文件里没有 AlarmAudioCue、DemandLoop、BalancedSoftShadows、cameraRest、frameSchedule、dock，也没有 DemoPointEditor、TransformControls、PickBvh、three-mesh-bvh、reportShot、shareShot、floorGlb、GLTFExporter。测量窗口（`__twinReady` 后再等 1500ms）也没有请求这几块
- 锁机 cutoff 是首帧 + 64ms。另一次冒烟把页面留到首帧后约 7.6s（均衡）/ 7.6s（性能）：均衡档 dock 在首帧后 2606ms，DemandLoop（`d-D8Ud1C7.js`）在 2610ms，BalancedSoftShadows 在 2611ms，frameSchedule 在 2620ms，cameraRest 在 2621ms，AlarmAudioCue 在 2635ms，pickBvhHome 与 pickBvhTiming 都在 2627ms，PickBvhHost 在 2911ms，PickBvh 在 4141ms，都在 cutoff 之外。性能档 dock 在首帧后 2616ms，DemandLoop 在 2620ms，pickBvhHome、pickBvhTiming、frameSchedule、cameraRest 都在 2629ms，AlarmAudioCue 在 2637ms，PickBvhHost 在 2842ms，PickBvh 在 2851ms；性能档没有请求 SoftShadows。两个档位都没有请求 DemoPointEditor / TransformControls，也没有单独请求 three-mesh-bvh（包围树打进 `PickBvh-SgN9-48.js`），也没有请求 reportShot / shareShot / floorGlb / GLTFExporter。`preserveDrawingBuffer` 为 false（URL 没有 `keepDrawingBuffer=1`）
- 控制台冒烟：`window.__twinReady === true`，`pageerror` 为 0（均衡档与性能档各一次）
- `src/audio/alarmAudioCue.test.ts` 10 项通过

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
