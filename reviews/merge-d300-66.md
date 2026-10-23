# D300 merge #66（T059 Grid+Axes lazy）

| 项 | 值 |
| --- | --- |
| pre SHA | `f7211050d48a480dbd2434ceaf017d9749d7abb1` |
| merge SHA | `409f0f62d45695b02dad4da2ac09bb48dd928838` |
| parents | `f7211050d48a480dbd2434ceaf017d9749d7abb1` `c104a921753b4c017c0d3357b43a367ab8be43bc` |
| PR head | `c104a921753b4c017c0d3357b43a367ab8be43bc` |
| hardGate | 436321（≤ 436361，余量 40）PASS |
| balancedFx | 104552（≤ 105000，余量 448）PASS |
| twinReady | true |
| pageerror | 0 |
| CloudAgent | `bc-009427c6-77cd-5c7f-9bf9-376e12190404` |

本文件按 `reviews/merge-d300-64.md` / `reviews/merge-d300-68.md` 的字段来写：合并前 SHA、merge SHA、parents、门禁数字、twinReady / pageerror、CloudAgent id。

## 合并

合并前 `origin/main` 是 `f7211050d48a480dbd2434ceaf017d9749d7abb1`。PR #66 的 `headRefOid` 是 `c104a921753b4c017c0d3357b43a367ab8be43bc`，`baseRefOid` 是 `f7211050d48a480dbd2434ceaf017d9749d7abb1`，tip 的唯一父提交也是 `f7211050d48a480dbd2434ceaf017d9749d7abb1`。`mergeable` 为 MERGEABLE，`mergeStateStatus` 为 CLEAN。草稿已标为 ready。没有改写这条 tip。

`gh pr merge` 没有 `--no-ff` 开关。用的是 merge commit 策略（不是 squash，不是 rebase），并锁了 `--match-head-commit c104a921753b4c017c0d3357b43a367ab8be43bc`：

```
gh pr ready 66 --repo lenaelelle672-beep/uniview-twin
gh pr merge 66 --repo lenaelelle672-beep/uniview-twin --merge --match-head-commit c104a921753b4c017c0d3357b43a367ab8be43bc
```

没有 force-push。GitHub [PR #66](https://github.com/lenaelelle672-beep/uniview-twin/pull/66) 状态是 **MERGED**，`mergeCommit` 是 `409f0f62d45695b02dad4da2ac09bb48dd928838`（`mergedAt` 2026-10-23T15:55:54Z）。两个父提交是 `f7211050d48a480dbd2434ceaf017d9749d7abb1` 与 `c104a921753b4c017c0d3357b43a367ab8be43bc`。

门禁跑在 merge 提交上。本说明是紧随其后的一次提交，只加这个证据文件，不含产品代码，parent 是该 merge commit。只推 `main`。

## 门禁

`npm ci`，然后 `SHADER_PREWARM=false npm run build`。`scripts/measure-first-screen.mjs`，均衡档 1366×768，Python `gzip.compress(9)`。下面是合入后在 merge commit 上的实测。相对合前基线 436321 / 104552。脚本 `ok: true`，`failures` 为空。性能档总览没有请求 balancedFx。

- **hardGate 436321** ≤ 436361，余量 40，**PASS**（与合前 main / PR #64 合并后基线 436321 / 104552 相同，0 / 0）
- **balancedFx 104552** ≤ 105000，余量 448，**PASS**
- 性能档总览没有请求 balancedFx（gzip 0）；性能档首屏 hardGate 口径 422744。少掉的正是均衡档才拉的 `street-tree-hi.glb`（gzip9 13577）：436321 − 13577 = 422744
- 入口 `index-Dz8VanOr.js` raw 1413239，gzip9 400119，sha256 `8213aca39fba396ba2d22794defa407aa3111f8ec1614d17352d61ca1f7c62e1`。与 `reviews/merge-d300-64.md` 记录的合前构建逐字节相同。入口里 `GridMount`、`GridAxes`、`mountGridAxes`、`__twinGrid` 都是 0 处
- `balancedFx-DT5iqJk.js` raw 246234，gzip9 104552，sha256 `7e7b75c12a10f4065e57cc48b0de67ac6e3027fea0a85e10766dd47da982b2d5`。raw、gzip9 与 sha256 都与合前记录相同
- 格网开关 `assets/GridMount.js` raw 5685，gzip9 2396，sha256 `730b11b1de44d40ddaeff3a7a76bce1ac08ed2645021d57499700f14563712fb`。里面有 `./GridAxes.js`，没有 `gridMaterial` / `axesHelper`。drei 格网 `assets/GridAxes.js` raw 6893，gzip9 2659，sha256 `c3301faff185f39f7897d68bbef37d83e9c23b1b8177195cb0f20afeffbbb74d`，含 `gridMaterial` 与 `axesHelper`。两块都不在 hardGate 文件里
- `dock-C8oQiGE.js` 文件名与合前相同（哈希在把接线接回去之前就算完）。相对合前源码，`dock.tsx` 只多了会被生产构建在哈希前摘掉的 T059 接线。落盘文件末尾多了 63 字节：`void import("./GridMount.js").then((m)=>{m.mountGridAxes()});`。raw 12125，gzip9 5094
- `package.json` 与 `package-lock.json` 相对合前 main 无差异。产物里 0 个文件含 `ccapture`
- hardGate 文件里没有 GridMount、GridAxes、dock、fullscreen、ClipCapture、AlarmAudioCue、DemandLoop、frameSchedule。测量窗口（`__twinReady` 后再等 1500ms）也没有请求这几块
- 锁机 cutoff 是首帧 + 64ms。另一次冒烟把页面留到 `__twinReady` 之后 12000ms：均衡档 dock 在首帧后 2611ms，GridMount 在 2633ms；性能档 dock 在 2615ms，GridMount 在 2632ms。两边都在 cutoff 之外。性能档没有请求 balancedFx。两个档位在这 12s 里都没有请求 `GridAxes.js`。`window.__twinGrid` 为 `{ on: false, mounted: false, cellM: 1, sectionM: 10, axisM: 20, y: null, fadeM: null }`
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
