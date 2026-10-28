# D300 merge #87（T082 Web Speech）

| 项 | 值 |
| --- | --- |
| PR | [#87](https://github.com/lenaelelle672-beep/uniview-twin/pull/87) T082：告警语音播报（Web Speech） |
| pre / base SHA | `5e9f7aa09a6c9abda0783583512979f4b09c802e` |
| PR head / tip SHA | `3950864608d3d9ee0c759ef63abe6a84ff27968c` |
| merge SHA | `f72ae9d07aa6f18defce116c890150e29f0c74b5` |
| parents | `5e9f7aa09a6c9abda0783583512979f4b09c802e` `3950864608d3d9ee0c759ef63abe6a84ff27968c` |
| hardGate | 436319（≤ 436361，余量 42）PASS |
| balancedFx | 104552（≤ 105000，余量 448）PASS |
| 相对合前 | +0 / +0 |
| twinReady | true |
| pageerror | 0 |
| console.error | 0 |
| 结论 | **PASS** |
| CloudAgent | `bc-926f28ea-46a1-5f94-b2ee-db54e556b89b` |

本文件是 merge 之后单独的合口证。parent 是 merge commit `f72ae9d07aa6f18defce116c890150e29f0c74b5`。只加这一份说明，没有产品代码。

## 合并

合并前 `origin/main` 是 `5e9f7aa09a6c9abda0783583512979f4b09c802e`。PR head `3950864608d3d9ee0c759ef63abe6a84ff27968c`，当时 DRAFT、OPEN、MERGEABLE、`mergeStateStatus` CLEAN。标 ready 之后再查了一次：`isDraft` 变成 false，`headRefOid` 没有变，`mergeable` 仍是 MERGEABLE，`mergeStateStatus` 仍是 CLEAN。没有 force，没有改 feature 分支 tip。

```
gh pr ready 87
gh pr merge 87 --merge --match-head-commit 3950864608d3d9ee0c759ef63abe6a84ff27968c
```

GitHub 状态是 **MERGED**，`mergedAt` 2026-10-28T12:07:22Z。`mergeCommit` 是 `f72ae9d07aa6f18defce116c890150e29f0c74b5`。两个父提交按顺序是 base `5e9f7aa09a6c9abda0783583512979f4b09c802e` 与 tip `3950864608d3d9ee0c759ef63abe6a84ff27968c`。merge 树与 PR head 树相同（`bad83ca47f402c7c201916fb937290916ac49eb0`）。`package.json` 与 `package-lock.json` 相对合前 0 diff。

`origin/integration` 仍停在 `be8303022a4733060f77ebb1cc83897d20b94aa8`。这次只把证据推到 `main`，没有快进 integration。PR #84 仍是 OPEN，head 仍是 `38bcc0984d1b0b1ea6902b6edaca3d4117f12b49`。

## 门禁

在 merge 提交 `f72ae9d07aa6f18defce116c890150e29f0c74b5` 上 `npm ci`，然后 `SHADER_PREWARM=false npm run build`。`vite preview --port 5190`，再跑 `node scripts/measure-first-screen.mjs http://127.0.0.1:5190 balanced`，均衡档 1366×768，Python `gzip.compress(9)`。脚本 `ok: true`，`failures` 为空。性能档总览没有请求 balancedFx。合前基线 `5e9f7aa` 为 436319 / 104552。

- **hardGate 436319** ≤ 436361，余量 42，**PASS**（相对合前 +0）
- **balancedFx 104552** ≤ 105000，余量 448，**PASS**（相对合前 +0）
- 性能档首屏 hardGate 口径 422742（合前 422742，+0）。少掉的是均衡档才拉的 `street-tree-hi.glb`（gzip9 13577）：436319 − 13577 = 422742。性能档没有 balancedFx，测量窗口里也没有 `AlarmSpeech.js`
- 同参重建合前 `5e9f7aa`：177 个产物。这次 178 个。175 个既有产物逐字节相同。变了的是 `dock-nsaIj73.js` 和 `AlarmAudioCue.js`。多出来的是 `AlarmSpeech.js`
- 入口 `index-DR969EVf.js` raw 1413239，gzip9 400115，sha256 `b56ded3cb3ae7a2fae78d7699ef86452fa3d0b1b4bd39269db1828fb55ed9321`。与合前逐字节相同。`AlarmSpeech`、`speechSynthesis`、`mountAlarmSpeech` 都是 0 处
- `balancedFx-BB0zAHf.js` raw 246234，gzip9 104552，sha256 `659559f1ef3808fa5b50c2dc69a8d41b993a61f680280777bdcab4f8ecba5710`。与合前逐字节相同。上面这些名字也是 0 处
- `index.html` raw 483，gzip9 341，sha256 `b76aba44d6cbcc015a75fe2411d223c3153c688b0bfb3f992ca7b782c6fcaf60`。与合前逐字节相同
- `EastGrille-qSYZ9dB.js`、`shellClipCompile-jy31OgF.js`、`shadowBake-BIDE4SL.js`、`index-DgSBdyaU.css` 与五份首屏模型都与合前逐字节相同，仍在原有门禁位置。测量窗口的 hardGate 文件里没有 `AlarmSpeech.js`、`AlarmAudioCue.js`、`dock-nsaIj73.js`
- `dock-nsaIj73.js` 文件名不变。合前 raw 15994、gzip9 6146、sha256 `30f969c50aeb8f27cd08ab8a46096d37e17fd189149d49b1fe07a2403654a85f`。现在 raw 16089、gzip9 6160、sha256 `c90effce94e7f32a1aade969b291595e3d5505d587418bc7d2c7fd7d4081f134`。多出来的 95 字节是 `window.__twinSpeechStore=A;void import("./AlarmSpeech.js").then((m)=>{m.mountAlarmSpeech()});`（前后各一个换行）。删掉这 95 字节后 sha256 回到合前。不在 hardGate 里。gzip9 6160 大于余量 42。均衡档在首帧后 2613ms 请求 dock，性能档在 2614ms
- `AlarmSpeech.js` raw 7568，gzip9 3217，sha256 `624649b16b826aa28f9de13df6ab672e79f16b4449132b2bb33dde16ea8fab90`。`mountAlarmSpeech`、`speechSynthesis`、`.cancel(`、`zh-CN` 都在。没有 howler，没有 zustand。不在 hardGateFiles 里，也不在 balancedFx 里。gzip9 3217 大于余量 42。均衡档在首帧后 2636ms 才请求它，性能档在 2631ms，`?speech=1` 在 2630ms，`?speech=0` 在 2633ms，都在首帧 cutoff 之外
- `AlarmAudioCue.js` 仍走同一条晚加载入口。合前 raw 5183、gzip9 2267、sha256 `4c25d37993aaa9075bea53b0bcd7ef3533331cedf0381dc65829a8ef02140b2f`。现在 raw 6743、gzip9 2724、sha256 `3e3f016c518fc6b9634df5f7ced1e486336166add4e914952f0dcfc8558dc63d`。声道门闩在这个分包里。不在 hardGateFiles 里，也不在 balancedFx 里。gzip9 2724 大于余量 42。均衡档在首帧后 2636ms 请求它，性能档在 2631ms

默认总览（均衡档与性能档，1366×768，swiftshader，`__twinReady` 后再等 12000ms）：`window.__twinReady === true`，`pageerror` 0，`console.error` 0。按钮文案是「语音关」，`aria-pressed` 为 false，`data-speech` 为 off。`window.__twinAlarmSpeech` 为 `{ enabled: false, muted: false, unlocked: true, ownsChannel: false, supported: true, spoken: 0, cancelled: 0, voiceLang: "zh-CN" }`。性能档这次没有请求 `balancedFx-BB0zAHf.js`。

`/?q=balanced&speech=1`：同样 `twinReady` true，`pageerror` 0，`console.error` 0。按钮是「语音」，`data-speech` 为 on，`ownsChannel` 为 true。

`/?q=balanced&speech=0`：同样 `twinReady` true，`pageerror` 0，`console.error` 0。按钮是「语音关」，`data-speech` 为 off，`ownsChannel` 为 false。

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
