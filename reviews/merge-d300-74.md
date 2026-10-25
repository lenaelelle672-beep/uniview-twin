# D300 merge #74（T073 Detailed LOD）

| 项 | 值 |
| --- | --- |
| pre SHA | `48d9e4c0ae30537017b6f578ac08af4a19149c39` |
| merge SHA | `577245e6a6d6cea1291e1ca3e00302773b0c0a97` |
| parents | `48d9e4c0ae30537017b6f578ac08af4a19149c39` `f57261233daa670dd352edfeacb266445bc13249` |
| PR head | `f57261233daa670dd352edfeacb266445bc13249` |
| hardGate | 436320（≤ 436361，余量 41）PASS |
| balancedFx | 104552（≤ 105000，余量 448）PASS |
| twinReady | true |
| pageerror | 0 |
| CloudAgent | `bc-fa414e13-1f39-5c8f-b334-4364b0275137` |

本文件按 `reviews/merge-d300-70.md` / `reviews/merge-d300-71.md` / `reviews/merge-d300-72.md` / `reviews/merge-d300-73.md` 的字段来写：合并前 SHA、merge SHA、parents、门禁数字、twinReady / pageerror、CloudAgent id。

## 合并

合并前 `origin/main` 是 `48d9e4c0ae30537017b6f578ac08af4a19149c39`。PR #74 的 `headRefOid` 是 `f57261233daa670dd352edfeacb266445bc13249`。合并前 `isDraft` 为 true，`state` 为 OPEN，`mergeable` 为 MERGEABLE，`mergeStateStatus` 为 CLEAN。草稿已标为 ready。标成 ready 之后再查了一次：`headRefOid` 仍是 `f57261233daa670dd352edfeacb266445bc13249`，`baseRefOid` 仍是 `48d9e4c0ae30537017b6f578ac08af4a19149c39`。没有改写这条 tip。

`gh pr merge` 没有 `--no-ff` 开关。用的是 merge commit 策略（不是 squash，不是 rebase），并锁了 `--match-head-commit f57261233daa670dd352edfeacb266445bc13249`：

```
gh pr ready 74 --repo lenaelelle672-beep/uniview-twin
gh pr merge 74 --repo lenaelelle672-beep/uniview-twin --merge --match-head-commit f57261233daa670dd352edfeacb266445bc13249
```

没有 force-push。GitHub [PR #74](https://github.com/lenaelelle672-beep/uniview-twin/pull/74) 状态是 **MERGED**，`mergeCommit` 是 `577245e6a6d6cea1291e1ca3e00302773b0c0a97`（`mergedAt` 2026-10-25T06:40:04Z）。两个父提交是 `48d9e4c0ae30537017b6f578ac08af4a19149c39` 与 `f57261233daa670dd352edfeacb266445bc13249`。merge 树与 PR head 树相同（`cbfb45bb6fdccb3133b44ca5612048438865e0c0`）。

`origin/integration` 停在 `be8303022a4733060f77ebb1cc83897d20b94aa8`（PR #61 的证据提交），是 `main` 的祖先，落后 30 个提交。#62 之后的 merge-d300 证据只推 `main`，没有把 integration 快进到 main。这次同样只推 `main`。

门禁跑在 merge 提交上。本说明是紧随其后的一次提交，只加这个证据文件，不含产品代码，parent 是该 merge commit。

## 门禁

在 `577245e6a6d6cea1291e1ca3e00302773b0c0a97` 上 `npm ci`，然后 `SHADER_PREWARM=false npm run build`。`vite preview --port 5190`，再跑 `scripts/measure-first-screen.mjs`，均衡档 1366×768，Python `gzip.compress(9)`。脚本 `ok: true`，`failures` 为空。性能档总览没有请求 balancedFx。相对合前基线 436322 / 104552。

- **hardGate 436320** ≤ 436361，余量 41，**PASS**（相对合前基线 436322 / 104552 为 −2 / +0）
- **balancedFx 104552** ≤ 105000，余量 448，**PASS**
- 性能档总览没有请求 balancedFx（gzip 0），也没有 `street-tree-hi.glb`，也没有 `TreeLod-*.js`。性能档首屏 hardGate 口径 422743（合前 422745，同为 −2）。少掉的正是均衡档才拉的 `street-tree-hi.glb`（gzip9 13577）：436320 − 13577 = 422743
- 入口 `index-0ImjlkmT.js` raw 1413239，gzip9 400118，sha256 `34895e3217dfd62cefa9d0a2a19be7681660ad2897fd27016dd86db42fdda5d7`。gzip9 与合前入口相同，内容哈希变了（合前文件名是 `index-B_0OL4ix.js`）。入口里 `TreeLod`、`Detailed-`、`useDetailedLevel`、`WallDecals`、`DecalMount` 都是 0 处。`street-tree-hi` 仍是 1 处，精细树仍在首屏 hardGate 里
- `balancedFx-ptY95sN.js` raw 246234，gzip9 104552，sha256 `4c2ac6d8e90a36b7f2a39e121b244a218db2c4f3572c1e3340e88a1b51418fd6`。gzip9 与合前相同，内容哈希变了（合前文件名是 `balancedFx-hTI5QIy.js`）。`balancedFx` 里 `TreeLod` 是 0 处
- `index.html` raw 483，gzip9 341，sha256 `6085225041545f05a1a451b98deaa730dfb28aa7216fee392760e17bba705769`。合前 raw 同样是 483、gzip9 是 343。hardGate 少的 2 字节就是这份 HTML。测量窗口里 `/?q=balanced` 的 gzip9 也是 341
- `TreeLod-BHL80Mw.js` raw 3479，gzip9 1610，sha256 `3daaec1be9f5b5a047c0797d01c1375591c14f4059e70b3628fd6a83484c7dcd`。`Detailed-DVZrXLF.js` raw 457，gzip9 326，sha256 `37f81971a77715278e0ab9cda279f6edf1bcceebb3968bbb951eb8eb45330b71`。两份都不在 hardGate 文件里
- 锁机 cutoff 是首帧 + 64ms。另一次冒烟把页面留到 `__twinReady` 之后 12000ms：均衡档 dock、floorDecor 在首帧后 2616ms，textRuntime 在 2617ms，Detailed 在 2627ms，DecalMount 在 2665ms，TreeLod 在 2919ms。`street-tree-hi.glb` 与 `street-tree-lo.glb`、balancedFx 都在首帧之前。性能档 dock、floorDecor、textRuntime 都在 2604ms，Detailed 在 2613ms，DecalMount 在 2620ms。性能档这次没有请求 balancedFx、`street-tree-hi.glb`、TreeLod。两个总览档位的这些后到分包都在 cutoff 之外
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
