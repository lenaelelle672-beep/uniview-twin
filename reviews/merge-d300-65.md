# D300 merge #65（T062 MediaRecorder lazy ClipCapture）

| 项 | 值 |
| --- | --- |
| pre SHA | `be8303022a4733060f77ebb1cc83897d20b94aa8` |
| merge SHA | `d181e2bf20e08cc75bbb467b80875127e571f531` |
| parents | `be8303022a4733060f77ebb1cc83897d20b94aa8` `941a2eabd2c902197073978c66461b18550f3171` |
| PR head | `941a2eabd2c902197073978c66461b18550f3171` |
| hardGate | 436326（≤ 436361，余量 35）PASS |
| balancedFx | 104552（≤ 105000，余量 448）PASS |
| twinReady | true |
| pageerror | 0 |
| CloudAgent | `bc-dd7a65e1-d70a-5835-8c7d-2a159e463502` |

本文件按 `reviews/merge-d300-61.md` 的字段来写：合并前 SHA、merge SHA、parents、门禁数字、twinReady / pageerror、CloudAgent id。

## 合并

合并前 `origin/main` 是 `be8303022a4733060f77ebb1cc83897d20b94aa8`。PR #65 的 `headRefOid` 是 `941a2eabd2c902197073978c66461b18550f3171`，`baseRefOid` 是 `be8303022a4733060f77ebb1cc83897d20b94aa8`，tip 的唯一父提交也是 `be8303022a4733060f77ebb1cc83897d20b94aa8`。`mergeable` 为 MERGEABLE，`mergeStateStatus` 为 CLEAN。草稿已标为 ready。没有改写这条 tip。

`gh pr merge` 没有 `--no-ff` 开关。用的是 merge commit 策略（不是 squash，不是 rebase），并锁了 `--match-head-commit 941a2eabd2c902197073978c66461b18550f3171`：

```
gh pr ready 65 --repo lenaelelle672-beep/uniview-twin
gh pr merge 65 --repo lenaelelle672-beep/uniview-twin --merge --match-head-commit 941a2eabd2c902197073978c66461b18550f3171
```

没有 force-push。GitHub [PR #65](https://github.com/lenaelelle672-beep/uniview-twin/pull/65) 状态是 **MERGED**，`mergeCommit` 是 `d181e2bf20e08cc75bbb467b80875127e571f531`（`mergedAt` 2026-10-23T12:46:27Z）。两个父提交是 `be8303022a4733060f77ebb1cc83897d20b94aa8` 与 `941a2eabd2c902197073978c66461b18550f3171`。

门禁跑在 merge 提交上。本说明是紧随其后的一次提交，只加这个证据文件，不含产品代码，parent 是该 merge commit。只推 `main`。

## 门禁

`npm ci`，然后 `SHADER_PREWARM=false npm run build`。`scripts/measure-first-screen.mjs`，均衡档 1366×768，Python `gzip.compress(9)`。下面是合入后在 merge commit 上的实测。相对合前基线 436326 / 104552。

- **hardGate 436326** ≤ 436361，余量 35，**PASS**（与合前 main / PR #61 合并后基线 436326 / 104552 相同，0 / 0。early index 与合前 main 的生产构建逐字节相同）
- **balancedFx 104552** ≤ 105000，余量 448，**PASS**
- 性能档总览没有请求 balancedFx（gzip 0）；性能档首屏 hardGate 口径 422749
- 入口 `index-DmZaOa7W.js` raw 1413230，gzip9 400121，sha256 `c7cba07b1f065f9cc2f95a18c4167b0288de63632b471a3a97f5ac888b37d766`。与合前 `be830302` 记录的 `SHADER_PREWARM=false` 构建逐字节相同，文件名也相同
- `balancedFx-RF8BS8G.js` raw 246234，gzip9 104552
- 相对合前 main 的同参构建，产物只多 `assets/ClipCapture.js`（raw 5488，gzip9 2311）。`dock-BRS_ZLo.js` 文件名未变；合前 raw 9557，合后 raw 9625，多出来的 68 字节就是一行 `import("./ClipCapture.js")`。其余同名资源逐字节相同。early index 里没有 `ClipCapture`、`MediaRecorder`、`mountClipCapture`、`uniview-clip`、`viewmark-clip`、`captureStream`、`ccapture` 字面量
- `package.json` 与 `package-lock.json` 相对合前 main 无差异。产物里 0 个文件含 `ccapture`。网络请求里也没有 ccapture
- hardGate 文件里没有 ClipCapture、MediaRecorder、AlarmAudioCue、DemandLoop、BalancedSoftShadows、cameraRest、frameSchedule、dock，也没有 minimap `mount`、shortcuts `arm`、DemoPointEditor、TransformControls、PickBvh、three-mesh-bvh、reportShot、shareShot、floorGlb、GLTFExporter。测量窗口（`__twinReady` 后再等 1500ms）也没有请求这几块。`shellClipCompile-DbEfLHH.js` 是合前就在门禁里的壳层编译包，不是 ClipCapture
- 锁机 cutoff 是首帧 + 64ms。另一次冒烟把页面留到首帧后约 12.0s（均衡）/ 10.9s（性能）：均衡档 dock 在首帧后 2614ms，DemandLoop（`d-D8Ud1C7.js`）与 BalancedSoftShadows 都在 2617ms，frameSchedule 与 cameraRest 都在 2624ms，pickBvhHome 与 pickBvhTiming 都在 2626ms，ClipCapture 与 AlarmAudioCue 都在 2670ms，minimap `mount` 与 shortcuts `arm` 都在 2671ms，PickBvhHost 在 2918ms，PickBvh 在 2925ms，都在 cutoff 之外。性能档 dock 在首帧后 2604ms，DemandLoop 在 2607ms，frameSchedule 与 cameraRest 都在 2615ms，pickBvhHome 与 pickBvhTiming 都在 2617ms，ClipCapture、AlarmAudioCue 与 minimap `mount`、shortcuts `arm` 都在 2642ms，PickBvhHost 在 2889ms，PickBvh 在 3078ms；性能档没有请求 SoftShadows。两个档位都没有请求 DemoPointEditor / TransformControls，也没有单独请求 three-mesh-bvh（包围树打进 `PickBvh-SgN9-48.js`），也没有请求 reportShot / shareShot / floorGlb / GLTFExporter。`preserveDrawingBuffer` 为 false（URL 没有 `keepDrawingBuffer=1`）
- dock 没有抢走 firstPrefetch。`__twinFirstPrefetchDone` 仍由 textRuntime 落下。均衡档 floor shell 与 dock、floorDecor 同在首帧后 2614ms，textRuntime 与 BlueprintView 在 2615ms；性能档 dock、floorDecor、textRuntime、BlueprintView 都在 2604ms。firstPrefetch 资源是 `floorDecor-DVz82mG.js`，不是 dock。ClipCapture 跟在 dock 求值之后（均衡 2670ms / 性能 2642ms），没有提前进首帧 + 64ms
- 控制台冒烟：`window.__twinReady === true`，`pageerror` 为 0，`console.error` 为 0（均衡档与性能档各一次）
- `vitest run`：94 个文件、507 项通过。其中 `src/capture/clipCapture.test.ts` 13 项通过

结论：**PASS**。

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
