# D300 merge #60（T057 导出当前楼层 GLB）

| 项 | 值 |
| --- | --- |
| pre SHA | `6527691757c0b9401443d89f269b4cc35266fb32` |
| merge SHA | `7202884efa064325f249a642917e75e6d6a96c51` |
| parents | `6527691757c0b9401443d89f269b4cc35266fb32` `25cfc63a6f16b6a832db214769559a3d42fb7466` |
| PR head | `25cfc63a6f16b6a832db214769559a3d42fb7466` |
| hardGate | 436349（≤ 436361，余量 12）PASS |
| balancedFx | 104552（≤ 105000，余量 448）PASS |
| twinReady | true |
| pageerror | 0 |
| CloudAgent | `bc-c73f5d0e-fcb7-5a3c-b785-e4135fa1ea37` |

本文件按 `reviews/merge-d300-55.md` 的字段来写：合并前 SHA、merge SHA、parents、门禁数字、twinReady / pageerror、CloudAgent id。

## 合并

合并前 `origin/main` 与 `origin/integration` 都是 `6527691757c0b9401443d89f269b4cc35266fb32`。PR #60 的 `headRefOid` 是 `25cfc63a6f16b6a832db214769559a3d42fb7466`，`mergeable` 为 MERGEABLE，`mergeStateStatus` 为 CLEAN。草稿已标为 ready。没有改写这条 tip。

`gh pr merge` 没有 `--no-ff` 开关。用的是 merge commit 策略（不是 squash，不是 rebase），并锁了 `--match-head-commit 25cfc63a6f16b6a832db214769559a3d42fb7466`：

```
gh pr ready 60
gh pr merge 60 --merge --match-head-commit 25cfc63a6f16b6a832db214769559a3d42fb7466
```

没有 force-push。GitHub [PR #60](https://github.com/lenaelelle672-beep/uniview-twin/pull/60) 状态是 **MERGED**，`mergeCommit` 是 `7202884efa064325f249a642917e75e6d6a96c51`（`mergedAt` 2026-10-23T05:40:10Z）。两个父提交是 `6527691757c0b9401443d89f269b4cc35266fb32` 与 `25cfc63a6f16b6a832db214769559a3d42fb7466`。

门禁跑在 merge 提交上。本说明是紧随其后的一次提交，只加这个证据文件，不含产品代码。`main` 与 `integration` 一起快进到该说明提交，两条引用保持相同。

## 门禁

`npm ci`，然后 `SHADER_PREWARM=false npm run build`。`scripts/measure-first-screen.mjs`，均衡档 1366×768，Python `gzip.compress(9)`。

- **hardGate 436349** ≤ 436361，余量 12，**PASS**（与 tip 锁机基线 436349 / 104552 相同；相对 PR #55 合并后 main 基线 436298 / 104552，+51 / 0）
- **balancedFx 104552** ≤ 105000，余量 448，**PASS**
- 性能档总览没有请求 balancedFx（gzip 0）；性能档首屏 hardGate 口径 422772
- 入口 `index-DcM5gvcF.js` raw 1413252，gzip9 400145
- `balancedFx-DZ-CvNwn.js` raw 246234，gzip9 104552
- hardGate 文件里没有 GLTFExporter、floorGlb、SoftShadows、DemandLoop、cameraRest、frameSchedule、dock。测量窗口（`__twinReady` 后再等 1500ms）也没有请求这几块
- 锁机 cutoff 是首帧 + 64ms。另一次冒烟把页面留到首帧后约 5.7s（均衡）/ 5.6s（性能）：均衡档 dock 在首帧后 2616ms，DemandLoop 与 BalancedSoftShadows 都在 2620ms，frameSchedule 与 cameraRest 都在 2626ms，都在 cutoff 之外。性能档 dock 在首帧后 2602ms，DemandLoop 在 2604ms，frameSchedule 在 2613ms，cameraRest 在 2614ms；性能档没有请求 SoftShadows。两个档位都没有请求 floorGlb / GLTFExporter（点击「导出本层」才 `import('./floorGlb')`，exporter 再 `import('three/addons/exporters/GLTFExporter.js')`）。`preserveDrawingBuffer` 为 false（URL 没有 `keepDrawingBuffer=1`）
- 控制台冒烟：`window.__twinReady === true`，`pageerror` 为 0（均衡档与性能档各一次）
- `src/viewmarks/floorGlb.test.ts` 11 项通过

### hardGate 文件

| gzip9 | url |
| ---: | --- |
| 400145 | `/assets/index-DcM5gvcF.js` |
| 13577 | `/models/street-tree-hi.glb` |
| 5061 | `/models/roof-sign.glb` |
| 3666 | `/assets/index-DgSBdyaU.css` |
| 3466 | `/models/street-tree-lo.glb` |
| 3229 | `/models/east-grille-v4-lo.glb` |
| 2666 | `/models/street-lamp.glb` |
| 1709 | `/assets/shadowBake-BIDE4SLl.js` |
| 1435 | `/assets/shellClipCompile-CcbwxTrP.js` |
| 1055 | `/assets/EastGrille-Dg_4hvMf.js` |
| 340 | `/?q=balanced` |
