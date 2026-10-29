# D300 merge #98（T091 工位级爆炸）

| 项 | 值 |
| --- | --- |
| PR | [#98](https://github.com/lenaelelle672-beep/uniview-twin/pull/98) T091：工位级爆炸，接在预烘焙实例矩阵上，哈希定稿后才挂回 dock |
| pre / base SHA | `1077ca2c3a1fdd926b5dc0f505285960cbb77e5d` |
| PR head / tip SHA | `55f28268383adfe219f370ed992151d598e1b276` |
| merge SHA | `918a321b20e622e65506a04767132e9d3f772e48` |
| parents | `1077ca2c3a1fdd926b5dc0f505285960cbb77e5d` `55f28268383adfe219f370ed992151d598e1b276` |
| 合口证 tip | 本提交。parent 是 merge commit `918a321b20e622e65506a04767132e9d3f772e48`。合并刚完成时 `origin/main` 就是这枚 merge commit |
| hardGate | 436347（≤ 436361，余量 14）PASS |
| balancedFx | 104555（≤ 105000，余量 445）PASS |
| 相对合前 | +0 / +0 |
| twinReady | 量脚本等到 `window.__twinReady === true` 才记数 |
| pageerror | 未单测（没有对 merge SHA 做功能冒烟） |
| console.error | 未单测（没有对 merge SHA 做功能冒烟） |
| 结论 | **PASS** |
| CloudAgent | `bc-d103d54a-fa69-53ee-bf40-bd8e590b267c` |

本文件是 merge 之后单独的合口证。parent 是 merge commit `918a321b20e622e65506a04767132e9d3f772e48`。只加这一份说明，没有产品代码。门禁跑在 merge 提交上；本提交相对它只多这份说明，产品树与 merge 树相同。

## 合并

合并前 `origin/main` 与 PR `baseRefOid` 都是 `1077ca2c3a1fdd926b5dc0f505285960cbb77e5d`。PR head `55f28268383adfe219f370ed992151d598e1b276`。当时 DRAFT、OPEN、MERGEABLE、`mergeable_state` clean。标 ready 之后再查了一次：`isDraft` 变成 false，`headRefOid` 没有变，`mergeable` 仍是 MERGEABLE，`mergeStateStatus` 仍是 CLEAN。没有 force，没有改 feature 分支 tip，没有删分支。

```
gh api repos/lenaelelle672-beep/uniview-twin/pulls/98 --jq '{head:.head.sha,base:.base.sha,draft:.draft,mergeable:.mergeable}'
git fetch origin main && git rev-parse origin/main
gh pr ready 98 --repo lenaelelle672-beep/uniview-twin
gh pr view 98 --repo lenaelelle672-beep/uniview-twin --json state,isDraft,mergeable,mergeStateStatus,headRefOid,baseRefOid
gh pr merge 98 --repo lenaelelle672-beep/uniview-twin --merge --match-head-commit 55f28268383adfe219f370ed992151d598e1b276
```

GitHub 状态是 **MERGED**，`mergedAt` 2026-10-29T11:56:17Z。`mergeCommit` 是 `918a321b20e622e65506a04767132e9d3f772e48`。两个父提交按顺序是 base `1077ca2c3a1fdd926b5dc0f505285960cbb77e5d` 与 tip `55f28268383adfe219f370ed992151d598e1b276`。merge 树与 PR head 树相同（`ca4d682bddcba00d4e3034caaac5c848fad15c28`）。`package.json` 与 `package-lock.json` 相对合前 0 diff，相对 tip 树也是 0 diff。

`origin/integration` 仍停在 `be8303022a4733060f77ebb1cc83897d20b94aa8`。这次只把证据推到 `main`，没有快进 integration。没有合其他 PR。#94 仍是 OPEN draft，head `481c15a160cd40e856d114082e3c947781ed09a2`。#95 仍是 OPEN draft，head `cead2163b5cd1b8416b15ad513053165a9685fb0`。feature 分支 `cursor/t091-station-explode-ff4f` 仍在 `55f28268383adfe219f370ed992151d598e1b276`。

## 门禁

在 merge 提交 `918a321b20e622e65506a04767132e9d3f772e48` 上 `npm ci`，然后 `SHADER_PREWARM=false npm run build`。`npx vite preview --port 5198 --strictPort --host 127.0.0.1`，再跑 `ARTIFACT_DIR=/tmp/t091-gate node scripts/measure-first-screen.mjs http://127.0.0.1:5198 merge98`，均衡档 1366×768，Python `gzip.compress(9)`。脚本 `ok: true`，`failures` 为空。性能档总览没有请求 balancedFx。合前基线 `1077ca2` 为 436347 / 104555。没有对 merge SHA 做功能冒烟。

- **hardGate 436347** ≤ 436361，余量 14，**PASS**（相对合前 +0）
- **balancedFx 104555** ≤ 105000，余量 445，**PASS**（相对合前 +0）
- 性能档首屏 hardGate 口径 422770（合前 422770，+0）。少掉的是均衡档才拉的 `street-tree-hi.glb`（gzip9 13577）：436347 − 13577 = 422770。性能档没有 balancedFx，也没有 `ShaderPreload.js` / `PreloadLayer.js` / `StationExplode.js`
- 相对合前公布表，五份首屏模型、`shadowBake`、CSS 的 gzip9 都没变。入口 gzip9 400143（合前 400143，+0），`index.html` gzip9 342（合前 342，+0），`EastGrille` gzip9 1054（合前 1054，+0），`shellClipCompile` gzip9 1434（合前 1434，+0）。合计 +0
- 入口 `index-DKEjBHXi.js` raw 1413274，gzip9 400143，sha256 `8046b9a89dd738fcae52c6e9cd5260c7a06e8f0a1e47dc6c39534645a6da2098`。与合前逐字节相同。`StationExplode`、`mountStationExplode`、`station-explode`、`ShaderPreload`、`PreloadLayer`、`shader-preload`、`mountShaderPreload`、`preloadOn`、`openPathChunk`、`yieldMain`、`growBvhMount`、`uploadGpuInBatches`、`scheduler.yield` 都是 0 处
- `balancedFx-CRCYFDL.js` raw 246234，gzip9 104555，sha256 `bfa835ae66aa3e0f0f70aeadac08b467d4fc9de4c1e3550b3ded5a1cdca3e659`。raw 与 gzip9 与合前相同，sha256 也相同。上面这些名字也是 0 处
- `index.html` raw 483，gzip9 342，sha256 `c07acd0c3daf3e610b0c24f01a2f66d84801d4c159a4bee8828692aa643360f1`
- `EastGrille-CZokYeT.js` gzip9 1054，sha256 `34637eace9180654fb127860f8c53ae60323b7a7404106989f181253e61c843f`。`shellClipCompile-CP2DUGS.js` gzip9 1434，sha256 `83ba92edc958b36babd86258da87ba630827c073cc0efbbeb9bbeabd687270b3`。`shadowBake-BIDE4SL.js` gzip9 1709，sha256 `683d90f410b56fab024f007bbcb241ff4214e77d8c04584d88d3d5f17c185a99`。`index-DgSBdyaU.css` gzip9 3666，sha256 `10e54ed37afdd646fc000e729f8429639cf2b51f1ff04196b0e5b31c5855f0e4`。测量窗口的 hardGate 文件里没有 `StationExplode.js`、`ShaderPreload.js`、`PreloadLayer.js`、`dock-Cj84zNr.js`、`openPathChunk-GRg0qoo.js`、`PickBvhHost-RoJR_zK.js`
- `dock-Cj84zNr.js` raw 16696（合前 16622，+74），gzip9 6273（合前 6258，+15），sha256 `ef2de662f3c2d62efd73a8559b8b0d80960bd7f7479787661f81a4f95e306133`。文件名哈希仍是合前的 `Cj84zNr`（哈希定稿后才把 import 接到 dock 末尾）。多出来的 74 字节就是末尾这句 `void import("./StationExplode.js").then((m)=>{m.mountStationExplode()})`。dock 不在 hardGate 里。测量窗口没有请求
- `StationExplode.js` raw 6813，gzip9 2897，sha256 `66a6ec2424135aa98ea8f83e0ad29dda362ae0b4020dd16ce752a7892f297cb8`。gzip9 大于余量 14。测量窗口没有请求
- `ShaderPreload.js` raw 983，gzip9 557，sha256 `48014c8c0282ae96cdd22bd30f91a9d0ee3a1bfe38848f5fd406c5d596635bef`。与合前逐字节相同。gzip9 大于余量 14。测量窗口没有请求
- `PreloadLayer.js` raw 141056，gzip9 38233，sha256 `35f0999d5afc8e300087cbbbfae934085294a8913ad38bedd2aa9f9893a4762b`。与合前逐字节相同。gzip9 大于余量 14。测量窗口没有请求
- `openPathChunk-GRg0qoo.js` raw 1752，gzip9 794，sha256 `c37e46490f439113f12fb14c37c906e3dd3ce460b6149705ad4bd7d29869491c`。与合前逐字节相同。测量窗口没有请求
- 这次 dist 189 个。合口证 #97 记录当时产物 188 个。多出来的是 `StationExplode.js`

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
