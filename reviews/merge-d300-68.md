# D300 merge #68（T060 Edges 结构线框 lazy）

| 项 | 值 |
| --- | --- |
| pre SHA | `25f8159d75dc0dbdcd7db8241c356dff302df173` |
| merge SHA | `a3887d97d1fdb28bbd9f4ce766096c63014ece91` |
| parents | `25f8159d75dc0dbdcd7db8241c356dff302df173` `64e212b83d66629a4eb791ac25dd6095015b3b78` |
| PR head | `64e212b83d66629a4eb791ac25dd6095015b3b78` |
| hardGate | 436322（≤ 436361，余量 39）PASS |
| balancedFx | 104552（≤ 105000，余量 448）PASS |
| twinReady | true |
| pageerror | 0 |
| CloudAgent | `bc-65bbb3b6-d0e8-5b26-9abf-999e20e7ac3c` |

本文件按 `reviews/merge-d300-67.md` 的字段来写：合并前 SHA、merge SHA、parents、门禁数字、twinReady / pageerror、CloudAgent id。

## 合并

合并前 `origin/main` 是 `25f8159d75dc0dbdcd7db8241c356dff302df173`。PR #68 的 `headRefOid` 是 `64e212b83d66629a4eb791ac25dd6095015b3b78`，`baseRefOid` 是 `25f8159d75dc0dbdcd7db8241c356dff302df173`，tip 的唯一父提交也是 `25f8159d75dc0dbdcd7db8241c356dff302df173`。`mergeable` 为 MERGEABLE，`mergeStateStatus` 为 CLEAN。草稿已标为 ready。没有改写这条 tip。

`gh pr merge` 没有 `--no-ff` 开关。用的是 merge commit 策略（不是 squash，不是 rebase），并锁了 `--match-head-commit 64e212b83d66629a4eb791ac25dd6095015b3b78`：

```
gh pr ready 68 --repo lenaelelle672-beep/uniview-twin
gh pr merge 68 --repo lenaelelle672-beep/uniview-twin --merge --match-head-commit 64e212b83d66629a4eb791ac25dd6095015b3b78
```

没有 force-push。GitHub [PR #68](https://github.com/lenaelelle672-beep/uniview-twin/pull/68) 状态是 **MERGED**，`mergeCommit` 是 `a3887d97d1fdb28bbd9f4ce766096c63014ece91`（`mergedAt` 2026-10-23T14:27:15Z）。两个父提交是 `25f8159d75dc0dbdcd7db8241c356dff302df173` 与 `64e212b83d66629a4eb791ac25dd6095015b3b78`。

门禁跑在 merge 提交上。本说明是紧随其后的一次提交，只加这个证据文件，不含产品代码，parent 是该 merge commit。只推 `main`。

## 门禁

`npm ci`，然后 `SHADER_PREWARM=false npm run build`。`scripts/measure-first-screen.mjs`，均衡档 1366×768，Python `gzip.compress(9)`。下面是合入后在 merge commit 上的实测。相对合前基线 436324 / 104553。脚本 `ok: true`，`failures` 为空。性能档总览没有请求 balancedFx。

- **hardGate 436322** ≤ 436361，余量 39，**PASS**（相对合前 main / PR #67 合并后基线 436324 / 104553 为 −2 / −1。early index 的 raw 1413230 → 1413239，gzip9 400121 → 400117）
- **balancedFx 104552** ≤ 105000，余量 448，**PASS**
- 性能档总览没有请求 balancedFx（gzip 0）；性能档首屏 hardGate 口径 422745（合前 422747，同为 −2）。少掉的正是均衡档才拉的 `street-tree-hi.glb`（gzip9 13577）：436322 − 13577 = 422745
- 入口 `index-DF_y_Q14.js` raw 1413239，gzip9 400117，sha256 `38ba657483ea30e0bdd8d4e2ad21152193eb6c71aebbc8cc32974058e915182e`。合前同参构建是 `index-BHIxKpNx.js`，raw 1413230，gzip9 400121，sha256 `0da35bcdfa18d430daa5c2047acbf067322ce36f84bfc12a6722d92990cef274`。把两边内容哈希文件名都归一之后，唯一差是默认图层多了 `,edges:!1`（9 个字节）。去掉这一处后两份入口逐字相同。early index 里没有 `structureEdges`、`structureArm`、`StructureEdges`、`__twinStructureEdges`、`结构边`、`ShellWireframe`、`shaderMaterial`、`WireframeHost`、`__twinWire`。`wireframe` 子串两边都是 123 处，`Wireframe` 两边都是 5 处，`EdgesGeometry` 两边都是 3 处，是 three 自带的，不是这条懒包。`cameraRest` 仍是 2 处：一处是已有的 `cameraRested` 字段，一处是 `import("./cameraRest-….js")` 懒字符串。`frameSchedule` 在入口里是 0。`BalancedSoftShadows` 与 `dock-` 仍只出现在入口的懒 import 字符串里
- `balancedFx-Df1Dr2i.js` raw 246234，gzip9 104552，sha256 `22478c125c285b0f5080df47f21ba604ebb96f3b79ffd71dc9c6c99e1a496e0c`。合前 `balancedFx-jY8v3K6.js` raw 同样 246234，gzip9 104553，sha256 `138332ea30bcd72b6823cbd8a49a697da6749829f358b413093da162f56feebc`。内容哈希归一后两份 balancedFx 逐字相同，gzip 差 1 来自下游块文件名里的哈希字节
- 相对合前 main 的同参构建，按文件名里的内容哈希归一后，新增的只有 `assets/structureArm-DTL_iVd.js`（raw 1743，gzip9 926）、`assets/structureEdges-C7DN8V9.js`（raw 93318，gzip9 26157）和共享块 `assets/Ray-ocYx6DR.js`（raw 27998，gzip9 7989）。`structureArm` 只被 `LayerPanel` 动态 import；`structureEdges` 只被 `structureArm` 动态 import。`Ray` 被 `structureEdges`、`PickBvh`、`PickBvhHost` 引用。`PickBvh` raw 69564 → 44466，共享模块挪到 `Ray` 之后变小。`LayerPanel` raw 1527 → 1859，gzip9 916 → 1098，多了「结构边」一行和指向 `structureArm` 的动态 import。`dock` raw 仍是 9625，归一后与合前 `dock-CMDXuvZ.js` 相同，只是里面的 LayerPanel 文件名变了（gzip9 4257 → 4255）。`d-`（DemandLoop）raw 仍是 9619，归一后相同（gzip9 3411 → 3413）。`shellClipCompile` 与 `EastGrille` raw 不变（3063 / 2090），归一后相同，gzip9 1433 → 1434、1054 → 1055，差在下游哈希字节；加上入口 gzip9 −4，hardGate 净 −2。`shadowBake-BIDE4SL.js` 与 `index-DgSBdyaU.css` 文件名和字节都没变。`ShellWireframe` raw 仍是 11334（gzip9 4085 → 4083）。`package.json` 与 `package-lock.json` 相对合前 main 无差异。产物里 0 个文件含 `ccapture`
- hardGate 文件里没有 structureEdges、structureArm、StructureEdges、Ray、ShellWireframe、shaderMaterial、WireframeHost、ClipCapture、MediaRecorder、AlarmAudioCue、DemandLoop、frameSchedule，也没有 minimap `mount`、shortcuts `arm`、DemoPointEditor、TransformControls、three-mesh-bvh、reportShot、shareShot、floorGlb、GLTFExporter。入口里出现的 `EdgesGeometry` / `Wireframe` 与合前一样，来自 three。测量窗口没有请求 structureEdges、structureArm、ShellWireframe、balancedFx 以外的这些块。`shellClipCompile-RpRHwC_.js` 是合前就在门禁里的壳层编译包（合前 `shellClipCompile-BMlWKkT.js`，gzip9 1433 → 1434），不是结构边
- 锁机 cutoff 是首帧 + 64ms。另一次冒烟把页面留到 `__twinReady` 之后 12000ms（已经过了首帧 + 64ms，也过了结构边自己要等的 dock 门闩）：均衡档 dock 与 floorDecor 都在首帧后 2610ms，BlueprintView 与 textRuntime 都在 2611ms，DemandLoop（`d-DiMnM0m.js`）与 BalancedSoftShadows 都在 2614ms，frameSchedule 与 cameraRest 都在 2625ms，pickBvhHome、pickBvhTiming、shaderMaterial 与 Line 都在 2626ms，ClipCapture、AlarmAudioCue 与 minimap `mount` 都在 2695ms，shortcuts `arm` 在 2697ms，PickBvhHost 在 2915ms，PickBvh 在 3975ms，Ray 在 3976ms，都在 cutoff 之外。性能档 dock 与 floorDecor 都在 2602ms，BlueprintView 在 2602ms，textRuntime 在 2603ms，DemandLoop 在 2607ms，pickBvhHome、pickBvhTiming、shaderMaterial 与 frameSchedule 都在 2614ms，cameraRest 在 2617ms，Line 在 2627ms，ClipCapture 与 AlarmAudioCue 与 mount 都在 2658ms，arm 在 2659ms，PickBvhHost 在 2907ms，PickBvh 与 Ray 都在 3090ms；性能档没有请求 SoftShadows，也没有请求 balancedFx。两个档位在这 12s 里都没有请求 `structureEdges-C7DN8V9.js`，也没有请求 `structureArm-DTL_iVd.js`，也没有请求 `ShellWireframe-uFwZRfI.js`。`window.__twinStructureEdges` 没有被写成对象（图层默认关，`LayerPanel` 不会发出那条 import）。`window.__twinWire` 保持未设置。两个档位都没有请求 DemoPointEditor / TransformControls，也没有单独请求 three-mesh-bvh（包围树打进 `PickBvh-D87t9Ki.js`），也没有请求 reportShot / shareShot / floorGlb / GLTFExporter。`preserveDrawingBuffer` 为 false（URL 没有 `keepDrawingBuffer=1`）
- dock 没有抢走 firstPrefetch。`__twinFirstPrefetchDone` 仍由 textRuntime 的 import 落下（`prefetchLazyChunks.ts`），冒烟读到 `true`。均衡档 floor shell 与 dock、floorDecor 同在首帧后 2610ms，textRuntime 与 BlueprintView 在 2611ms；性能档 dock 与 floorDecor 在 2602ms，BlueprintView 在 2602ms，textRuntime 在 2603ms。structureArm / structureEdges 不在这波请求里。Ray 跟在 PickBvh 后面（均衡 3976ms / 性能 3090ms），没有提前进首帧 + 64ms
- 控制台冒烟：`window.__twinReady === true`，`pageerror` 为 0，`console.error` 为 0（均衡档与性能档各一次）

结论：**PASS**。

### hardGate 文件

| gzip9 | url |
| ---: | --- |
| 400117 | `/assets/index-DF_y_Q14.js` |
| 13577 | `/models/street-tree-hi.glb` |
| 5061 | `/models/roof-sign.glb` |
| 3666 | `/assets/index-DgSBdyaU.css` |
| 3466 | `/models/street-tree-lo.glb` |
| 3229 | `/models/east-grille-v4-lo.glb` |
| 2666 | `/models/street-lamp.glb` |
| 1709 | `/assets/shadowBake-BIDE4SL.js` |
| 1434 | `/assets/shellClipCompile-RpRHwC_.js` |
| 1055 | `/assets/EastGrille-axcPHt9.js` |
| 342 | `/?q=balanced` |
