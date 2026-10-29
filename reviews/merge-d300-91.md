# D300 merge #91（T086 CycleRaycast lazy OUT）

| 项 | 值 |
| --- | --- |
| PR | [#91](https://github.com/lenaelelle672-beep/uniview-twin/pull/91) T086：密叠拾取轮询（懒加载 OUT） |
| pre / base SHA | `93ae0a02461a0fdc7eede02b2c7930b6323437c8` |
| PR head / tip SHA | `1ffaf6e9ba9944efbdd963be4e6c56a31db64869` |
| merge SHA | `ebf1400966609695624d289e062858b144faa235` |
| parents | `93ae0a02461a0fdc7eede02b2c7930b6323437c8` `1ffaf6e9ba9944efbdd963be4e6c56a31db64869` |
| hardGate | 436346（≤ 436361，余量 15）PASS |
| balancedFx | 104555（≤ 105000，余量 445）PASS |
| 相对合前 | +27 / +3 |
| twinReady | true |
| pageerror | 0 |
| console.error | 0 |
| 结论 | **PASS** |
| CloudAgent | `bc-9b0d9436-49f6-5d75-87aa-98052760c872` |

本文件是 merge 之后单独的合口证。parent 是 merge commit `ebf1400966609695624d289e062858b144faa235`。只加这一份说明，没有产品代码。

## 合并

合并前 `origin/main` 与 PR `baseRefOid` 都是 `93ae0a02461a0fdc7eede02b2c7930b6323437c8`。PR head `1ffaf6e9ba9944efbdd963be4e6c56a31db64869`。当时 DRAFT、OPEN、MERGEABLE、`mergeStateStatus` CLEAN。标 ready 之后再查了一次：`isDraft` 变成 false，`headRefOid` 没有变，`mergeable` 仍是 MERGEABLE，`mergeStateStatus` 仍是 CLEAN。没有 force，没有改 feature 分支 tip，没有删分支。

```
gh pr view 91 --json state,isDraft,mergeable,mergeStateStatus,headRefOid,baseRefOid
gh pr ready 91
gh pr merge 91 --merge --match-head-commit 1ffaf6e9ba9944efbdd963be4e6c56a31db64869
```

GitHub 状态是 **MERGED**，`mergedAt` 2026-10-29T05:51:34Z。`mergeCommit` 是 `ebf1400966609695624d289e062858b144faa235`。两个父提交按顺序是 base `93ae0a02461a0fdc7eede02b2c7930b6323437c8` 与 tip `1ffaf6e9ba9944efbdd963be4e6c56a31db64869`。merge 树与 PR head 树相同（`f157fadc8bed5eebd9fb6c3b8436aab1c27364e0`）。`package.json` 与 `package-lock.json` 相对合前 0 diff，相对 tip 树也是 0 diff。

`origin/integration` 仍停在 `be8303022a4733060f77ebb1cc83897d20b94aa8`。这次只把证据推到 `main`，没有快进 integration。没有合其他 PR，没有动 T087 / T088。

## 门禁

在 merge 提交 `ebf1400966609695624d289e062858b144faa235` 上 `npm ci`，然后 `SHADER_PREWARM=false npm run build`。`vite preview --port 5190`，再跑 `node scripts/measure-first-screen.mjs http://127.0.0.1:5190 merge91`，均衡档 1366×768，Python `gzip.compress(9)`。脚本 `ok: true`，`failures` 为空。性能档总览没有请求 balancedFx。合前基线 `93ae0a0` 为 436319 / 104552。没有对 merge SHA 做功能冒烟。

- **hardGate 436346** ≤ 436361，余量 15，**PASS**（相对合前 +27）
- **balancedFx 104555** ≤ 105000，余量 445，**PASS**（相对合前 +3）
- 性能档首屏 hardGate 口径 422769（合前 422742，+27）。少掉的是均衡档才拉的 `street-tree-hi.glb`（gzip9 13577）：436346 − 13577 = 422769。性能档没有 balancedFx，也没有 `CycleRaycast.js`
- 相对合前公布表，硬门禁只动了四项：入口 gzip9 400115 → 400148（+33），`EastGrille` 1055 → 1053（−2），`shellClipCompile` 1434 → 1433（−1），入口 HTML 341 → 338（−3）。合计 +27。`shadowBake` 1709、CSS 3666、五份首屏模型与合前表一致
- 入口 `index-DvVbpDCe.js` raw 1413274，gzip9 400148，sha256 `18f76ed1b1266c774bb9510f6d3c566f263fdcc1e5f132a7cc150685bef35dd2`。`CycleRaycast`、`mountCycleRaycast`、`__twinCycle` 都是 0 处
- `balancedFx-kaJaqP6.js` raw 246234，gzip9 104555，sha256 `9b77a1e195eb09188eb6d9cbffb63ae08cd220e014c1c9d63a09eed8614ea54f`。raw 与合前相同，gzip9 +3。上面这些名字也是 0 处
- `index.html` raw 483，gzip9 338，sha256 `5f9165a3d58df929dddd090223cb4d9d0bb0a0b948231f51d8faacd088f385fc`
- `EastGrille-CBQaGDp.js` gzip9 1053，sha256 `55190fe1508af9fe8a1717e05dac368249e7213c50b481b1b9a7036a8d06f5e1`。`shellClipCompile-CmEhQ7D.js` gzip9 1433，sha256 `288d1db2d9f6b7d29109b7ca2ba325c464b2bd1efec4c26b535f7d237315578b`。`shadowBake-BIDE4SL.js` gzip9 1709。`index-DgSBdyaU.css` gzip9 3666。测量窗口的 hardGate 文件里没有 `CycleRaycast.js`、`CycleMount.js`、`dock-CXtj27U.js`
- `CycleMount.js` raw 4670，gzip9 2138。`CycleRaycast.js` raw 7574，gzip9 2913，sha256 `c49007b7274dac8bda8cc30ca9e4821019b1a0fe8b3423cdd5eb74db36fc3a1c`。`dock-CXtj27U.js` raw 16382，gzip9 6219，sha256 `66fea07f52dfa0e53404eb5117ae410d468386ded3316d2fb25c8bda58b78b94`，里面有 `CycleRaycast` 与 `mountCycleRaycast`。三份 gzip9 都大于余量 15，测量窗口都没有请求
- 这次 dist 183 个。合口证 #89 记录当时产物 181 个

同一预览上，均衡档与性能档 1366×768、swiftshader，`__twinReady` 后再等 1500ms（与量脚本同一窗口）：`window.__twinReady === true`，`pageerror` 0，`console.error` 0。均衡档请求了 balancedFx，性能档没有。这个窗口里 `window.__twinCycle` 仍是 null，也没有请求 `CycleMount.js` 或 `CycleRaycast.js`。

结论：**PASS**。

### hardGate 文件

| gzip9 | url |
| ---: | --- |
| 400148 | `/assets/index-DvVbpDCe.js` |
| 13577 | `/models/street-tree-hi.glb` |
| 5061 | `/models/roof-sign.glb` |
| 3666 | `/assets/index-DgSBdyaU.css` |
| 3466 | `/models/street-tree-lo.glb` |
| 3229 | `/models/east-grille-v4-lo.glb` |
| 2666 | `/models/street-lamp.glb` |
| 1709 | `/assets/shadowBake-BIDE4SL.js` |
| 1433 | `/assets/shellClipCompile-CmEhQ7D.js` |
| 1053 | `/assets/EastGrille-CBQaGDp.js` |
| 338 | `/?q=balanced` |
