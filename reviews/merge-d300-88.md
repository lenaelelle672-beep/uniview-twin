# D300 merge #88（T080 DragControls）

| 项 | 值 |
| --- | --- |
| PR | [#88](https://github.com/lenaelelle672-beep/uniview-twin/pull/88) T080: lazy DragControls for authoring placement |
| pre / base SHA | `67a4d536b48a3da9a0ccaaafc5701b8290620aff` |
| PR head / tip SHA | `165e9417e615f683ba6b25307d85324b04974d15` |
| merge SHA | `95389b8af040f9441a8fcfbcc423ad8a60e98cba` |
| parents | `67a4d536b48a3da9a0ccaaafc5701b8290620aff` `165e9417e615f683ba6b25307d85324b04974d15` |
| hardGate | 436319（≤ 436361，余量 42）PASS |
| balancedFx | 104552（≤ 105000，余量 448）PASS |
| 相对合前 | +0 / +0 |
| twinReady | true |
| pageerror | 0 |
| console.error | 0 |
| 结论 | **PASS** |
| CloudAgent | `bc-2089458d-2c96-5056-93a1-7a083c340547` |

本文件是 merge 之后单独的合口证。parent 是 merge commit `95389b8af040f9441a8fcfbcc423ad8a60e98cba`。只加这一份说明，没有产品代码。

## 合并

合并前 `origin/main` 与 PR `baseRefOid` 都是 `67a4d536b48a3da9a0ccaaafc5701b8290620aff`。PR head `165e9417e615f683ba6b25307d85324b04974d15` 的父提交就是这个 base。标 ready 之前与之后各查了一次：`isDraft` 从 true 变成 false，`headRefOid` 没有变，`mergeable` 为 MERGEABLE，`mergeStateStatus` 为 CLEAN。没有 force。

```
gh pr ready 88
gh pr merge 88 --merge --match-head-commit 165e9417e615f683ba6b25307d85324b04974d15
```

GitHub 状态是 **MERGED**，`mergedAt` 2026-10-28T09:25:06Z。`mergeCommit` 是 `95389b8af040f9441a8fcfbcc423ad8a60e98cba`。两个父提交按顺序是 base `67a4d536b48a3da9a0ccaaafc5701b8290620aff` 与 tip `165e9417e615f683ba6b25307d85324b04974d15`。merge 树与 PR head 树相同（`5b8f9434c6e872dbde8f088fc90bbfaeb0ef6298`）。`package.json` 与 `package-lock.json` 相对合前 0 diff。

`origin/integration` 仍停在 `be8303022a4733060f77ebb1cc83897d20b94aa8`。这次只把证据推到 `main`，没有快进 integration。

## 门禁

在 merge 提交 `95389b8af040f9441a8fcfbcc423ad8a60e98cba` 上 `npm ci`，然后 `SHADER_PREWARM=false npm run build`。`vite preview --port 5190`，再跑 `scripts/measure-first-screen.mjs`，均衡档 1366×768，Python `gzip.compress(9)`。脚本 `ok: true`，`failures` 为空。性能档总览没有请求 balancedFx。合前基线 436319 / 104552。

- **hardGate 436319** ≤ 436361，余量 42，**PASS**（相对合前 +0）
- **balancedFx 104552** ≤ 105000，余量 448，**PASS**（相对合前 +0）
- 性能档首屏 hardGate 口径 422742（合前 422742，+0）。少掉的是均衡档才拉的 `street-tree-hi.glb`（gzip9 13577）：436319 − 13577 = 422742。性能档没有 balancedFx，也没有 `DragControls.js`
- 同参重建合前 `67a4d53`：174 个产物。这次 176 个。173 个既有产物逐字节相同。变了的只有 `dock-nsaIj73.js`。多出来的是 `DragMount.js` 与 `DragControls.js`
- 入口 `index-DR969EVf.js` raw 1413239，gzip9 400115，sha256 `b56ded3cb3ae7a2fae78d7699ef86452fa3d0b1b4bd39269db1828fb55ed9321`。与合前逐字节相同。`DragControls`、`DragMount`、`PlacementDrag`、`mountPlacementDrag`、`drag-placement`、`use-gesture`、`PivotControls`、`dragPlacement`、`__twinDrag` 都是 0 处
- `balancedFx-BB0zAHf.js` raw 246234，gzip9 104552，sha256 `659559f1ef3808fa5b50c2dc69a8d41b993a61f680280777bdcab4f8ecba5710`。与合前逐字节相同。上面这些拖摆名字也是 0 处
- `index.html` raw 483，gzip9 341，sha256 `b76aba44d6cbcc015a75fe2411d223c3153c688b0bfb3f992ca7b782c6fcaf60`。与合前逐字节相同
- `EastGrille-qSYZ9dB.js`、`shellClipCompile-jy31OgF.js`、`shadowBake-BIDE4SL.js`、`index-DgSBdyaU.css` 与五份首屏模型都与合前逐字节相同，仍在原有门禁位置。测量窗口的 hardGate 文件里没有 `DragMount.js`、`DragControls.js`、`dock-nsaIj73.js`
- `dock-nsaIj73.js` 文件名不变。合前 raw 15803、gzip9 6094、sha256 `9390c08a84ebea58737cff4ac3f9bbae6cff920c0af267c89446e45a7aa574a6`。现在 raw 15871、gzip9 6109、sha256 `b34f64848bbf985d14b68d368882909158e94c3bfa59cfb95c6d610d1d65f808`。多出来的 68 字节是 `void import("./DragMount.js").then((m)=>{m.mountPlacementDrag()});`，插在 `CloneMount` 接线之后、`ScreenVideoMount` 接线之前。不在 hardGate 里。gzip9 6109 大于余量 42。均衡档在首帧后 2601ms 请求 dock，性能档在 2608ms
- `DragMount.js` raw 4957，gzip9 2288，sha256 `7dbef50a3630b03a59f00ca6b98e68b6f177b8ed824aacdf13fb5e6f818b1d29`。`./DragControls.js` 1 处，`mountPlacementDrag` 1 处。没有 `lostpointercapture`、`matrixAutoUpdate`、`dragPlacement`、`WebGLRenderer`、`PivotControls`、`https://`。不在 hardGate 里。gzip9 2288 大于余量 42。均衡档在首帧后 2649ms 请求它，性能档在 2632ms。默认总览这次没有接着请求 `DragControls.js`
- `DragControls.js` raw 36134，gzip9 11920，sha256 `94cdfa0b9211cd59e2f036d479065621f264ad19b9deca24c4ab75ba1664880c`。`PlacementDrag`、`DragDevice`、`DragFurniture`、`lostpointercapture`、`matrixAutoUpdate` 都在。没有 `WebGLRenderer`、`PivotControls`、`https://`。不在 hardGate 里。gzip9 11920 大于余量 42。`?demoEdit=1` 时均衡档在首帧后 2710ms 才请求它，仍在首帧 + 64ms 的 cutoff 之外

默认总览（均衡档与性能档，1366×768，swiftshader，`__twinReady` 后再等 12000ms）：`window.__twinReady === true`，`pageerror` 0，`console.error` 0。按钮文案是「拖摆关」，`aria-pressed` 为 false。`window.__twinDrag` 为 `{ on: false, mounted: false, dragging: false, owner: "camera-controls", axisLock: "y", devices: 0, furniture: 0, count: 0, latched: false, moved: 0, places: [] }`。

`/?q=balanced&demoEdit=1`：同样 `twinReady` true，`pageerror` 0，`console.error` 0。按钮是「拖摆开」，`aria-pressed` 为 true。探针为 `{ on: true, mounted: true, devices: 3, furniture: 3, count: 6, axisLock: "y", moved: 0, owner: "camera-controls" }`。六处种子落点都在（西/东打印机 y 0.45，南相机 y 1.25，三块家具垫 y 0.45）。

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
