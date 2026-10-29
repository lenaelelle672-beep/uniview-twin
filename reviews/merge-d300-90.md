# D300 merge #90（T084 AlarmNotify）

| 项 | 值 |
| --- | --- |
| PR | [#90](https://github.com/lenaelelle672-beep/uniview-twin/pull/90) T084：告警桌面通知（文档 hidden 时弹一条） |
| pre / base SHA | `f601e5becb078d490e6adf4a27d68efac908993f` |
| PR head / tip SHA | `e2b8afd863c10d477ae5dfc9c17690dd5a1c2d48` |
| merge SHA | `905f62d0b09db0d9260000dd52856f1c7f8df0c8` |
| parents | `f601e5becb078d490e6adf4a27d68efac908993f` `e2b8afd863c10d477ae5dfc9c17690dd5a1c2d48` |
| hardGate | 436319（≤ 436361，余量 42）PASS |
| balancedFx | 104552（≤ 105000，余量 448）PASS |
| 相对合前 | +0 / +0 |
| twinReady | true |
| pageerror | 0 |
| console.error | 0 |
| 结论 | **PASS** |
| CloudAgent | `bc-9a45d423-da62-55aa-ac47-0184257b02be` |

本文件是 merge 之后单独的合口证。parent 是 merge commit `905f62d0b09db0d9260000dd52856f1c7f8df0c8`。只加这一份说明，没有产品代码。

## 合并

合并前 `origin/main` 与 PR `baseRefOid` 都是 `f601e5becb078d490e6adf4a27d68efac908993f`。PR head `e2b8afd863c10d477ae5dfc9c17690dd5a1c2d48` 的父提交就是这个 base。当时 DRAFT、OPEN、MERGEABLE、`mergeStateStatus` CLEAN。标 ready 之后再查了一次：`isDraft` 变成 false，`headRefOid` 没有变，`mergeable` 仍是 MERGEABLE，`mergeStateStatus` 仍是 CLEAN。没有 force，没有改 feature 分支 tip，没有删分支。

```
gh pr ready 90
gh pr merge 90 --merge --match-head-commit e2b8afd863c10d477ae5dfc9c17690dd5a1c2d48
```

GitHub 状态是 **MERGED**，`mergedAt` 2026-10-29T04:02:43Z。`mergeCommit` 是 `905f62d0b09db0d9260000dd52856f1c7f8df0c8`。两个父提交按顺序是 base `f601e5becb078d490e6adf4a27d68efac908993f` 与 tip `e2b8afd863c10d477ae5dfc9c17690dd5a1c2d48`。merge 树与 PR head 树相同（`52af7e9e564bd806a8d070b68ff337598704ce44`）。`package.json` 与 `package-lock.json` 相对合前 0 diff。

`origin/integration` 仍停在 `be8303022a4733060f77ebb1cc83897d20b94aa8`。这次只把证据推到 `main`，没有快进 integration。

## 门禁

在 merge 提交 `905f62d0b09db0d9260000dd52856f1c7f8df0c8` 上 `npm ci`，然后 `SHADER_PREWARM=false npm run build`。`vite preview --port 5190`，再跑 `node scripts/measure-first-screen.mjs http://127.0.0.1:5190 merge90`，均衡档 1366×768，Python `gzip.compress(9)`。脚本 `ok: true`，`failures` 为空。性能档总览没有请求 balancedFx。合前基线 `f601e5b` 为 436319 / 104552。

- **hardGate 436319** ≤ 436361，余量 42，**PASS**（相对合前 +0）
- **balancedFx 104552** ≤ 105000，余量 448，**PASS**（相对合前 +0）
- 性能档首屏 hardGate 口径 422742（合前 422742，+0）。少掉的是均衡档才拉的 `street-tree-hi.glb`（gzip9 13577）：436319 − 13577 = 422742。性能档没有 balancedFx，也没有 `AlarmNotify.js`
- 同参重建合前 `f601e5b`：179 个产物。这次 180 个。176 个既有产物逐字节相同。变了的是 `dock-nsaIj73.js`、`AlarmAudioCue.js`、`AlarmSpeech.js`。多出来的是 `AlarmNotify.js`
- 入口 `index-DR969EVf.js` raw 1413239，gzip9 400115，sha256 `b56ded3cb3ae7a2fae78d7699ef86452fa3d0b1b4bd39269db1828fb55ed9321`。与合前逐字节相同。`AlarmNotify`、`mountAlarmNotify`、`requestPermission`、`alarm-notify-toggle`、`twin-alarm`、`notifyCovers`、`__twinNotifyStore` 都是 0 处
- `balancedFx-BB0zAHf.js` raw 246234，gzip9 104552，sha256 `659559f1ef3808fa5b50c2dc69a8d41b993a61f680280777bdcab4f8ecba5710`。与合前逐字节相同。上面这些名字也是 0 处
- `index.html` raw 483，gzip9 341，sha256 `b76aba44d6cbcc015a75fe2411d223c3153c688b0bfb3f992ca7b782c6fcaf60`。与合前逐字节相同
- `EastGrille-qSYZ9dB.js`、`shellClipCompile-jy31OgF.js`、`shadowBake-BIDE4SL.js`、`index-DgSBdyaU.css`、`PipWatch.js` 与五份首屏模型都与合前逐字节相同，仍在原有门禁位置。测量窗口的 hardGate 文件里没有 `AlarmNotify.js`、`dock-nsaIj73.js`、`AlarmAudioCue.js`、`AlarmSpeech.js`
- `dock-nsaIj73.js` 文件名不变。合前 raw 16151、gzip9 6172、sha256 `bb5cb844bae24b2e1bc6ca315b1f1670df844cdfdf0a9f7b69d605a82cdae2da`。现在 raw 16246、gzip9 6188、sha256 `5bdb09d989b76bc37bf013033de879730444277d322d0a7386138488dc882bc2`。多出来的 95 字节是 `window.__twinNotifyStore=A;void import("./AlarmNotify.js").then((m)=>{m.mountAlarmNotify()});` 再加两个换行。删掉这 95 字节后 sha256 回到合前。dist 里引用 `./AlarmNotify.js` 的只有这一处。不在 hardGate 里。gzip9 6188 大于余量 42。均衡档默认总览在首帧后 3921ms 请求 dock，性能档在 2617ms，`?notify=1` 在 2613ms，`?notify=0` 在 2612ms
- `AlarmNotify.js` raw 6961，gzip9 2909，sha256 `662e7cf2fddc80d390ebe6a3f56c68cd4c29097fe3796d244a9c6c20d5d843e2`。`mountAlarmNotify`、`requestPermission`、`document.hidden`、`twin-alarm`、`notifyCovers` 都在。没有 howler，没有 zustand，没有 three，没有 `WebGLRenderer`，没有 MediaRecorder。不在 hardGateFiles 里，也不在 balancedFx 里。gzip9 2909 大于余量 42。均衡档默认总览在首帧后 3960ms 才请求它，性能档在 2653ms，`?notify=1` 在 2669ms，`?notify=0` 在 2675ms，都在首帧 cutoff 之外，由 dock 的晚加载 import 拉起
- `AlarmAudioCue.js` 与 `AlarmSpeech.js` 因为声道门闩多了 `notifyCovers`，晚加载分包各自打进自己的副本。提示音合前 raw 6743、gzip9 2724、sha256 `3e3f016c518fc6b9634df5f7ced1e486336166add4e914952f0dcfc8558dc63d`，现在 raw 6909、gzip9 2784、sha256 `ae3b56982ad2039df92f038e70a08e93393481eaa373bc9a504eede6bbe6f158`。语音合前 raw 7568、gzip9 3217、sha256 `624649b16b826aa28f9de13df6ab672e79f16b4449132b2bb33dde16ea8fab90`，现在 raw 7911、gzip9 3315、sha256 `1791a5ef2a6bf4702d033e4014c3b7648d2dd72af05546157ed9214b60b5314a`。两份都不在 hardGateFiles 里，也不在 balancedFx 里。gzip9 2784 与 3315 都大于余量 42。和 `AlarmNotify.js` 同一批，在首帧之后才请求

默认总览（均衡档与性能档，1366×768，swiftshader，`__twinReady` 后再等 12000ms）：`window.__twinReady === true`，`pageerror` 0，`console.error` 0。按钮文案是「通知关」，`aria-pressed` 为 false，`aria-label` 为「告警桌面通知」，title 为「桌面通知关着」。`window.__twinAlarmNotify` 为 `{ enabled: false, permission: "default", supported: true, hidden: false, shown: 0, lastBody: null }`。性能档这次没有请求 `balancedFx-BB0zAHf.js`。

`/?q=balanced&notify=1`：地址栏被收成 `/?q=balanced`。同样 `twinReady` true，`pageerror` 0，`console.error` 0。按钮是「通知」，`aria-pressed` 为 true，title 为「点一下才会向浏览器请求通知权限」。探针为 `{ enabled: true, permission: "default", supported: true, hidden: false, shown: 0, lastBody: null }`。

`/?q=balanced&notify=0`：地址栏同样收成 `/?q=balanced`。`twinReady` true，`pageerror` 0，`console.error` 0。按钮仍是「通知关」，`aria-pressed` 为 false。探针 `enabled` 为 false。

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
