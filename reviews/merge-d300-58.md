# D300 merge #58（T052 框选多工位）

| 项 | 值 |
| --- | --- |
| pre SHA | `0e7db61106471dc4bea2fbdcfd048f9ab95831ae` |
| merge SHA | `daf6480f5c8cccfa37aa9c07874900fe76bae42b` |
| parents | `0e7db61106471dc4bea2fbdcfd048f9ab95831ae` `f291039a2202900f093ff7ba21ff1f188ce0b67d` |
| PR head | `f291039a2202900f093ff7ba21ff1f188ce0b67d` |
| hardGate | 436301（≤ 436361，余量 60）PASS |
| balancedFx | 104552（≤ 105000，余量 448）PASS |
| twinReady | true |
| pageerror | 0 |
| CloudAgent | `bc-90ff7a3a-4d32-50b9-8423-2f0be37137d6` |

本文件按 `reviews/merge-d300-57.md` 的字段来写：合并前 SHA、merge SHA、parents、门禁数字、twinReady / pageerror、CloudAgent id。

## 合并

合并前 `origin/main` 与 `origin/integration` 都是 `0e7db61106471dc4bea2fbdcfd048f9ab95831ae`。PR #58 的 `headRefOid` 是 `f291039a2202900f093ff7ba21ff1f188ce0b67d`，其父提交就是这条基线。草稿已标为 ready。

```
git merge --no-ff f291039a2202900f093ff7ba21ff1f188ce0b67d -m "Merge PR #58: T052 box-select multi desks (f291039)"
```

先推 `main`，再把 `integration` 快进到同一 merge SHA。没有 force-push，没有 squash，没有 rebase。

GitHub [PR #58](https://github.com/lenaelelle672-beep/uniview-twin/pull/58) 状态是 **MERGED**，`mergeCommit` 是 `daf6480f5c8cccfa37aa9c07874900fe76bae42b`（`mergedAt` 2026-10-22T15:43:09Z）。

门禁跑在 merge 提交上。本说明是紧随其后的一次提交，`main` 与 `integration` 一起快进，两条引用保持相同。

## 门禁

`npm ci`，然后 `SHADER_PREWARM=false npm run build`。`scripts/measure-first-screen.mjs`，均衡档 1366×768，Python `gzip.compress(9)`。

- **hardGate 436301** ≤ 436361，余量 60，**PASS**（相对 PR #57 合并证据基线 436299，+2）
- **balancedFx 104552** ≤ 105000，余量 448，**PASS**（与基线 104552 相同）
- 性能档总览没有请求 balancedFx（gzip 0）；性能档首屏 hardGate 口径 422724
- 入口 `index-DuSVxThj.js` raw 1413153，gzip9 400097
- `balancedFx-COVrFkJB.js` raw 246234，gzip9 104552
- hardGate 文件里没有 DeskBoxSelect、SoftShadows、DemandLoop、cameraRest、frameSchedule。测量窗口（`__twinReady` 后再等 1500ms）也没有请求这几块
- 锁机 cutoff 是首帧 + 64ms。另一次冒烟把页面留到首帧后约 5.2s（均衡）/ 4.5s（性能）：均衡档 DemandLoop 在首帧后 2612ms，BalancedSoftShadows 在首帧后 2613ms，frameSchedule 与 cameraRest 都在首帧后 2618ms，都在 cutoff 之外。性能档 DemandLoop 在首帧后 2610ms，frameSchedule 与 cameraRest 在首帧后 2616ms；性能档没有请求 SoftShadows。总览窗口里没有请求 DeskBoxSelect。`preserveDrawingBuffer` 为 false（URL 没有 `keepDrawingBuffer=1`）
- 控制台冒烟：`window.__twinReady === true`，`pageerror` 为 0（均衡档与性能档各一次）

### hardGate 文件

| gzip9 | url |
| ---: | --- |
| 400097 | `/assets/index-DuSVxThj.js` |
| 13577 | `/models/street-tree-hi.glb` |
| 5061 | `/models/roof-sign.glb` |
| 3666 | `/assets/index-DgSBdyaU.css` |
| 3466 | `/models/street-tree-lo.glb` |
| 3229 | `/models/east-grille-v4-lo.glb` |
| 2666 | `/models/street-lamp.glb` |
| 1709 | `/assets/shadowBake-BIDE4SLl.js` |
| 1436 | `/assets/shellClipCompile-BGRo4ukj.js` |
| 1055 | `/assets/EastGrille-CDb0XatM.js` |
| 339 | `/?q=balanced` |
