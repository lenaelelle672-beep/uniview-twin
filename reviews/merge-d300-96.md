# D300 merge #96（T089 首帧后分块）

| 项 | 值 |
| --- | --- |
| PR | [#96](https://github.com/lenaelelle672-beep/uniview-twin/pull/96) T089：首帧后分块 / 主线程让出 / GPU 上传切片 |
| pre / base SHA | `38961417ce15da692ad910b8e932832b8314053a` |
| PR head / tip SHA | `537233fd4824ace035fc749d618069c302611f21` |
| merge SHA | `40891dd73ed8804d258420750e5c2eb8eaea2435` |
| parents | `38961417ce15da692ad910b8e932832b8314053a` `537233fd4824ace035fc749d618069c302611f21` |
| 合口证 tip | 本提交。parent 是 merge commit `40891dd73ed8804d258420750e5c2eb8eaea2435`。合并刚完成时 `origin/main` 就是这枚 merge commit |
| hardGate | 436347（≤ 436361，余量 14）PASS |
| balancedFx | 104555（≤ 105000，余量 445）PASS |
| 相对合前 | +1 / +0 |
| twinReady | true |
| pageerror | 0 |
| console.error | 0 |
| 结论 | **PASS** |
| CloudAgent | `bc-3f3857aa-a8f7-51df-b5d6-e2b3b1f5f908` |

本文件是 merge 之后单独的合口证。parent 是 merge commit `40891dd73ed8804d258420750e5c2eb8eaea2435`。只加这一份说明，没有产品代码。门禁跑在 merge 提交上；本提交相对它只多这份说明，产品树与 merge 树相同。

## 合并

合并前 `origin/main` 与 PR `baseRefOid` 都是 `38961417ce15da692ad910b8e932832b8314053a`。PR head `537233fd4824ace035fc749d618069c302611f21`。当时 DRAFT、OPEN、MERGEABLE、`mergeable_state` clean。标 ready 之后再查了一次：`isDraft` 变成 false，`headRefOid` 没有变，`mergeable` 仍是 MERGEABLE，`mergeStateStatus` 仍是 CLEAN。没有 force，没有改 feature 分支 tip，没有删分支。

```
gh api repos/lenaelelle672-beep/uniview-twin/pulls/96 --jq '{head:.head.sha,base:.base.sha,draft:.draft,mergeable:.mergeable}'
gh api repos/lenaelelle672-beep/uniview-twin/commits/main --jq '.sha'
gh pr ready 96 --repo lenaelelle672-beep/uniview-twin
gh pr view 96 --repo lenaelelle672-beep/uniview-twin --json state,isDraft,mergeable,mergeStateStatus,headRefOid,baseRefOid
gh pr merge 96 --repo lenaelelle672-beep/uniview-twin --merge --match-head-commit 537233fd4824ace035fc749d618069c302611f21
```

GitHub 状态是 **MERGED**，`mergedAt` 2026-10-29T10:12:29Z。`mergeCommit` 是 `40891dd73ed8804d258420750e5c2eb8eaea2435`。两个父提交按顺序是 base `38961417ce15da692ad910b8e932832b8314053a` 与 tip `537233fd4824ace035fc749d618069c302611f21`。merge 树与 PR head 树相同（`5b98be1b5d9358776f6286eed9a41ba1fc1657db`）。`package.json` 与 `package-lock.json` 相对合前 0 diff，相对 tip 树也是 0 diff。

`origin/integration` 仍停在 `be8303022a4733060f77ebb1cc83897d20b94aa8`。这次只把证据推到 `main`，没有快进 integration。没有合其他 PR，没有动 T090–T093。

## 门禁

在 merge 提交 `40891dd73ed8804d258420750e5c2eb8eaea2435` 上 `npm ci`，然后 `SHADER_PREWARM=false npm run build`。`vite preview --port 5190`，再跑 `ARTIFACT_DIR=/tmp/t089-gate node scripts/measure-first-screen.mjs http://127.0.0.1:5190 merge96`，均衡档 1366×768，Python `gzip.compress(9)`。脚本 `ok: true`，`failures` 为空。性能档总览没有请求 balancedFx。合前基线 `3896141` 为 436346 / 104555。没有对 merge SHA 做功能冒烟。

- **hardGate 436347** ≤ 436361，余量 14，**PASS**（相对合前 +1）
- **balancedFx 104555** ≤ 105000，余量 445，**PASS**（相对合前 +0）
- 性能档首屏 hardGate 口径 422770（合前 422769，+1）。少掉的是均衡档才拉的 `street-tree-hi.glb`（gzip9 13577）：436347 − 13577 = 422770。性能档没有 balancedFx，也没有 `openPathChunk.js`
- 相对合前公布表，五份首屏模型、`shadowBake`、CSS 的 gzip9 都没变。入口 gzip9 400143（合前 400148，−5），`index.html` gzip9 342（合前 338，+4），`EastGrille` gzip9 1054（合前 1053，+1），`shellClipCompile` gzip9 1434（合前 1433，+1）。合计 +1
- 入口 `index-DKEjBHXi.js` raw 1413274，gzip9 400143，sha256 `8046b9a89dd738fcae52c6e9cd5260c7a06e8f0a1e47dc6c39534645a6da2098`。`openPathChunk`、`yieldMain`、`growBvhMount`、`uploadGpuInBatches`、`scheduler.yield` 都是 0 处
- `balancedFx-CRCYFDL.js` raw 246234，gzip9 104555，sha256 `bfa835ae66aa3e0f0f70aeadac08b467d4fc9de4c1e3550b3ded5a1cdca3e659`。raw 与 gzip9 与合前相同。上面这些名字也是 0 处
- `index.html` raw 483，gzip9 342，sha256 `c07acd0c3daf3e610b0c24f01a2f66d84801d4c159a4bee8828692aa643360f1`
- `EastGrille-CZokYeT.js` gzip9 1054，sha256 `34637eace9180654fb127860f8c53ae60323b7a7404106989f181253e61c843f`。`shellClipCompile-CP2DUGS.js` gzip9 1434，sha256 `83ba92edc958b36babd86258da87ba630827c073cc0efbbeb9bbeabd687270b3`。`shadowBake-BIDE4SL.js` gzip9 1709，sha256 `683d90f410b56fab024f007bbcb241ff4214e77d8c04584d88d3d5f17c185a99`。`index-DgSBdyaU.css` gzip9 3666，sha256 `10e54ed37afdd646fc000e729f8429639cf2b51f1ff04196b0e5b31c5855f0e4`。测量窗口的 hardGate 文件里没有 `openPathChunk-GRg0qoo.js`、`PickBvhHost-RoJR_zK.js`、`PickBvh-Bi36jIf.js`、`dock-Cj84zNr.js`
- `openPathChunk-GRg0qoo.js` raw 1752，gzip9 794，sha256 `c37e46490f439113f12fb14c37c906e3dd3ce460b6149705ad4bd7d29869491c`。含 `scheduler`、`requestIdleCallback`。gzip9 大于余量 14。测量窗口没有请求
- `PickBvhHost-RoJR_zK.js` raw 2643，gzip9 1261，sha256 `d2a202792cdc4d0b9713da0ac726bbc45557a7c0bff74ade58a7bbc0be67a259`。它 import `./openPathChunk-GRg0qoo.js`。测量窗口没有请求
- `dock-Cj84zNr.js` raw 16550，gzip9 6243，sha256 `3bddc9f4e2ccb7c410a3c366247e1ae5ddac49cf6cf9cbde6419ec5322ad604b`。没有 `openPathChunk`。dock 不在 hardGate 里。测量窗口没有请求
- 这次 dist 186 个。合口证 #92 记录当时产物 185 个。多出来的是 `openPathChunk-GRg0qoo.js`

同一预览上，均衡档与性能档 1366×768、swiftshader，`__twinReady` 后再等 1500ms（与量脚本同一窗口）：`window.__twinReady === true`，`pageerror` 0，`console.error` 0。均衡档请求了 balancedFx，性能档没有。这个窗口里没有请求 `openPathChunk-GRg0qoo.js`、`PickBvhHost-RoJR_zK.js` 或 `dock-Cj84zNr.js`。

结论：**PASS**。

### hardGate 文件

| gzip9 | url |
| ---: | --- |
| 400143 | `/assets/index-DKEjBHXi.js` |
| 13577 | `/models/street-tree-hi.glb` |
| 5061 | `/models/roof-sign.glb` |
| 3666 | `/assets/index-DgSBdyaU.css` |
| 3466 | `/models/street-tree-lo.glb` |
| 3229 | `/models/east-grille-v4-lo.glb` |
| 2666 | `/models/street-lamp.glb` |
| 1709 | `/assets/shadowBake-BIDE4SL.js` |
| 1434 | `/assets/shellClipCompile-CP2DUGS.js` |
| 1054 | `/assets/EastGrille-CZokYeT.js` |
| 342 | `/?q=balanced` |
