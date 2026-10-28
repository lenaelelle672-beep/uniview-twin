# D300 merge #85（T081 BroadcastChannel）

| 项 | 值 |
| --- | --- |
| PR | [#85](https://github.com/lenaelelle672-beep/uniview-twin/pull/85) T081: BroadcastChannel 多标签薄总线 |
| pre / base SHA | `6bcea58216aafa2c29f0e78281b04a2ce4d91eac` |
| PR head / tip SHA | `77f4255719aacad79c6d5940a0be7b75ad5f5b98` |
| merge SHA | `45e06ab897c7c0cc692e980048595891dec85196` |
| parents | `6bcea58216aafa2c29f0e78281b04a2ce4d91eac` `77f4255719aacad79c6d5940a0be7b75ad5f5b98` |
| hardGate | 436319（≤ 436361，余量 42）PASS |
| balancedFx | 104552（≤ 105000，余量 448）PASS |
| 相对合前 | +0 / +0 |
| twinReady | true |
| pageerror | 0 |
| console.error | 0 |
| 结论 | **PASS** |
| CloudAgent | `bc-30ca478c-bc43-513a-921e-c156f3876b4b` |

本文件是 merge 之后单独的合口证。parent 是 merge commit `45e06ab897c7c0cc692e980048595891dec85196`。只加这一份说明，没有产品代码。

## 合并

合并前 `origin/main` 是 `6bcea58216aafa2c29f0e78281b04a2ce4d91eac`。PR head `77f4255719aacad79c6d5940a0be7b75ad5f5b98`，当时 DRAFT、OPEN、MERGEABLE、`mergeStateStatus` CLEAN。标 ready 之后再查了一次：`isDraft` 变成 false，`headRefOid` 没有变，`mergeable` 仍是 MERGEABLE，`mergeStateStatus` 仍是 CLEAN。没有 force，没有改 feature 分支 tip。

```
gh pr ready 85
gh pr merge 85 --merge --match-head-commit 77f4255719aacad79c6d5940a0be7b75ad5f5b98
```

GitHub 状态是 **MERGED**，`mergedAt` 2026-10-28T11:03:27Z。`mergeCommit` 是 `45e06ab897c7c0cc692e980048595891dec85196`。两个父提交按顺序是 base `6bcea58216aafa2c29f0e78281b04a2ce4d91eac` 与 tip `77f4255719aacad79c6d5940a0be7b75ad5f5b98`。merge 树与 PR head 树相同（`a9937a461bac87dd81309f5ffaaf09041a643ba1`）。`package.json` 与 `package-lock.json` 相对合前 0 diff。

`origin/integration` 仍停在 `be8303022a4733060f77ebb1cc83897d20b94aa8`。这次只把证据推到 `main`，没有快进 integration。

## 门禁

在 merge 提交 `45e06ab897c7c0cc692e980048595891dec85196` 上 `npm ci`，然后 `SHADER_PREWARM=false npm run build`。`vite preview --port 5190`，再跑 `node scripts/measure-first-screen.mjs http://127.0.0.1:5190 balanced`，均衡档 1366×768，Python `gzip.compress(9)`。脚本 `ok: true`，`failures` 为空。性能档总览没有请求 balancedFx。合前基线 `6bcea58` 为 436319 / 104552。

- **hardGate 436319** ≤ 436361，余量 42，**PASS**（相对合前 +0）
- **balancedFx 104552** ≤ 105000，余量 448，**PASS**（相对合前 +0）
- 性能档首屏 hardGate 口径 422742（合前 422742，+0）。少掉的是均衡档才拉的 `street-tree-hi.glb`（gzip9 13577）：436319 − 13577 = 422742。性能档没有 balancedFx，测量窗口里也没有 `BroadcastBus.js`
- 同参重建合前 `6bcea58`：176 个产物。这次 177 个。175 个既有产物逐字节相同。变了的只有 `dock-nsaIj73.js`。多出来的是 `BroadcastBus.js`
- 入口 `index-DR969EVf.js` raw 1413239，gzip9 400115，sha256 `b56ded3cb3ae7a2fae78d7699ef86452fa3d0b1b4bd39269db1828fb55ed9321`。与合前逐字节相同。`BroadcastChannel`、`mountBroadcastBus`、`uniview-twin`、`bus/mount`、`BroadcastBus` 都是 0 处
- `balancedFx-BB0zAHf.js` raw 246234，gzip9 104552，sha256 `659559f1ef3808fa5b50c2dc69a8d41b993a61f680280777bdcab4f8ecba5710`。与合前逐字节相同。上面这些总线名字也是 0 处
- `index.html` raw 483，gzip9 341，sha256 `b76aba44d6cbcc015a75fe2411d223c3153c688b0bfb3f992ca7b782c6fcaf60`。与合前逐字节相同
- `EastGrille-qSYZ9dB.js`、`shellClipCompile-jy31OgF.js`、`shadowBake-BIDE4SL.js`、`index-DgSBdyaU.css` 与五份首屏模型都与合前逐字节相同，仍在原有门禁位置。测量窗口的 hardGate 文件里没有 `BroadcastBus.js`、`dock-nsaIj73.js`
- `dock-nsaIj73.js` 文件名不变。合前 raw 15871、gzip9 6109、sha256 `b34f64848bbf985d14b68d368882909158e94c3bfa59cfb95c6d610d1d65f808`。现在 raw 15994、gzip9 6146、sha256 `30f969c50aeb8f27cd08ab8a46096d37e17fd189149d49b1fe07a2403654a85f`。多出来的 123 字节整段接在原文件末尾：`window.__twinBusStore=A;void import("./BroadcastBus.js").then((m)=>{m.mountBroadcastBus(()=>import("./vp-CFNvr_V.js"))});`。不在 hardGate 里。gzip9 6146 大于余量 42。均衡档在首帧后 2610ms 请求 dock，性能档在 2604ms
- `BroadcastBus.js` raw 8564，gzip9 3386，sha256 `a580d21bc7ac912298196563ae91fbe944269b38d23eeb9695984cf4f8f81099`。`mountBroadcastBus`、`BroadcastChannel`、`uniview-twin`、`.close(` 都在。没有 `zustand`、`react-three`、`three`、`shareShot`、`clipboard`、`WebGLRenderer`、`https://`。不在 hardGateFiles 里，也不在 balancedFx 里。gzip9 3386 大于余量 42。均衡档在首帧后 2637ms 才请求它，性能档在 2628ms，`?bus=0` 在 2639ms，都在首帧 cutoff 之外

默认总览（均衡档与性能档，1366×768，swiftshader，`__twinReady` 后再等 12000ms）：`window.__twinReady === true`，`pageerror` 0，`console.error` 0。按钮文案是「多屏开」，`aria-pressed` 为 true。`window.__twinBus` 为 `{ on: true, channel: "uniview-twin", closed: false, sent: 0, applied: 0, dropped: 0 }`，tab 非空。性能档这次没有请求 `balancedFx-BB0zAHf.js`。

`/?q=balanced&bus=0`：同样 `twinReady` true，`pageerror` 0，`console.error` 0。按钮是「多屏关」，`aria-pressed` 为 false。探针为 `{ on: false, channel: "uniview-twin", closed: true, sent: 0 }`。

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
