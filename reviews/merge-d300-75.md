# D300 merge #75（T071 MotionPathControls）

| 项 | 值 |
| --- | --- |
| pre SHA | `684593c004525276b4a7d7e26a5d0067497b9371` |
| merge SHA | `9f4a46d066b4163a7eea786e16adcb4b5c8dae6f` |
| parents | `684593c004525276b4a7d7e26a5d0067497b9371` `ef838dd8d6a954cd669d545a07a5ce33c783d565` |
| PR head | `ef838dd8d6a954cd669d545a07a5ce33c783d565` |
| hardGate | 436320（≤ 436361，余量 41）PASS |
| balancedFx | 104552（≤ 105000，余量 448）PASS |
| twinReady | true |
| pageerror | 0 |
| CloudAgent | `bc-ceb80ae5-4b97-51bc-b38f-dbbc7e26d8a2` |

本文件按 `reviews/merge-d300-70.md` / `reviews/merge-d300-71.md` / `reviews/merge-d300-72.md` / `reviews/merge-d300-73.md` / `reviews/merge-d300-74.md` / `reviews/merge-d300-76.md` 的字段来写：合并前 SHA、merge SHA、parents、门禁数字、twinReady / pageerror、CloudAgent id。

## 合并

合并前 `origin/main` 是 `684593c004525276b4a7d7e26a5d0067497b9371`。PR #75 的 `headRefOid` 是 `ef838dd8d6a954cd669d545a07a5ce33c783d565`。合并前 `isDraft` 为 true，`state` 为 OPEN，`mergeable` 为 MERGEABLE，`mergeStateStatus` 为 CLEAN。草稿已标为 ready。标成 ready 之后再查了一次：`headRefOid` 仍是 `ef838dd8d6a954cd669d545a07a5ce33c783d565`，`baseRefOid` 仍是 `684593c004525276b4a7d7e26a5d0067497b9371`。没有改写这条 tip。

`gh pr merge` 没有 `--no-ff` 开关。用的是 merge commit 策略（不是 squash，不是 rebase），并锁了 `--match-head-commit ef838dd8d6a954cd669d545a07a5ce33c783d565`：

```
gh pr ready 75 --repo lenaelelle672-beep/uniview-twin
gh pr merge 75 --repo lenaelelle672-beep/uniview-twin --merge --match-head-commit ef838dd8d6a954cd669d545a07a5ce33c783d565
```

没有 force-push。GitHub [PR #75](https://github.com/lenaelelle672-beep/uniview-twin/pull/75) 状态是 **MERGED**，`mergeCommit` 是 `9f4a46d066b4163a7eea786e16adcb4b5c8dae6f`（`mergedAt` 2026-10-25T08:10:04Z）。两个父提交是 `684593c004525276b4a7d7e26a5d0067497b9371` 与 `ef838dd8d6a954cd669d545a07a5ce33c783d565`。merge 树与 PR head 树相同（`709f782584e70ad2e7596e16959469616f596159`）。

`origin/integration` 停在 `be8303022a4733060f77ebb1cc83897d20b94aa8`（PR #61 的证据提交），是 `main` 的祖先。到这次证据提交，`git rev-list --count origin/integration..main` 是 39。#62 之后的 merge-d300 证据只推 `main`，没有把 integration 快进到 main。这次同样只推 `main`。

门禁跑在 merge 提交上。本说明是紧随其后的一次提交，只加这个证据文件，不含产品代码，parent 是该 merge commit。

## 门禁

在 `9f4a46d066b4163a7eea786e16adcb4b5c8dae6f` 上 `npm ci`，然后 `SHADER_PREWARM=false npm run build`。`vite preview --port 5190`，再跑 `scripts/measure-first-screen.mjs`，均衡档 1366×768，Python `gzip.compress(9)`。脚本 `ok: true`，`failures` 为空。性能档总览没有请求 balancedFx。相对合前基线 436320 / 104552。

- **hardGate 436320** ≤ 436361，余量 41，**PASS**（相对合前基线 436320 / 104552 为 +0 / +0）
- **balancedFx 104552** ≤ 105000，余量 448，**PASS**
- 性能档总览没有请求 balancedFx（gzip 0），也没有 `street-tree-hi.glb`，也没有 `TreeLod-*.js`，也没有 `BatchSegments.js`，也没有 `MotionPathPlayer.js`。性能档首屏 hardGate 口径 422743（合前 422743，同为 +0）。少掉的正是均衡档才拉的 `street-tree-hi.glb`（gzip9 13577）：436320 − 13577 = 422743
- 入口 `index-0ImjlkmT.js` raw 1413239，gzip9 400118，sha256 `34895e3217dfd62cefa9d0a2a19be7681660ad2897fd27016dd86db42fdda5d7`。gzip9 与合前入口相同，内容哈希也相同（文件名仍是 `index-0ImjlkmT.js`）。入口里 `MotionPathControls`、`useMotion`、`TourMotionPath`、`tour-path`、`MotionPathPlayer`、`BatchSegments`、`SegmentMount`、`segments/mount`、`mountBatchSegments`、`TreeLod`、`Detailed-`、`useDetailedLevel`、`WallDecals`、`DecalMount` 都是 0 处。`street-tree-hi` 仍是 1 处，精细树仍在首屏 hardGate 里
- `balancedFx-ptY95sN.js` raw 246234，gzip9 104552，sha256 `4c2ac6d8e90a36b7f2a39e121b244a218db2c4f3572c1e3340e88a1b51418fd6`。gzip9 与合前相同，内容哈希也相同（文件名仍是 `balancedFx-ptY95sN.js`）。`balancedFx` 里 `MotionPathControls`、`useMotion`、`TourMotionPath`、`tour-path`、`BatchSegments`、`SegmentMount`、`TreeLod` 都是 0 处
- `index.html` raw 483，gzip9 341，sha256 `6085225041545f05a1a451b98deaa730dfb28aa7216fee392760e17bba705769`。合前 raw、gzip9、内容哈希都相同。测量窗口里 `/?q=balanced` 的 gzip9 也是 341
- `MotionPathPlayer.js` raw 145823，gzip9 42324，sha256 `8eeabe1425793eab6ef9b2136c3af6a248675f2baf10d552e2ea5de0d5ddf78e`。外部 import 只有 `./index-0ImjlkmT.js`。`MotionPathControls` 1 处，`useMotion` 1 处，`TourMotionPath` 3 处。不在 hardGate 文件里。默认总览不请求它
- `SegmentMount.js` raw 8844，gzip9 3553，sha256 `ea4d8e0fd1627448de1ac9693d187ff9392de9dd0f278f32c2fb21d59a50edcc`。`BatchSegments.js` raw 22370，gzip9 7298，sha256 `3e17a94c831868a442535d7c9d3e9d38e903c7ea04188c249cbca7781edf6b00`。两份与合前相同，都不在 hardGate 文件里。默认总览不请求 `BatchSegments.js`
- `dock-B634wVf.js` raw 15318，gzip9 6003，sha256 `be6b540a8a3eeb19aa5e7aea810a8fb0a3bbe8a402e818702cf0e1b54a8fd94a`。文件名仍是合前的 `dock-B634wVf.js`（哈希在接上沿轨引导之前定稿）。合前 raw 12669、gzip9 5295、sha256 `ad3093164d98b57be08ec3a263097b50a61e1675641c8fa7002d30a0fb5abd31`。多出来的是哈希之后接上的沿轨引导：门关着直接返回，只有门开且点到导览才 `import("./MotionPathPlayer.js")`。`MotionPathControls`、`useMotion`、`TourMotionPath` 在 dock 里都是 0 处。不在 hardGate 文件里
- 锁机 cutoff 是首帧 + 64ms。另一次冒烟把页面留到 `__twinReady` 之后 12000ms：均衡档 dock、floorDecor 在首帧后 2611ms，textRuntime 在 2612ms，Detailed 在 2623ms，DecalMount 与 SegmentMount 在 2635ms，LayerPanel 在 2646ms，TreeLod 在 2915ms。`street-tree-hi.glb` 与 `street-tree-lo.glb`、balancedFx 都在首帧之前。这次没有请求 `MotionPathPlayer.js`。性能档 dock、floorDecor 都在 2601ms，textRuntime 在 2602ms，Detailed 在 2614ms，SegmentMount 与 DecalMount 都在 2622ms，LayerPanel 在 2626ms。性能档这次没有请求 balancedFx、`street-tree-hi.glb`、TreeLod、`BatchSegments.js`、`MotionPathPlayer.js`。两个总览档位的这些后到分包都在 cutoff 之外。默认 `window.__twinMotionPath` 为 null。默认 `window.__twinSegments` 为 `{ on: false, mounted: false, shown: 0, limit: 48, dropped: 0, source: "off", floorId: null }`
- 控制台冒烟：均衡档与性能档各一次，`window.__twinReady === true`，`pageerror` 为 0，`console.error` 为 0。视口 1366×768，swiftshader

结论：**PASS**。

### hardGate 文件

| gzip9 | url |
| ---: | --- |
| 400118 | `/assets/index-0ImjlkmT.js` |
| 13577 | `/models/street-tree-hi.glb` |
| 5061 | `/models/roof-sign.glb` |
| 3666 | `/assets/index-DgSBdyaU.css` |
| 3466 | `/models/street-tree-lo.glb` |
| 3229 | `/models/east-grille-v4-lo.glb` |
| 2666 | `/models/street-lamp.glb` |
| 1709 | `/assets/shadowBake-BIDE4SL.js` |
| 1433 | `/assets/shellClipCompile-ZyBuKyH.js` |
| 1054 | `/assets/EastGrille-D5B6AXe.js` |
| 341 | `/?q=balanced` |
