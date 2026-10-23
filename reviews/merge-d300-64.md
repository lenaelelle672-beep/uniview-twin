# D300 merge #64（T061 Fullscreen lazy）

| 项 | 值 |
| --- | --- |
| pre SHA | `a2af7b793fda3e2ac2af1269faeb8c74df2f3af7` |
| merge SHA | `8b1dfc67bdb4ee7264d24553c952eb7b0e396d54` |
| parents | `a2af7b793fda3e2ac2af1269faeb8c74df2f3af7` `072c3284ff9bb424dc8ad2685ba36c21f179bf8a` |
| PR head | `072c3284ff9bb424dc8ad2685ba36c21f179bf8a` |
| hardGate | 436321（≤ 436361，余量 40）PASS |
| balancedFx | 104552（≤ 105000，余量 448）PASS |
| twinReady | true |
| pageerror | 0 |
| CloudAgent | `bc-000f43ab-9b85-5815-b760-c8e1f2298525` |

本文件按 `reviews/merge-d300-68.md` 的字段来写：合并前 SHA、merge SHA、parents、门禁数字、twinReady / pageerror、CloudAgent id。

## 合并

合并前 `origin/main` 是 `a2af7b793fda3e2ac2af1269faeb8c74df2f3af7`。PR #64 的 `headRefOid` 是 `072c3284ff9bb424dc8ad2685ba36c21f179bf8a`，`baseRefOid` 是 `a2af7b793fda3e2ac2af1269faeb8c74df2f3af7`，tip 的唯一父提交也是 `a2af7b793fda3e2ac2af1269faeb8c74df2f3af7`。`mergeable` 为 MERGEABLE，`mergeStateStatus` 为 CLEAN。草稿已标为 ready。没有改写这条 tip。

`gh pr merge` 没有 `--no-ff` 开关。用的是 merge commit 策略（不是 squash，不是 rebase），并锁了 `--match-head-commit 072c3284ff9bb424dc8ad2685ba36c21f179bf8a`：

```
gh pr ready 64 --repo lenaelelle672-beep/uniview-twin
gh pr merge 64 --repo lenaelelle672-beep/uniview-twin --merge --match-head-commit 072c3284ff9bb424dc8ad2685ba36c21f179bf8a
```

没有 force-push。GitHub [PR #64](https://github.com/lenaelelle672-beep/uniview-twin/pull/64) 状态是 **MERGED**，`mergeCommit` 是 `8b1dfc67bdb4ee7264d24553c952eb7b0e396d54`（`mergedAt` 2026-10-23T15:26:02Z）。两个父提交是 `a2af7b793fda3e2ac2af1269faeb8c74df2f3af7` 与 `072c3284ff9bb424dc8ad2685ba36c21f179bf8a`。

门禁跑在 merge 提交上。本说明是紧随其后的一次提交，只加这个证据文件，不含产品代码，parent 是该 merge commit。只推 `main`。

## 门禁

`npm ci`，然后 `SHADER_PREWARM=false npm run build`。`scripts/measure-first-screen.mjs`，均衡档 1366×768，Python `gzip.compress(9)`。下面是合入后在 merge commit 上的实测。相对合前基线 436322 / 104552。脚本 `ok: true`，`failures` 为空。性能档总览没有请求 balancedFx。

- **hardGate 436321** ≤ 436361，余量 40，**PASS**（相对合前 main / PR #68 合并后基线 436322 / 104552 为 −1 / 0。early index 的 raw 仍是 1413239，gzip9 400117 → 400119；`/?q=balanced` gzip9 342 → 339，净 −1）
- **balancedFx 104552** ≤ 105000，余量 448，**PASS**
- 性能档总览没有请求 balancedFx（gzip 0）；性能档首屏 hardGate 口径 422744（合前 422745，同为 −1）。少掉的正是均衡档才拉的 `street-tree-hi.glb`（gzip9 13577）：436321 − 13577 = 422744
- 入口 `index-Dz8VanOr.js` raw 1413239，gzip9 400119，sha256 `8213aca39fba396ba2d22794defa407aa3111f8ec1614d17352d61ca1f7c62e1`。入口里 `fullscreen-B_bU7bQ`、`requestFullscreen`、`toggleFullscreen`、`nofullscreen`、`全屏` 都是 0 处
- `balancedFx-DT5iqJk.js` raw 246234，gzip9 104552，sha256 `7e7b75c12a10f4065e57cc48b0de67ac6e3027fea0a85e10766dd47da982b2d5`。raw 与 gzip9 都与合前基线相同
- 全屏块 `assets/fullscreen-B_bU7bQ.js` raw 1387，gzip9 650，sha256 `fe113be6bdbfdcab7552310ac72bae6bde5313fe7c8eb542242024716c06c63a`。`dock-C8oQiGE.js` 里有指向它的动态 import（`fullscreen-B_bU7bQ` 出现 2 次）。它不在 hardGate 文件里
- 锁机 cutoff 是首帧 + 64ms。另一次冒烟把页面留到 `__twinReady` 之后 12000ms：均衡档 dock 在首帧后 2602ms，fullscreen 在 2634ms；性能档 dock 在 2605ms，fullscreen 在 2631ms。两边都在 cutoff 之外。性能档没有请求 balancedFx。测量窗口（`measure-first-screen.mjs`，`__twinReady` 后再等 1500ms）没有请求 `fullscreen-B_bU7bQ.js`，也没有请求 `dock-C8oQiGE.js`
- `package.json` 与 `package-lock.json` 相对合前 main 无差异
- 控制台冒烟：`window.__twinReady === true`，`pageerror` 为 0，`console.error` 为 0（均衡档与性能档各一次）

结论：**PASS**。

### hardGate 文件

| gzip9 | url |
| ---: | --- |
| 400119 | `/assets/index-Dz8VanOr.js` |
| 13577 | `/models/street-tree-hi.glb` |
| 5061 | `/models/roof-sign.glb` |
| 3666 | `/assets/index-DgSBdyaU.css` |
| 3466 | `/models/street-tree-lo.glb` |
| 3229 | `/models/east-grille-v4-lo.glb` |
| 2666 | `/models/street-lamp.glb` |
| 1709 | `/assets/shadowBake-BIDE4SL.js` |
| 1434 | `/assets/shellClipCompile-BTUOMCK.js` |
| 1055 | `/assets/EastGrille-DvzCbZ0.js` |
| 339 | `/?q=balanced` |
