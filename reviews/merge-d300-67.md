# D300 merge #67（T063 Wireframe lazy ShellWireframe）

| 项 | 值 |
| --- | --- |
| pre SHA | `59fc53dd9f50d0abb21624a4f576554d47a13f3c` |
| merge SHA | `185dccc75560ffb20a8e49333fe32e7bd4f93a2c` |
| parents | `59fc53dd9f50d0abb21624a4f576554d47a13f3c` `2baa0c67c5fdcb020b2b2c0eb52c7e67b11193a2` |
| PR head | `2baa0c67c5fdcb020b2b2c0eb52c7e67b11193a2` |
| hardGate | 436324（≤ 436361，余量 37）PASS |
| balancedFx | 104553（≤ 105000，余量 447）PASS |
| twinReady | true |
| pageerror | 0 |
| CloudAgent | `bc-180f1001-2905-5adc-afe8-9aebf383cdcc` |

本文件按 `reviews/merge-d300-65.md` 的字段来写：合并前 SHA、merge SHA、parents、门禁数字、twinReady / pageerror、CloudAgent id。

## 合并

合并前 `origin/main` 是 `59fc53dd9f50d0abb21624a4f576554d47a13f3c`。PR #67 的 `headRefOid` 是 `2baa0c67c5fdcb020b2b2c0eb52c7e67b11193a2`，`baseRefOid` 是 `59fc53dd9f50d0abb21624a4f576554d47a13f3c`，tip 的唯一父提交也是 `59fc53dd9f50d0abb21624a4f576554d47a13f3c`。`mergeable` 为 MERGEABLE，`mergeStateStatus` 为 CLEAN。草稿已标为 ready。没有改写这条 tip。

`gh pr merge` 没有 `--no-ff` 开关。用的是 merge commit 策略（不是 squash，不是 rebase），并锁了 `--match-head-commit 2baa0c67c5fdcb020b2b2c0eb52c7e67b11193a2`：

```
gh pr ready 67 --repo lenaelelle672-beep/uniview-twin
gh pr merge 67 --repo lenaelelle672-beep/uniview-twin --merge --match-head-commit 2baa0c67c5fdcb020b2b2c0eb52c7e67b11193a2
```

没有 force-push。GitHub [PR #67](https://github.com/lenaelelle672-beep/uniview-twin/pull/67) 状态是 **MERGED**，`mergeCommit` 是 `185dccc75560ffb20a8e49333fe32e7bd4f93a2c`（`mergedAt` 2026-10-23T13:38:27Z）。两个父提交是 `59fc53dd9f50d0abb21624a4f576554d47a13f3c` 与 `2baa0c67c5fdcb020b2b2c0eb52c7e67b11193a2`。

门禁跑在 merge 提交上。本说明是紧随其后的一次提交，只加这个证据文件，不含产品代码，parent 是该 merge commit。只推 `main`。

## 门禁

`npm ci`，然后 `SHADER_PREWARM=false npm run build`。`scripts/measure-first-screen.mjs`，均衡档 1366×768，Python `gzip.compress(9)`。下面是合入后在 merge commit 上的实测。相对合前基线 436326 / 104552。

- **hardGate 436324** ≤ 436361，余量 37，**PASS**（相对合前 main / PR #65 合并后基线 436326 / 104552 为 −2 / +1。early index 的 raw 与 gzip9 与合前 main 的生产构建相同：1413230 / 400121）
- **balancedFx 104553** ≤ 105000，余量 447，**PASS**
- 性能档总览没有请求 balancedFx（gzip 0）；性能档首屏 hardGate 口径 422747（合前 422749，同为 −2）
- 入口 `index-BHIxKpNx.js` raw 1413230，gzip9 400121，sha256 `0da35bcdfa18d430daa5c2047acbf067322ce36f84bfc12a6722d92990cef274`。合前同参构建是 `index-DmZaOa7W.js`，raw / gzip9 相同，sha256 是 `c7cba07b1f065f9cc2f95a18c4167b0288de63632b471a3a97f5ac888b37d766`。两边不是逐字节相同：差在下游懒包的内容哈希文件名，以及压缩器导出别名（例如绑到 `b$` 的那个名字）。early index 里没有 `ShellWireframe`、`shaderMaterial`、`WireframeHost`、`__twinWire`、`线框`。`wireframe` 子串两边都是 123 处，是 three 自带的，不是这条懒包
- `balancedFx-jY8v3K6.js` raw 246234，gzip9 104553。合前 `balancedFx-RF8BS8G.js` raw 同样 246234，gzip9 104552。文件名变了，因为导出别名跟着模块图挪了一位
- 相对合前 main 的同参构建，按文件名里的内容哈希归一后，新增的只有 `assets/ShellWireframe-yfs0CTj.js`（raw 11334，gzip9 4085）和共享块 `assets/shaderMaterial-BqW2PN5.js`（raw 405，gzip9 285）。`shaderMaterial` 是 drei 的 shader material，从已有的 Workstations / 楼层块里拆出来给 ShellWireframe 共用，不是新的 npm 依赖。`d-DPLTPhg.js`（DemandLoop）raw 8998 → 9619，多出来的是 `WireframeHost`。`LayerPanel-B3lbHzQ.js` raw 1401 → 1527，多了「线框」一行。`Workstations` raw 15164 → 14848，shader material 挪走之后变小。`B1Interior`、`DeskBoxSelect`、`JsonFloorInterior`、`TowerInterior` 只多了一条对 `shaderMaterial` 的副作用 import。`dock-CMDXuvZ.js` raw 仍是 9625，归一后与合前 `dock-BRS_ZLo.js` 相同，只是里面的 LayerPanel 文件名变了。`package.json` 与 `package-lock.json` 相对合前 main 无差异。产物里 0 个文件含 `ccapture`
- hardGate 文件里没有 ShellWireframe、shaderMaterial、WireframeHost、ClipCapture、MediaRecorder、AlarmAudioCue、DemandLoop、cameraRest、frameSchedule，也没有 minimap `mount`、shortcuts `arm`、DemoPointEditor、TransformControls、PickBvh、three-mesh-bvh、reportShot、shareShot、floorGlb、GLTFExporter。入口里出现的 `Wireframe` / `WireframeGeometry` 与合前一样，来自 three。`BalancedSoftShadows`、`cameraRest`、`dock-` 只出现在入口的懒 import 字符串里，测量窗口没有请求这些块。`shellClipCompile-BMlWKkT.js` 是合前就在门禁里的壳层编译包（合前 `shellClipCompile-DbEfLHH.js`，gzip9 1435 → 1433），不是 ShellWireframe
- 锁机 cutoff 是首帧 + 64ms。另一次冒烟把页面留到 `__twinReady` 之后 12000ms（已经过了首帧 + 64ms，也过了线框自己的首帧 + 2600ms 门闩）：均衡档 dock 与 floorDecor 都在首帧后 2611ms，BlueprintView 与 textRuntime 都在 2615ms，DemandLoop（`d-DPLTPhg.js`）与 BalancedSoftShadows 都在 2624ms，frameSchedule 与 cameraRest 都在 2641ms，pickBvhHome、pickBvhTiming 与 shaderMaterial 都在 2648ms，ClipCapture、AlarmAudioCue、minimap `mount` 与 shortcuts `arm` 都在 2675ms，PickBvhHost 在 2929ms，PickBvh 在 2952ms，都在 cutoff 之外。性能档 dock 在 2613ms，floorDecor、BlueprintView、textRuntime 都在 2614ms，DemandLoop 在 2616ms，frameSchedule 与 cameraRest 都在 2623ms，pickBvh 与 shaderMaterial 都在 2625ms，ClipCapture 与 AlarmAudioCue 在 2633ms，mount 与 arm 在 2634ms，PickBvhHost 在 2905ms，PickBvh 在 2910ms；性能档没有请求 SoftShadows，也没有请求 balancedFx。两个档位在这 12s 里都没有请求 `ShellWireframe-yfs0CTj.js`。`window.__twinWire` 保持 null（图层默认关，`WireframeHost` 不会发出那条 import）。两个档位都没有请求 DemoPointEditor / TransformControls，也没有单独请求 three-mesh-bvh（包围树打进 `PickBvh-CW-gzGK.js`），也没有请求 reportShot / shareShot / floorGlb / GLTFExporter。`preserveDrawingBuffer` 为 false（URL 没有 `keepDrawingBuffer=1`）
- dock 没有抢走 firstPrefetch。`__twinFirstPrefetchDone` 仍由 textRuntime 的 import 落下（`prefetchLazyChunks.ts`）。均衡档 floor shell 与 dock、floorDecor 同在首帧后 2611ms，textRuntime 与 BlueprintView 在 2615ms；性能档 dock 在 2613ms，floorDecor、textRuntime、BlueprintView 都在 2614ms。ShellWireframe 不在这波请求里。shaderMaterial 跟在楼层图后面（均衡 2648ms / 性能 2625ms），没有提前进首帧 + 64ms
- 控制台冒烟：`window.__twinReady === true`，`pageerror` 为 0，`console.error` 为 0（均衡档与性能档各一次）
- `vitest run`：95 个文件、516 项通过。其中 `src/scene/wire/wire.test.ts` 9 项通过

结论：**PASS**。

### hardGate 文件

| gzip9 | url |
| ---: | --- |
| 400121 | `/assets/index-BHIxKpNx.js` |
| 13577 | `/models/street-tree-hi.glb` |
| 5061 | `/models/roof-sign.glb` |
| 3666 | `/assets/index-DgSBdyaU.css` |
| 3466 | `/models/street-tree-lo.glb` |
| 3229 | `/models/east-grille-v4-lo.glb` |
| 2666 | `/models/street-lamp.glb` |
| 1709 | `/assets/shadowBake-BIDE4SL.js` |
| 1433 | `/assets/shellClipCompile-BMlWKkT.js` |
| 1054 | `/assets/EastGrille-BaQjDWD.js` |
| 342 | `/?q=balanced` |
