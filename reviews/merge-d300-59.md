# D300 merge #59（T056 报告页嵌入当前三维视图）

| 项 | 值 |
| --- | --- |
| pre SHA | `f65b299b2f489266db837653a09741e311741e04` |
| merge SHA | `6c4d0f62e7887799526804dad581303ec5316ad9` |
| parents | `f65b299b2f489266db837653a09741e311741e04` `620af1069961bee9314570b5b97935d6d424cfca` |
| PR head | `620af1069961bee9314570b5b97935d6d424cfca` |
| hardGate | 436359（≤ 436361，余量 2）PASS |
| balancedFx | 104552（≤ 105000，余量 448）PASS |
| twinReady | true |
| pageerror | 0 |
| CloudAgent | `bc-097d4bb2-6fe4-581a-b6f8-9b0360ddcafa` |

本文件按 `reviews/merge-d300-60.md` 与 `reviews/merge-d300-55.md` 的字段来写：合并前 SHA、merge SHA、parents、门禁数字、twinReady / pageerror、CloudAgent id。

## 合并

合并前 `origin/main` 与 `origin/integration` 都是 `f65b299b2f489266db837653a09741e311741e04`。PR #59 的 `headRefOid` 是 `620af1069961bee9314570b5b97935d6d424cfca`，`mergeable` 为 MERGEABLE，`mergeStateStatus` 为 CLEAN。草稿已标为 ready。没有改写这条 tip。

`gh pr merge` 没有 `--no-ff` 开关。用的是 merge commit 策略（不是 squash，不是 rebase），并锁了 `--match-head-commit 620af1069961bee9314570b5b97935d6d424cfca`：

```
gh pr ready 59
gh pr merge 59 --merge --match-head-commit 620af1069961bee9314570b5b97935d6d424cfca
```

没有 force-push。GitHub [PR #59](https://github.com/lenaelelle672-beep/uniview-twin/pull/59) 状态是 **MERGED**，`mergeCommit` 是 `6c4d0f62e7887799526804dad581303ec5316ad9`（`mergedAt` 2026-10-23T07:08:25Z）。两个父提交是 `f65b299b2f489266db837653a09741e311741e04` 与 `620af1069961bee9314570b5b97935d6d424cfca`。

门禁跑在 merge 提交上。本说明是紧随其后的一次提交，只加这个证据文件，不含产品代码。`main` 与 `integration` 一起快进到该说明提交，两条引用保持相同。

## 门禁

`npm ci`，然后 `SHADER_PREWARM=false npm run build`。`scripts/measure-first-screen.mjs`，均衡档 1366×768，Python `gzip.compress(9)`。

- **hardGate 436359** ≤ 436361，余量 2，**PASS**（相对 PR #60 合并后 main 基线 436349 / 104552，+10 / 0。增量来自入口 gzip +8、`shellClipCompile` +1、文档 `/?q=balanced` +1）
- **balancedFx 104552** ≤ 105000，余量 448，**PASS**
- 性能档总览没有请求 balancedFx（gzip 0）；性能档首屏 hardGate 口径 422782
- 入口 `index-D99GPnzr.js` raw 1413274，gzip9 400153
- `balancedFx-BoZFmaB2.js` raw 246234，gzip9 104552
- hardGate 文件里没有 reportShot、shareShot、SoftShadows、DemandLoop、cameraRest、frameSchedule、dock。测量窗口（`__twinReady` 后再等 1500ms）也没有请求这几块。reportShot / shareShot 也不在 balancedFx 里
- 锁机 cutoff 是首帧 + 64ms。另一次冒烟把页面留到首帧后约 5.8s（均衡）/ 5.5s（性能）：均衡档 dock 在首帧后 2616ms，DemandLoop 与 BalancedSoftShadows 都在 2619ms，frameSchedule 与 cameraRest 都在 2630ms，都在 cutoff 之外。性能档 dock 在首帧后 2603ms，DemandLoop 在 2607ms，frameSchedule 与 cameraRest 都在 2611ms；性能档没有请求 SoftShadows。两个档位都没有请求 reportShot / shareShot（报告页点击「嵌入当前视图」才 `import('./reportShot')`，截图包再 `import('../viewmarks/shareShot')`）。`preserveDrawingBuffer` 为 false（URL 没有 `keepDrawingBuffer=1`）
- 控制台冒烟：`window.__twinReady === true`，`pageerror` 为 0（均衡档与性能档各一次）
- `src/report/reportShot.test.ts` 14 项通过；`src/viewmarks/shareShot.test.ts` 9 项通过；`src/scene/gpuDetect.test.ts` 5 项通过

### hardGate 文件

| gzip9 | url |
| ---: | --- |
| 400153 | `/assets/index-D99GPnzr.js` |
| 13577 | `/models/street-tree-hi.glb` |
| 5061 | `/models/roof-sign.glb` |
| 3666 | `/assets/index-DgSBdyaU.css` |
| 3466 | `/models/street-tree-lo.glb` |
| 3229 | `/models/east-grille-v4-lo.glb` |
| 2666 | `/models/street-lamp.glb` |
| 1709 | `/assets/shadowBake-BIDE4SLl.js` |
| 1436 | `/assets/shellClipCompile-BbwIdZQQ.js` |
| 1055 | `/assets/EastGrille-IWJ_iuL0.js` |
| 341 | `/?q=balanced` |
