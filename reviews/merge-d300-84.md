# D300 merge #84（T083 Picture-in-Picture）

| 项 | 值 |
| --- | --- |
| PR | [#84](https://github.com/lenaelelle672-beep/uniview-twin/pull/84) T083：手势触发的画中画值守 |
| pre / base SHA | `8495dbd8276ea0b4f041060693762ee8fd410a50` |
| PR head / tip SHA | `09f4d4e50918e63c8115708850002a0582b1d2b0` |
| merge SHA | `e4251b5e59d511e0f5df5d23abfb46c2160a9917` |
| parents | `8495dbd8276ea0b4f041060693762ee8fd410a50` `09f4d4e50918e63c8115708850002a0582b1d2b0` |
| hardGate | 436319（≤ 436361，余量 42）PASS |
| balancedFx | 104552（≤ 105000，余量 448）PASS |
| 相对合前 | +0 / +0 |
| twinReady | true |
| pageerror | 0 |
| console.error | 0 |
| 结论 | **PASS** |
| CloudAgent | `bc-281088ce-b3b4-5014-9269-c1dc1753d3a8` |

本文件是 merge 之后单独的合口证。parent 是 merge commit `e4251b5e59d511e0f5df5d23abfb46c2160a9917`。只加这一份说明，没有产品代码。

## 合并

合并前 `origin/main` 是 `8495dbd8276ea0b4f041060693762ee8fd410a50`。PR head `09f4d4e50918e63c8115708850002a0582b1d2b0`，当时 DRAFT、OPEN、MERGEABLE、`mergeStateStatus` CLEAN。标 ready 之后再查了一次：`isDraft` 变成 false，`headRefOid` 没有变，`mergeable` 仍是 MERGEABLE，`mergeStateStatus` 仍是 CLEAN。没有 force，没有改 feature 分支 tip。

```
gh pr ready 84
gh pr merge 84 --merge --match-head-commit 09f4d4e50918e63c8115708850002a0582b1d2b0
```

GitHub 状态是 **MERGED**，`mergedAt` 2026-10-28T12:48:48Z。`mergeCommit` 是 `e4251b5e59d511e0f5df5d23abfb46c2160a9917`。两个父提交按顺序是 base `8495dbd8276ea0b4f041060693762ee8fd410a50` 与 tip `09f4d4e50918e63c8115708850002a0582b1d2b0`。merge 树与 PR head 树相同（`4998d523eb94c0c3a8aafb404cc3b7f2effe1b08`）。`package.json` 与 `package-lock.json` 相对合前 0 diff。依赖没有新增。`@react-three/drei` 仍是 10.7.9。

`origin/integration` 仍停在 `be8303022a4733060f77ebb1cc83897d20b94aa8`。这次只把证据推到 `main`，没有快进 integration。

## 门禁

在 merge 提交 `e4251b5e59d511e0f5df5d23abfb46c2160a9917` 上 `npm ci`，然后 `SHADER_PREWARM=false npm run build`。`vite preview --port 5190`，再跑 `node scripts/measure-first-screen.mjs http://127.0.0.1:5190 balanced`，均衡档 1366×768，Python `gzip.compress(9)`。脚本 `ok: true`，`failures` 为空。性能档总览没有请求 balancedFx。合前基线 `8495dbd` 为 436319 / 104552。

- **hardGate 436319** ≤ 436361，余量 42，**PASS**（相对合前 +0）
- **balancedFx 104552** ≤ 105000，余量 448，**PASS**（相对合前 +0）
- 性能档首屏 hardGate 口径 422742（合前 422742，+0）。少掉的是均衡档才拉的 `street-tree-hi.glb`（gzip9 13577）：436319 − 13577 = 422742。性能档没有 balancedFx。测量窗口里也没有 `PipWatch.js`
- 同参重建合前 `8495dbd`：178 个产物。这次 179 个。177 个既有产物逐字节相同。变了的是 `dock-nsaIj73.js`。多出来的是 `PipWatch.js`
- 入口 `index-DR969EVf.js` raw 1413239，gzip9 400115，sha256 `b56ded3cb3ae7a2fae78d7699ef86452fa3d0b1b4bd39269db1828fb55ed9321`。与合前逐字节相同。`PipWatch`、`mountPipWatch`、`requestPictureInPicture`、`captureStream`、`nopip` 都是 0 处
- `balancedFx-BB0zAHf.js` raw 246234，gzip9 104552，sha256 `659559f1ef3808fa5b50c2dc69a8d41b993a61f680280777bdcab4f8ecba5710`。与合前逐字节相同。上面这些名字也是 0 处
- `index.html` raw 483，gzip9 341，sha256 `b76aba44d6cbcc015a75fe2411d223c3153c688b0bfb3f992ca7b782c6fcaf60`。与合前逐字节相同
- `EastGrille-qSYZ9dB.js`、`shellClipCompile-jy31OgF.js`、`shadowBake-BIDE4SL.js`、`index-DgSBdyaU.css` 与五份首屏模型都与合前逐字节相同，仍在原有门禁位置。测量窗口的 hardGate 文件里没有 `PipWatch.js`、`dock-nsaIj73.js`
- `dock-nsaIj73.js` 文件名不变。合前 raw 16089、gzip9 6160、sha256 `c90effce94e7f32a1aade969b291595e3d5505d587418bc7d2c7fd7d4081f134`。现在 raw 16151、gzip9 6172、sha256 `bb5cb844bae24b2e1bc6ca315b1f1670df844cdfdf0a9f7b69d605a82cdae2da`。多出来的 62 字节是 `void import("./PipWatch.js").then((m)=>{m.mountPipWatch()});`（前后各一个换行）。删掉这 62 字节后 sha256 回到合前。不在 hardGate 里。gzip9 6172 大于余量 42。均衡档在首帧后 2604ms 请求 dock，性能档在 2616ms
- `PipWatch.js` raw 6162，gzip9 2432，sha256 `6f6a1f121b1e07b41762aae5f43bb222ca20615465d58297bcaec8e10482136d`。`mountPipWatch`、`requestPictureInPicture`、`captureStream`、`nopip` 都在。没有 howler，没有 zustand，没有 MediaRecorder。不在 hardGateFiles 里，也不在 balancedFx 里。gzip9 2432 大于余量 42。均衡档在首帧后 2674ms 才请求它，性能档在 2635ms，`?nopip=1` 在 2662ms，都在首帧 cutoff 之外，由 dock 的晚加载 import 拉起

默认总览（均衡档与性能档，1366×768，swiftshader，`__twinReady` 后再等 12000ms）：`window.__twinReady === true`，`pageerror` 0，`console.error` 0。按钮文案是「画中画」，`aria-pressed` 为 false，`aria-label` 为「画中画值守」。性能档这次没有请求 `balancedFx-BB0zAHf.js`。

`/?q=balanced&nopip=1`：地址栏被收成 `/?q=balanced`，导航记录仍是原始地址。同样 `twinReady` true，`pageerror` 0，`console.error` 0。按钮是「画中画」，`aria-pressed` 为 false，`disabled` 为 true，title 为「地址栏带 ?nopip=1，已关闭画中画」。

结论：**PASS**。

### hardGate 文件

| gzip9 | url |
| ---: | --- |
| 400115 | `/assets/index-DR969EVf.js` |
| 13577 | `/models/street-tree-hi.glb` |
| 5061 | `/models/roof-sign.glb` |
| 3666 | `/assets/index-DgSBdyaU.css` |
| 3466 | `/models/street-tree-lo.glb` |
| 3229 | `/models/east-grille-v4-lo.glb` |
| 2666 | `/models/street-lamp.glb` |
| 1709 | `/assets/shadowBake-BIDE4SL.js` |
| 1434 | `/assets/shellClipCompile-jy31OgF.js` |
| 1055 | `/assets/EastGrille-qSYZ9dB.js` |
| 341 | `/?q=balanced` |
