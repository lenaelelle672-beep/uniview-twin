# D300 merge #54（T053 focus Html float card）

| 项 | 值 |
| --- | --- |
| pre SHA | `84b98cd8367a1dfaf74bd4c6a7db3af5fb043bea` |
| merge SHA | `c5a1a587a97d81d6f5846c559e772228fd9c80c7` |
| parents | `84b98cd8367a1dfaf74bd4c6a7db3af5fb043bea` `dcf4b34bbd36d1d75717a13ec0485b7af327e09d` |
| PR head | `dcf4b34bbd36d1d75717a13ec0485b7af327e09d` |
| hardGate | 436051（≤ 436361，余量 310）PASS |
| balancedFx | 104552（≤ 105000，余量 448）PASS |
| twinReady | true |
| pageerror | 0 |
| CloudAgent | `bc-20902757-3951-5e28-9f79-aed8a162e8ea` |

仓库里没有 `reviews/merge-d300-49.md`。本文件按该次合并要记录的字段来写：合并前 SHA、merge SHA、parents、门禁数字、twinReady / pageerror、CloudAgent id。

## 合并

合并前 `origin/main` 与 `origin/integration` 都是 `84b98cd8367a1dfaf74bd4c6a7db3af5fb043bea`。PR #54 的 `headRefOid` 是 `dcf4b34bbd36d1d75717a13ec0485b7af327e09d`，其父提交就是这条基线。草稿已标为 ready。

```
git merge --no-ff dcf4b34bbd36d1d75717a13ec0485b7af327e09d -m "Merge PR #54: T053 focus Html float card (dcf4b34)"
```

先推 `main`，再把 `integration` 快进到同一 merge SHA。没有 force-push，没有 squash，没有 rebase。

GitHub [PR #54](https://github.com/lenaelelle672-beep/uniview-twin/pull/54) 状态是 **MERGED**，`mergeCommit` 是 `c5a1a587a97d81d6f5846c559e772228fd9c80c7`（`mergedAt` 2026-10-22T13:39:25Z）。

门禁跑在 merge 提交上。本说明是紧随其后的一次提交，`main` 与 `integration` 一起快进，两条引用保持相同。

## 门禁

`npm ci`，然后 `SHADER_PREWARM=false npm run build`。`scripts/measure-first-screen.mjs`，均衡档 1366×768，Python `gzip.compress(9)`。

- **hardGate 436051** ≤ 436361，余量 310，**PASS**
- **balancedFx 104552** ≤ 105000，余量 448，**PASS**
- 性能档总览没有请求 balancedFx（gzip 0）
- 入口 `index-Ditb7WbR.js` raw 1412345，gzip9 399847
- `balancedFx-DLuqp8si.js` raw 246234，gzip9 104552
- hardGate 文件和首帧截止里没有 SoftShadows、DemandLoop、cameraRest、frameSchedule、FocusFloatCard（这几块在测量窗口里也没有被请求）
- 控制台冒烟：`window.__twinReady === true`，`pageerror` 为 0

### hardGate 文件

| gzip9 | url |
| ---: | --- |
| 399847 | `/assets/index-Ditb7WbR.js` |
| 13577 | `/models/street-tree-hi.glb` |
| 5061 | `/models/roof-sign.glb` |
| 3666 | `/assets/index-DgSBdyaU.css` |
| 3466 | `/models/street-tree-lo.glb` |
| 3229 | `/models/east-grille-v4-lo.glb` |
| 2666 | `/models/street-lamp.glb` |
| 1709 | `/assets/shadowBake-BIDE4SLl.js` |
| 1435 | `/assets/shellClipCompile-BkUqe5El.js` |
| 1055 | `/assets/EastGrille-BTRfm3_E.js` |
| 340 | `/?q=balanced` |
