# D300 merge #57（T050 orientation Gizmo）

| 项 | 值 |
| --- | --- |
| pre SHA | `227c1603829797446c27b4853f2dcd5a6d862928` |
| merge SHA | `2fb254e8a5da2f79a8b0333ab6d3a2cdab065a67` |
| parents | `227c1603829797446c27b4853f2dcd5a6d862928` `e55fa956ff84ada33531455fc1e6025245a1d17e` |
| PR head | `e55fa956ff84ada33531455fc1e6025245a1d17e` |
| hardGate | 436299（≤ 436361，余量 62）PASS |
| balancedFx | 104552（≤ 105000，余量 448）PASS |
| twinReady | true |
| pageerror | 0 |
| CloudAgent | `bc-e1cb223d-6733-5e9c-aa37-f121d3cdbb82` |

本文件按 `reviews/merge-d300-54.md` 的字段来写：合并前 SHA、merge SHA、parents、门禁数字、twinReady / pageerror、CloudAgent id。

## 合并

合并前 `origin/main` 与 `origin/integration` 都是 `227c1603829797446c27b4853f2dcd5a6d862928`。PR #57 的 `headRefOid` 是 `e55fa956ff84ada33531455fc1e6025245a1d17e`，其父提交就是这条基线。草稿已标为 ready。

```
git merge --no-ff e55fa956ff84ada33531455fc1e6025245a1d17e -m "Merge PR #57: T050 orientation Gizmo (e55fa956)"
```

先推 `main`，再把 `integration` 快进到同一 merge SHA。没有 force-push，没有 squash，没有 rebase。

GitHub [PR #57](https://github.com/lenaelelle672-beep/uniview-twin/pull/57) 状态是 **MERGED**，`mergeCommit` 是 `2fb254e8a5da2f79a8b0333ab6d3a2cdab065a67`（`mergedAt` 2026-10-22T14:27:46Z）。

门禁跑在 merge 提交上。本说明是紧随其后的一次提交，`main` 与 `integration` 一起快进，两条引用保持相同。

## 门禁

`npm ci`，然后 `SHADER_PREWARM=false npm run build`。`scripts/measure-first-screen.mjs`，均衡档 1366×768，Python `gzip.compress(9)`。

- **hardGate 436299** ≤ 436361，余量 62，**PASS**（相对 T053 合并后基线 436051，+248）
- **balancedFx 104552** ≤ 105000，余量 448，**PASS**（与基线 104552 相同）
- 性能档总览没有请求 balancedFx（gzip 0）
- 入口 `index-CTRsdY8O.js` raw 1413144，gzip9 400093
- `balancedFx-IjfJt9cr.js` raw 246234，gzip9 104552
- hardGate 文件里没有 OrientationGizmo、DemandLoop、SoftShadows、cameraRest、frameSchedule、FocusFloatCard。测量窗口（`__twinReady` 后再等 1500ms）也没有请求这几块
- 锁机 cutoff 是首帧 + 64ms。另一次冒烟把页面留到首帧后约 4.5s：均衡档 DemandLoop 在首帧后 2608ms，OrientationGizmo 在首帧后 2911ms，都在 cutoff 之外。性能档同样在首帧后 2609ms / 2913ms。`preserveDrawingBuffer` 为 false（URL 没有 `keepDrawingBuffer=1`）
- 控制台冒烟：`window.__twinReady === true`，`pageerror` 为 0

### hardGate 文件

| gzip9 | url |
| ---: | --- |
| 400093 | `/assets/index-CTRsdY8O.js` |
| 13577 | `/models/street-tree-hi.glb` |
| 5061 | `/models/roof-sign.glb` |
| 3666 | `/assets/index-DgSBdyaU.css` |
| 3466 | `/models/street-tree-lo.glb` |
| 3229 | `/models/east-grille-v4-lo.glb` |
| 2666 | `/models/street-lamp.glb` |
| 1709 | `/assets/shadowBake-BIDE4SLl.js` |
| 1436 | `/assets/shellClipCompile-DzlmT_t8.js` |
| 1055 | `/assets/EastGrille-BtKJheAu.js` |
| 341 | `/?q=balanced` |
