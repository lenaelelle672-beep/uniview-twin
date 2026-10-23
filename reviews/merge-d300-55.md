# D300 merge #55（T049 截图分享与视角链接）

| 项 | 值 |
| --- | --- |
| pre SHA | `26a0901bab2a1eb5883ab7fe7d5d1d9e1d02bf0f` |
| merge SHA | `95d50e85663844b3b8554ab4fbcfb555617fe44f` |
| parents | `26a0901bab2a1eb5883ab7fe7d5d1d9e1d02bf0f` `38e8f287d798493c41999837b4b50847964a19d9` |
| PR head | `38e8f287d798493c41999837b4b50847964a19d9` |
| hardGate | 436298（≤ 436361，余量 63）PASS |
| balancedFx | 104552（≤ 105000，余量 448）PASS |
| twinReady | true |
| pageerror | 0 |
| CloudAgent | `bc-d4586729-7319-57eb-b4d4-495a78bce1be` |

本文件按 `reviews/merge-d300-56.md` 的字段来写：合并前 SHA、merge SHA、parents、门禁数字、twinReady / pageerror、CloudAgent id。

## 合并

合并前 `origin/main` 与 `origin/integration` 都是 `26a0901bab2a1eb5883ab7fe7d5d1d9e1d02bf0f`。PR #55 的 `headRefOid` 是 `38e8f287d798493c41999837b4b50847964a19d9`，`mergeable` 为 MERGEABLE，`mergeStateStatus` 为 CLEAN。草稿已标为 ready。没有改写这条 tip。

`gh pr merge` 没有 `--no-ff` 开关。用的是 merge commit 策略（不是 squash，不是 rebase），并锁了 `--match-head-commit 38e8f287d798493c41999837b4b50847964a19d9`：

```
gh pr ready 55
gh pr merge 55 --merge --match-head-commit 38e8f287d798493c41999837b4b50847964a19d9
```

没有 force-push。GitHub [PR #55](https://github.com/lenaelelle672-beep/uniview-twin/pull/55) 状态是 **MERGED**，`mergeCommit` 是 `95d50e85663844b3b8554ab4fbcfb555617fe44f`（`mergedAt` 2026-10-23T02:48:08Z）。两个父提交是 `26a0901bab2a1eb5883ab7fe7d5d1d9e1d02bf0f` 与 `38e8f287d798493c41999837b4b50847964a19d9`。

门禁跑在 merge 提交上。本说明是紧随其后的一次提交，只加这个证据文件，不含产品代码。`main` 与 `integration` 一起快进到该说明提交，两条引用保持相同。

## 门禁

`npm ci`，然后 `SHADER_PREWARM=false npm run build`。`scripts/measure-first-screen.mjs`，均衡档 1366×768，Python `gzip.compress(9)`。

- **hardGate 436298** ≤ 436361，余量 63，**PASS**（与 tip 锁机基线 436298 / 104552 相同；相对 PR #56 合并后 main 基线 436300 / 104553，−2 / −1）
- **balancedFx 104552** ≤ 105000，余量 448，**PASS**
- 性能档总览没有请求 balancedFx（gzip 0）；性能档首屏 hardGate 口径 422721
- 入口 `index-DoYRiRnO.js` raw 1413153，gzip9 400094
- `balancedFx-lrbD6fGh.js` raw 246234，gzip9 104552
- hardGate 文件里没有 SoftShadows、DemandLoop、cameraRest、frameSchedule、dock、shareShot。测量窗口（`__twinReady` 后再等 1500ms）也没有请求这几块
- 锁机 cutoff 是首帧 + 64ms。另一次冒烟把页面留到首帧后约 5.5s（均衡）/ 5.3s（性能）：均衡档 dock 在首帧后 2613ms，DemandLoop 在 2617ms，BalancedSoftShadows 在 2618ms，frameSchedule 与 cameraRest 都在 2625ms，都在 cutoff 之外。性能档 dock 在首帧后 2611ms，DemandLoop 在 2620ms，frameSchedule 与 cameraRest 都在 2631ms；性能档没有请求 SoftShadows。两个档位都没有请求 shareShot（点击分享才 `import('./shareShot')`）。`preserveDrawingBuffer` 为 false（URL 没有 `keepDrawingBuffer=1`）
- 控制台冒烟：`window.__twinReady === true`，`pageerror` 为 0（均衡档与性能档各一次）
- `src/viewmarks/shareShot.test.ts` 9 项通过；`src/scene/gpuDetect.test.ts` 5 项通过

### hardGate 文件

| gzip9 | url |
| ---: | --- |
| 400094 | `/assets/index-DoYRiRnO.js` |
| 13577 | `/models/street-tree-hi.glb` |
| 5061 | `/models/roof-sign.glb` |
| 3666 | `/assets/index-DgSBdyaU.css` |
| 3466 | `/models/street-tree-lo.glb` |
| 3229 | `/models/east-grille-v4-lo.glb` |
| 2666 | `/models/street-lamp.glb` |
| 1709 | `/assets/shadowBake-BIDE4SLl.js` |
| 1436 | `/assets/shellClipCompile-B-r5RLAU.js` |
| 1054 | `/assets/EastGrille-CW0LyrXp.js` |
| 340 | `/?q=balanced` |
