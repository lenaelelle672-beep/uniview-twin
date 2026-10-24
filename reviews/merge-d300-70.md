# D300 merge #70（T064 Billboard 演示铭牌 lazy）

| 项 | 值 |
| --- | --- |
| pre SHA | `d15ee1feceb19bc76fd3aca52465e2cfbc361e14` |
| merge SHA | `38e8399d0ed04291448342bda70bf7acab9e80d9` |
| parents | `d15ee1feceb19bc76fd3aca52465e2cfbc361e14` `f21c8a0c1f7cad7bc7cbde05a43f986b3605527a` |
| PR head | `f21c8a0c1f7cad7bc7cbde05a43f986b3605527a` |
| hardGate | 436322（≤ 436361，余量 39）PASS |
| balancedFx | 104552（≤ 105000，余量 448）PASS |
| twinReady | true |
| pageerror | 0 |
| CloudAgent | `bc-d7d062ff-a210-5ad3-942e-5545b5e6cc6d` |

本文件按 `reviews/merge-d300-71.md` / `reviews/merge-d300-68.md` 的字段来写：合并前 SHA、merge SHA、parents、门禁数字、twinReady / pageerror、CloudAgent id。

## 合并

合并前 `origin/main` 是 `d15ee1feceb19bc76fd3aca52465e2cfbc361e14`。PR #70 的 `headRefOid` 是 `f21c8a0c1f7cad7bc7cbde05a43f986b3605527a`，`baseRefOid` 是 `d15ee1feceb19bc76fd3aca52465e2cfbc361e14`，tip 的唯一父提交也是 `d15ee1feceb19bc76fd3aca52465e2cfbc361e14`。合并前 `isDraft` 为 true，`state` 为 OPEN，`mergeable` 为 MERGEABLE，`mergeStateStatus` 为 CLEAN。草稿已标为 ready。没有改写这条 tip。

`gh pr merge` 没有 `--no-ff` 开关。用的是 merge commit 策略（不是 squash，不是 rebase），并锁了 `--match-head-commit f21c8a0c1f7cad7bc7cbde05a43f986b3605527a`：

```
gh pr ready 70 --repo lenaelelle672-beep/uniview-twin
gh pr merge 70 --repo lenaelelle672-beep/uniview-twin --merge --match-head-commit f21c8a0c1f7cad7bc7cbde05a43f986b3605527a
```

没有 force-push。GitHub [PR #70](https://github.com/lenaelelle672-beep/uniview-twin/pull/70) 状态是 **MERGED**，`mergeCommit` 是 `38e8399d0ed04291448342bda70bf7acab9e80d9`（`mergedAt` 2026-10-24T06:23:09Z）。两个父提交是 `d15ee1feceb19bc76fd3aca52465e2cfbc361e14` 与 `f21c8a0c1f7cad7bc7cbde05a43f986b3605527a`。merge 树与 PR head 树相同（`71d65946888763bf8573c001422bbe21964195ce`）。

门禁跑在 merge 提交上。本说明是紧随其后的一次提交，只加这个证据文件，不含产品代码，parent 是该 merge commit。只推 `main`。

## 门禁

`npm ci`，然后 `SHADER_PREWARM=false npm run build`。`scripts/measure-first-screen.mjs`，均衡档 1366×768，Python `gzip.compress(9)`。下面是合入后在 merge commit 上的实测。相对合前基线 436322 / 104552。脚本 `ok: true`，`failures` 为空。性能档总览没有请求 balancedFx。

- **hardGate 436322** ≤ 436361，余量 39，**PASS**（相对合前 main / PR #71 合并后基线 436322 / 104552 为 +0 / +0）
- **balancedFx 104552** ≤ 105000，余量 448，**PASS**
- 性能档总览没有请求 balancedFx（gzip 0），也没有 `street-tree-hi.glb`；性能档首屏 hardGate 口径 422745（合前 422745，同为 +0）。少掉的正是均衡档才拉的 `street-tree-hi.glb`（gzip9 13577）：436322 − 13577 = 422745
- 入口 `index-B_0OL4ix.js` raw 1413239，gzip9 400118，sha256 `7a5bb9e68abba4c5651fc7924100c04cea1fb1fdf36c13d55bb51ebe9746f48c`。合前同参构建是 `index-B61QpNrQ.js`，raw 同样 1413239，gzip9 同样 400118，sha256 `ef2187abb11296b3414a57c986681e693b2bc2403c269b9fc224dfbcdca9ade4`。把两边内容哈希文件名都归一之后，两份入口逐字相同。入口里 `DemoPlaques`、`Billboard`、`__twinPlaques`、`plaques` 都是 0 处，也没有 `ColorManagement-` / `Vector3-` 这种新共享块的文件名。`cameraRest` 仍是 2 处。`BalancedSoftShadows` 仍是 2 处。`dock-` 仍是 1 处，是 `import("./dock-CheMkHl.js")` 懒字符串。`d-BQ2aWWl` 是 1 处，是 `import("./d-BQ2aWWl.js")` 懒字符串。`textRuntime` 是 1 处懒字符串。`frameSchedule` 文件名在入口里是 0。`EdgesGeometry` 仍是 3 处，`Wireframe` 仍是 5 处，是 three 自带的。入口里原有的 `ColorManagement` 字面量仍是 3 处，合前同样是 3 处，不是这条铭牌分包
- `balancedFx-hTI5QIy.js` raw 246234，gzip9 104552，sha256 `8f4e10f301bacc0a3780ac018ce8b736c966d8f5eaa5a6555ef1f0771b28be80`。合前 `balancedFx-BeFs3r4.js` raw 同样 246234，gzip9 同样 104552，sha256 `942a82f21b7705afdb5f8f04ed197bc9b161361d736ef9a610c73d12b6d1b47f`。内容哈希归一后两份 balancedFx 逐字相同
- 相对合前 main 的同参构建，产物 144 → 147。内容哈希归一后，真正多出来的只有三个懒块：`assets/DemoPlaques-5YGliVz.js`（raw 10031，gzip9 3871，sha256 `00a6cee0b62395bdef0655c8dcf7dbd637f3d49ebc61d038cf836675c975273d`）、`assets/ColorManagement-xydhdb9.js`（raw 10149，gzip9 3515，sha256 `6f1ccbfbb52084a60d4a90ee734b90f6b3fbf91865a75f8bc7ddc320f968bd7d`）、`assets/Vector3-SqxtuI5.js`（raw 15368，gzip9 4850，sha256 `15ee1c1bb1b1c5b2dcce67fae7ca64d8abdabc86418da73b793d911174220261`）。drei `Billboard` 的实现打进 `DemoPlaques`（`follow` / `lockX` / `lockY` / `lockZ` 的 forwardRef）；压缩后全 dist 里字面量 `Billboard` 是 0 处。`DemoPlaques` 这个标识符只出现在 `DemoPlaques-5YGliVz.js`（2 处）和 `d-BQ2aWWl.js`（2 处）。`__twinPlaques` 只出现在 `DemoPlaques-5YGliVz.js`（3 处）。`ColorManagement` 与 `Vector3` 是铭牌分包和既有懒包（`structureEdges`、`Ray`、`PickBvh`）共用的 three 叶子，从 `structureEdges`（raw 93318 → 83650，gzip9 26157 → 23462）和 `Ray`（raw 27998 → 12730，gzip9 7989 → 4128）里拆出去。`PickBvh` raw 44466 → 44495，`PickBvhHost` raw 2252 → 2281，多出来的是 `import("./Vector3-….js")`
- `d-BQ2aWWl.js`（DemandLoop）raw 10954 → 11531（+577），gzip9 3936 → 4094（+158），sha256 `17733151fbd19d7375c7be61ce7bac8255b017cfa6491bcb4e6b755a70ee6923`。多出来的是铭牌宿主：`const Je=2600`，并且 `performance.now()-__twinFirstFrameAt>=Je` 之后才 `import("./DemoPlaques-5YGliVz.js")`。`LayerPanel-CQCJzT5.js` raw 1859 → 1880（+21），gzip9 1100 → 1113（+13）。归一后多出来的是 `,["plaques","铭牌"]`。`dock-CheMkHl.js` raw 仍是 12532，gzip9 仍是 5268，sha256 `930a21f6d44a74c4c523c8509809b7196c6d5ffefd612407aa3b451c3974daca`。合前 `dock-BXk4ePv.js` sha256 `cab02b2828017304a2dacd9363ea5f470a2266b380af771463e67df2bf9cb1da`。内容哈希归一后两份 dock 逐字相同，只是里面的 LayerPanel 文件名变了。`index.html` raw 仍是 483，gzip9 342 → 343，sha256 `d973eb96d7b3cca054952348b796f41875ac1d1799a0cb3fe9f15424e2b96e25`；归一入口文件名后与合前逐字相同，gzip 差 1 来自入口哈希字节。`EastGrille-CqkuGOS.js` raw 仍是 2090，gzip9 1055 → 1054，归一后相同，差在下游哈希字节。`shellClipCompile-D3GaUEd.js` raw 3063，gzip9 仍是 1433。`shadowBake-BIDE4SL.js` 与 `index-DgSBdyaU.css` 文件名和字节都没变。html +1 与 EastGrille −1 抵消，hardGate 净 +0。`package.json` 与 `package-lock.json` 相对合前 main 无差异，依赖仍是 11 个，0 个新依赖。`@react-three/drei` 仍是 `10.7.9`，没有升版本。产物里 0 个文件含 `ccapture`
- hardGate 文件里没有 `DemoPlaques`、`Billboard`、`ColorManagement-`、`Vector3-`、`dock`、DemandLoop（`d-`）、`LayerPanel`、`textRuntime`、`frameSchedule`、`cameraRest`、`shaderMaterial`、`PickBvh`、`Ray`、`structureEdges`、`structureArm`、`ShellWireframe`、`RectAreaMount`、`RectAreaLive`、`AuthorHelpers`、`ClipCapture`、`AlarmAudioCue`。测量窗口（`__twinReady` 后再等 1500ms）也没有请求这些块
- 锁机 cutoff 是首帧 + 64ms。另一次冒烟把页面留到 `__twinReady` 之后 12000ms：均衡档总览（`view` 为 `building`）dock 在首帧后 2612ms，floorDecor 在 2612ms，BlueprintView 在 2612ms，textRuntime 在 2612ms，DemandLoop（`d-BQ2aWWl.js`）在 2615ms，frameSchedule 与 cameraRest 都在 2627ms，shaderMaterial 与 Line 都在 2627ms，AlarmAudioCue 与 ClipCapture 都在 2666ms，GridMount 与 AuthorHelperMount 与 minimap `mount` 都在 2670ms，shortcuts `arm` 在 2671ms，LayerPanel 在 2683ms，PickBvhHost 在 2915ms，PickBvh、Ray 与 Vector3 都在 2922ms。性能档 dock 与 floorDecor 都在 2608ms，BlueprintView 与 textRuntime 都在 2608ms，DemandLoop 在 2611ms，frameSchedule 与 cameraRest 都在 2619ms，shaderMaterial 与 Line 都在 2620ms，AlarmAudioCue 与 ClipCapture 都在 2677ms，GridMount、AuthorHelperMount、mount 与 arm 都在 2682ms，LayerPanel 在 2702ms，PickBvhHost 在 2873ms，PickBvh、Vector3 与 Ray 都在 3057ms。两个总览档位都在 cutoff 之外。性能档没有请求 balancedFx，也没有 `street-tree-hi.glb`。两个总览档位在这 12s 里都没有请求 `DemoPlaques-5YGliVz.js`，也没有请求 `ColorManagement-xydhdb9.js`，也没有请求 structureEdges、structureArm、ShellWireframe、GridAxes、DemoPointEditor、reportShot、shareShot、floorGlb、GLTFExporter、RectAreaMount、RectAreaLive、AuthorHelpers。`window.__twinPlaques` 没有被写上。首帧 + 64ms 之内的请求就是 hardGate 那一组（均衡档另加 balancedFx、hdr 与 favicon；性能档没有 balancedFx，也没有 `street-tree-hi.glb`，hdr 仍在）
- dock 没有抢走 firstPrefetch。`__twinFirstPrefetchDone` 仍由 textRuntime 的 import 落下（`prefetchLazyChunks.ts` 里的 `markFirstPrefetchDone`），均衡档与性能档冒烟都读到 `true`。均衡档 textRuntime 在首帧后 2612ms，标志在 2694ms 落下；dock 在 2612ms，与 floorDecor 同一波楼层壳，没有进首帧 + 64ms。性能档 textRuntime 在 2608ms，标志在 2703ms 落下；dock 在 2608ms。铭牌宿主不在这波请求里
- `?q=balanced&view=floor&floor=F8&demoEdit=1` 的同长度冒烟：`view` 为 `floor`，`__twinPlaques` 为 `demo: true`、`floorId: 'F8'`、`count: 3`、`follow: true`。`DemoPlaques-5YGliVz.js` 在首帧后 3116ms，`ColorManagement-xydhdb9.js` 与 `Vector3-SqxtuI5.js` 都在 5130ms，都在 cutoff 之外。单层会提前挂上 DemandLoop，`d-BQ2aWWl.js` 落在首帧之前；朝向分包仍要等宿主里的 2600ms，没有跟着进 cutoff。dock 在 598ms，textRuntime 在 599ms，`__twinFirstPrefetchDone` 在 657ms 落下，仍是 textRuntime，dock 没有进首帧 + 64ms。这次 `pageerror` 为 0，`console.error` 为 0
- 控制台冒烟：`window.__twinReady === true`，`pageerror` 为 0，`console.error` 为 0（均衡档总览、性能档总览、单层 demoEdit 各一次）。`preserveDrawingBuffer` 为 false（URL 没有 `keepDrawingBuffer=1`）

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
