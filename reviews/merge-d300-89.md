# D300 merge #89（T085 Screen Wake Lock）

| 项 | 值 |
| --- | --- |
| PR | [#89](https://github.com/lenaelelle672-beep/uniview-twin/pull/89) T085：大屏常亮（kiosk / demo，懒加载） |
| pre / base SHA | `4692b522f2024e966fce5063441fe6286b54557d` |
| PR head / tip SHA | `59b28ee1d8ceb538089ef011f43c8c9fb4bc7405` |
| merge SHA | `8f30347d2d57fe4ec57cbb96042c3194542c403d` |
| parents | `4692b522f2024e966fce5063441fe6286b54557d` `59b28ee1d8ceb538089ef011f43c8c9fb4bc7405` |
| hardGate | 436319（≤ 436361，余量 42）PASS |
| balancedFx | 104552（≤ 105000，余量 448）PASS |
| 相对合前 | +0 / +0 |
| twinReady | true |
| pageerror | 0 |
| console.error | 0 |
| 结论 | **PASS** |
| CloudAgent | `bc-4e246a43-5073-516a-a999-0f73907b1e3e` |

本文件是 merge 之后单独的合口证。parent 是 merge commit `8f30347d2d57fe4ec57cbb96042c3194542c403d`。只加这一份说明，没有产品代码。

## 合并

合并前 `origin/main` 与 PR `baseRefOid` 都是 `4692b522f2024e966fce5063441fe6286b54557d`。PR head `59b28ee1d8ceb538089ef011f43c8c9fb4bc7405` 的父提交就是这个 base。当时 DRAFT、OPEN、MERGEABLE、`mergeStateStatus` CLEAN。标 ready 之后再查了一次：`isDraft` 变成 false，`headRefOid` 没有变，`mergeable` 仍是 MERGEABLE，`mergeStateStatus` 仍是 CLEAN。没有 force，没有改 feature 分支 tip，没有删分支。

```
gh pr view 89 --json state,isDraft,mergeable,mergeStateStatus,headRefOid,baseRefOid
gh pr ready 89
gh pr merge 89 --merge --match-head-commit 59b28ee1d8ceb538089ef011f43c8c9fb4bc7405
```

GitHub 状态是 **MERGED**，`mergedAt` 2026-10-29T04:58:47Z。`mergeCommit` 是 `8f30347d2d57fe4ec57cbb96042c3194542c403d`。两个父提交按顺序是 base `4692b522f2024e966fce5063441fe6286b54557d` 与 tip `59b28ee1d8ceb538089ef011f43c8c9fb4bc7405`。merge 树与 PR head 树相同（`5dab1f63b6d3310a8c6672bd90b6375d7b11e952`）。`package.json` 与 `package-lock.json` 相对合前 0 diff。

`origin/integration` 仍停在 `be8303022a4733060f77ebb1cc83897d20b94aa8`。这次只把证据推到 `main`，没有快进 integration。

## 门禁

在 merge 提交 `8f30347d2d57fe4ec57cbb96042c3194542c403d` 上 `npm ci`，然后 `SHADER_PREWARM=false npm run build`。`vite preview --port 5190`，再跑 `node scripts/measure-first-screen.mjs http://127.0.0.1:5190 merge89`，均衡档 1366×768，Python `gzip.compress(9)`。脚本 `ok: true`，`failures` 为空。性能档总览没有请求 balancedFx。合前基线 `4692b52` 为 436319 / 104552。

- **hardGate 436319** ≤ 436361，余量 42，**PASS**（相对合前 +0）
- **balancedFx 104552** ≤ 105000，余量 448，**PASS**（相对合前 +0）
- 性能档首屏 hardGate 口径 422742（合前 422742，+0）。少掉的是均衡档才拉的 `street-tree-hi.glb`（gzip9 13577）：436319 − 13577 = 422742。性能档没有 balancedFx，也没有 `WakeLock.js`
- 合口证 #90 记录当时产物 180 个。这次 dist 181 个。多出来的是 `WakeLock.js`。入口、balancedFx、`index.html`、`AlarmNotify.js` 与 #90 公布的哈希逐字节相同。变了的只有 `dock-nsaIj73.js`，而且只在末尾多了常亮接线
- 入口 `index-DR969EVf.js` raw 1413239，gzip9 400115，sha256 `b56ded3cb3ae7a2fae78d7699ef86452fa3d0b1b4bd39269db1828fb55ed9321`。与合前逐字节相同。`WakeLock`、`mountScreenWakeLock`、`wakeLock`、`__twinWakeLock`、`wake-lock/mount` 都是 0 处
- `balancedFx-BB0zAHf.js` raw 246234，gzip9 104552，sha256 `659559f1ef3808fa5b50c2dc69a8d41b993a61f680280777bdcab4f8ecba5710`。与合前逐字节相同。上面这些名字也是 0 处
- `index.html` raw 483，gzip9 341，sha256 `b76aba44d6cbcc015a75fe2411d223c3153c688b0bfb3f992ca7b782c6fcaf60`。与合前逐字节相同
- `EastGrille-qSYZ9dB.js`、`shellClipCompile-jy31OgF.js`、`shadowBake-BIDE4SL.js`、`index-DgSBdyaU.css` 仍在原有门禁位置，gzip9 与合前表一致。测量窗口的 hardGate 文件里没有 `WakeLock.js`、`dock-nsaIj73.js`
- `dock-nsaIj73.js` 文件名不变。合前 raw 16246、gzip9 6188、sha256 `5bdb09d989b76bc37bf013033de879730444277d322d0a7386138488dc882bc2`。现在 raw 16314、gzip9 6201、sha256 `461ea8c59ce83e4e4bab09d39da28b364232112e457017d3020ac5f78b8f11c1`。多出来的 68 字节是末尾 `void import("./WakeLock.js").then((m)=>{m.mountScreenWakeLock()});`，前后各一个换行。删掉这 68 字节后 sha256 回到合前。dist 里引用 `./WakeLock.js` 的只有这一处。dock 里没有 `navigator.wakeLock`。不在 hardGate 里。gzip9 6201 大于余量 42
- `WakeLock.js` raw 5123，gzip9 2039，sha256 `d9470626f87af4e5a42477724eca1f8deca6e644338b880bf3f348050453a09e`。`mountScreenWakeLock`、`navigator.wakeLock`、`request("screen")`、`visibilitychange`、`.release(` 都在。`request("screen")` 与 `navigator.wakeLock` 全 dist 只在这一份。没有 three，没有 zustand，没有 `WebGLRenderer`，没有 howler，没有 MediaRecorder。不在 hardGateFiles 里，也不在 balancedFx 里。gzip9 2039 大于余量 42
- `AlarmNotify.js` 与合前逐字节相同：raw 6961，gzip9 2909，sha256 `662e7cf2fddc80d390ebe6a3f56c68cd4c29097fe3796d244a9c6c20d5d843e2`

测量窗口（`__twinReady` 后再等 1500ms）没有请求 `WakeLock.js` 或 dock。另一次记录里，按钮出现之后，相对 `__twinFirstFrameAt`：均衡档 1366，dock 在首帧后 2613ms，`WakeLock.js` 在 2642ms。性能档 dock 在 2615ms，`WakeLock.js` 在 2642ms，没有请求 balancedFx。`?wakeLock=1` dock 2612ms / WakeLock 2666ms，`?wakeLock=0` dock 2605ms / WakeLock 2655ms，`?demo=1` dock 2602ms / WakeLock 2629ms，`?demo=1&wakeLock=0` dock 2609ms / WakeLock 2635ms。都在首帧 cutoff 之外，由 dock 的晚加载 import 拉起。

默认总览（均衡档与性能档，1366×768，swiftshader，`__twinReady` 后再等 12000ms，以及按钮出现后再读一次）：`window.__twinReady === true`，`pageerror` 0，`console.error` 0。按钮文案是「常亮关」，`aria-pressed` 为 false，`aria-label` 为「保持屏幕常亮」，title 为「保持屏幕常亮。再点一次关闭」。`window.__twinWakeLock` 为 `{ enabled: false, held: false, phase: "off", supported: true, visible: true, forceOff: false }`。没有进入全屏。性能档这次没有请求 `balancedFx-BB0zAHf.js`。

`/?q=balanced&wakeLock=1`：地址栏被收成 `/?q=balanced`。同样 `twinReady` true，`pageerror` 0，`console.error` 0。探针为 `{ enabled: true, held: true, phase: "held", supported: true, visible: true, forceOff: false }`。单独打开 `/?wakeLock=1` 时地址栏收成 `/`，按钮是「常亮开」，`aria-pressed` 为 true，`aria-label` 为「关闭屏幕常亮」，title 为「屏幕保持常亮。再点一次关闭」。

`/?wakeLock=0` 与 `/?demo=1&wakeLock=0`：地址栏收成 `/`。`twinReady` true，`pageerror` 0，`console.error` 0。按钮禁用，文案「常亮关」，title 为「地址栏带 ?wakeLock=0，已关闭常亮」。探针 `enabled` 为 false，`forceOff` 为 true。

`/?demo=1`：地址栏收成 `/`。`twinReady` true，`pageerror` 0，`console.error` 0。不用再点，按钮已经是「常亮开」，探针 `held` 为 true，阶段 `held`。

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
