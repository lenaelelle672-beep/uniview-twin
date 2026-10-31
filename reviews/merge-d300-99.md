# D300 merge #99（T095 徽标和标签跟爆炸进度）

| 项 | 值 |
| --- | --- |
| PR | [#99](https://github.com/lenaelelle672-beep/uniview-twin/pull/99) T095：徽标和标签跟爆炸进度 |
| pre / base SHA | `de86f83617b071669656bb1bf69b0ee94c9fa2d1` |
| PR head / tip SHA | `fdf93daa5b9793ec52bf36934c67cc03004f14b5` |
| merge SHA | `81580b1781b867fa66b6a7c11037a72487b8f136` |
| parents | `de86f83617b071669656bb1bf69b0ee94c9fa2d1` `fdf93daa5b9793ec52bf36934c67cc03004f14b5` |
| 合口证 tip | 本提交。parent 是 merge commit `81580b1781b867fa66b6a7c11037a72487b8f136`。合并刚完成时 `origin/main` 就是这枚 merge commit |
| hardGate | 436333（≤ 436361，余量 28）PASS |
| balancedFx | 104556（≤ 105000，余量 444）PASS |
| 相对合前 | +8 / +0 |
| twinReady | 量脚本等到 `window.__twinReady === true` 才记数 |
| pageerror | 未单测（没有对 merge SHA 做功能冒烟） |
| console.error | 未单测（没有对 merge SHA 做功能冒烟） |
| 结论 | **PASS** |
| CloudAgent | `bc-e57860a6-b292-5257-97c9-9826ec877ea4` |

本文件是 merge 之后单独的合口证。parent 是 merge commit `81580b1781b867fa66b6a7c11037a72487b8f136`。只加这一份说明，没有产品代码。门禁跑在 merge 提交上；本提交相对它只多这份说明，产品树与 merge 树相同。

## 合并

合并前 `origin/main` 与 PR `baseRefOid` 都是 `de86f83617b071669656bb1bf69b0ee94c9fa2d1`。PR head `fdf93daa5b9793ec52bf36934c67cc03004f14b5`。当时 DRAFT、OPEN、MERGEABLE、`mergeable_state` clean。标 ready 之后再查了一次：`isDraft` 变成 false，`headRefOid` 没有变，`mergeable` 仍是 MERGEABLE，`mergeStateStatus` 仍是 CLEAN。`origin/main` 仍是 `de86f83617b071669656bb1bf69b0ee94c9fa2d1`。没有 force，没有改 feature 分支 tip，没有删分支。

```
gh pr view 99 --repo lenaelelle672-beep/uniview-twin --json state,isDraft,mergeable,mergeStateStatus,headRefOid,baseRefOid
git fetch origin main && git rev-parse origin/main
gh pr ready 99 --repo lenaelelle672-beep/uniview-twin
gh pr view 99 --repo lenaelelle672-beep/uniview-twin --json state,isDraft,mergeable,mergeStateStatus,headRefOid,baseRefOid
gh pr merge 99 --repo lenaelelle672-beep/uniview-twin --merge --match-head-commit fdf93daa5b9793ec52bf36934c67cc03004f14b5
```

GitHub 状态是 **MERGED**，`mergedAt` 2026-10-31T00:44:14Z。`mergeCommit` 是 `81580b1781b867fa66b6a7c11037a72487b8f136`。两个父提交按顺序是 base `de86f83617b071669656bb1bf69b0ee94c9fa2d1` 与 tip `fdf93daa5b9793ec52bf36934c67cc03004f14b5`。merge 树与 PR head 树相同（`94011c91155d589409723fcfc62736af2beb8572`）。`package.json` 与 `package-lock.json` 相对合前 0 diff，相对 tip 树也是 0 diff。

`origin/integration` 仍停在 `be8303022a4733060f77ebb1cc83897d20b94aa8`。这次只把证据推到 `main`，没有快进 integration。没有合其他 PR。feature 分支 `cursor/t095-badge-explode-sync-0758` 仍在 `fdf93daa5b9793ec52bf36934c67cc03004f14b5`。

## 门禁

在 merge 提交 `81580b1781b867fa66b6a7c11037a72487b8f136` 上 `npm ci`，然后 `SHADER_PREWARM=false npm run build`。`npx vite preview --port 5103 --strictPort --host 127.0.0.1`，再跑 `ARTIFACT_DIR=/tmp/t095-gate node scripts/measure-first-screen.mjs http://127.0.0.1:5103 merge99`，均衡档 1366×768，Python `gzip.compress(9)`。脚本 `ok: true`，`failures` 为空。性能档总览没有请求 balancedFx。合前基线 `de86f83` 公布值为 436325 / 104556。同一套 `SHADER_PREWARM=false` 构建 parent `de86f83`，入口 gzip9 400124、sha256 `e1224647f3b85fdc9326e2702314107766ce3645e7621d16fb36f334e1378bc4`，balancedFx gzip9 104556、sha256 `6733c5a263dd666dd398513f175aae006348d411794c1d519d28f95f68f3fced`，与合口证 #102 公布值一致。没有对 merge SHA 做功能冒烟。

- **hardGate 436333** ≤ 436361，余量 28，**PASS**（相对合前 +8）
- **balancedFx 104556** ≤ 105000，余量 444，**PASS**（相对合前 +0）
- 性能档首屏 hardGate 口径 422756（合前 422748，+8）。少掉的是均衡档才拉的 `street-tree-hi.glb`（gzip9 13577）：436333 − 13577 = 422756。性能档没有 balancedFx，也没有 `StationExplode.js` / `ExplodeProgress.js` / `floorDecor` / `ProgressiveRoomLabels` / `ShaderPreload.js` / `PreloadLayer.js`
- 相对合前公布表，五份首屏模型、`shadowBake`、CSS 的 gzip9 都没变。入口 gzip9 400129（合前 400124，+5），`index.html` gzip9 342（合前 340，+2），`EastGrille` gzip9 1053（合前 1053，+0），`shellClipCompile` gzip9 1435（合前 1434，+1）。合计 +8
- 入口 `index-DrNAxKFI.js` raw 1413235（合前 1413235，+0），gzip9 400129，sha256 `defacfe02e3474f2b5e4582ebf56d6e613e5d8e28505cb73fe86ad9220a7272f`。把合前入口里的 chunk 文件名换成占位符之后，正文与合前逐字相同。24 处等长 chunk 名替换（`EastGrille-4wnoIbK.js` 换成 `EastGrille-C8u1_xS.js`，`shellClipCompile-E9YJja1.js` 换成 `shellClipCompile-CGdKQxe.js`，`balancedFx-D9MGiUy.js` 换成 `balancedFx-CFqy7tR.js`，`floorDecor-4abTWiL.js` 换成 `floorDecor-Bz59IAU.js`，`dock-BjFA9sg.js` 换成 `dock-CWmgLWi.js`，以及跟着变的 chunk 名），出现 31 次，字节贡献 0。`badgeExplodeOffset`、`readExplodeMotion`、`readStationExplodeMotion`、`__twinBadgeExplodeDelta`、`__twinReadExplodeMotion`、`__twinStationFrame`、`badgePoseOwned`、`badgeRests`、`labelPoseOwned` 都是 0 处。`explodeRest` 仍是 4 处。`globalThis.__ea` 与 `globalThis.__es` 仍各 1 处。`__esModule` 仍是 3 处。`setExploded` 仍是 3 处。`WorkstationDesks` 与 `WorkstationMonitors` 仍各 1 处。`floorDecor-` 动态 import 仍是 1 处
- `balancedFx-CFqy7tR.js` raw 246234，gzip9 104556，sha256 `c731e082706687c8be1bc7ba87a8a0fa975b41837f8d2d8e14db309ae5bfaeb9`。raw 与 gzip9 与合前相同。把入口名和其余 chunk 名换成占位符之后，正文与合前逐字相同。`globalThis.__ea`、`globalThis.__es`、`__twinBadgeExplodeDelta`、`badgeExplodeOffset`、`readExplodeMotion`、`readStationExplodeMotion`、`StationExplode`、`ShaderPreload`、`PreloadLayer` 都是 0 处。`WorkstationMonitors` 仍是 1 处。`__esModule` 仍是 1 处
- `index.html` raw 483，gzip9 342，sha256 `700d74cb055327869b7468d66bf63acd82b4415fd5cb1ab77004aa034c22adcb`。入口文件名从 `index-Cm-z3Crl.js` 换成 `index-DrNAxKFI.js`，哈希长度不变，所以 raw 仍是 483，gzip9 +2
- `EastGrille-C8u1_xS.js` raw 2090，gzip9 1053，sha256 `9eeb78f9f55e9cccfe52ef17844dc92c831593c89f19c172ff7bfb13dbe877df`。raw 与 gzip9 与合前相同。换成占位符之后正文与合前相同
- `shellClipCompile-CGdKQxe.js` raw 3063，gzip9 1435，sha256 `5cf0bf355ab70b423e436237af8788503fcbdf1f14d9b0f4f88d3c32d3d7e0a9`。raw 与合前相同。换成占位符之后正文与合前相同。gzip9 +1
- `shadowBake-BIDE4SL.js` gzip9 1709，sha256 `683d90f410b56fab024f007bbcb241ff4214e77d8c04584d88d3d5f17c185a99`。与合前逐字节相同。`index-DgSBdyaU.css` gzip9 3666，sha256 `10e54ed37afdd646fc000e729f8429639cf2b51f1ff04196b0e5b31c5855f0e4`。与合前逐字节相同。五份首屏模型也与合前逐字节相同。测量窗口的 hardGate 文件里没有 `StationExplode.js`、`ExplodeProgress.js`、`dock-CWmgLWi.js`、`floorDecor-Bz59IAU.js`、`ProgressiveRoomLabels-CpwJE0L.js`、`ShaderPreload.js`、`PreloadLayer.js`、`openPathChunk-GRg0qoo.js`、`BlinkFrustum.js`、`DeskScreenPosters.js`、`workstationMeshes-BAKADWq.js`、`instancedSlots-o7EGXIj.js`
- `StationExplode.js` raw 11547（合前 7388，+4159），gzip9 4469（合前 3083，+1386），sha256 `0236de7f46e6dcee3d961ab0335797018534ecba65bf78fb5e72c151d4767099`。gzip9 大于余量 28。测量窗口没有请求。新增的是工位分包里的圆标 / 标签姿态：`__twinBadgeExplodeDelta` 1 处，`__twinReadExplodeMotion` 1 处，`__twinStationFrame` 2 处，`badgePoseOwned` 3 处，`badgeRests` 1 处，`explodeRest` 1 处，`labelPoseOwned` 2 处，`inheritFloorLift` 1 处。合前这些都是 0。`badgeExplodeOffset`、`readExplodeMotion`、`readStationExplodeMotion` 仍是 0 处（名字被压掉）。`globalThis.__ea` 与 `globalThis.__es` 仍各 1 处。单层收拢仍由 `stationTick` 在进度已经是 0 的同一帧写回 rest，不另开 0.8 秒尾巴
- `floorDecor-Bz59IAU.js` raw 30877（合前 30009，+868），gzip9 12088（合前 11805，+283），sha256 `1e850154f67de451517e5bf8579e4c1d5eccac2fb5257c702a26c0299fc541e3`。入口仍是首帧路径上的动态 import，这份包在测量窗口里没有请求。gzip9 大于余量 28。`DeviceBadges` 仍是 1 处，`setMatrixAt` 仍是 1 处，`needsUpdate` 仍是 3 处。新出现的是 `__twinBadgeExplodeDelta` 4 处、`badgePoseOwned` 2 处、`badgeRests` 1 处、`__twinStationFrame` 1 处
- `ProgressiveRoomLabels-CpwJE0L.js` raw 11583（合前 10786，+797），gzip9 4430（合前 4188，+242），sha256 `da60f580a2c4c86e821812bed577f0d160a3612ecf4b106b6c1682c3d181fbbe`。测量窗口没有请求。gzip9 大于余量 28。新出现的是 `__twinBadgeExplodeDelta` 2 处、`explodeRest` 1 处、`labelPoseOwned` 1 处、`explodeAnchor` 1 处、`inheritFloorLift` 1 处、`__twinStationFrame` 1 处
- `ExplodeProgress.js` raw 4873，gzip9 2134，sha256 `2cc8880fe6a48a5471024f499790d883651bc45b050215708ff2ffc09f1c0b22`。与合前逐字节相同。测量窗口没有请求
- `dock-CWmgLWi.js` raw 16800（合前 16800，+0），gzip9 6295（合前 6294，+1），sha256 `fe7ed9e34a359a67867b18add31a315303a2bf1d156dfee5880c103d47512ab5`。换成占位符之后正文与合前相同。`mountExplodeProgress` 仍是 1 处，`StationExplode` 仍是 2 处。dock 不在 hardGate 里。测量窗口没有请求
- `ShaderPreload.js` raw 983，gzip9 556，sha256 `4844115fd348d82c847d275bf67550045aecf97dcbb4ab38f8ff7340c7eeaf34`。raw 与 gzip9 不变，变的是入口名。`PreloadLayer.js` raw 141073，gzip9 38244，sha256 `5a8c45f1cf623a61770708805cfdcd5674e78e8af532367dd1e71cb654efe5ce`。raw 与 gzip9 不变。两份都不在测量窗口里
- `openPathChunk-GRg0qoo.js` raw 1752，gzip9 794，sha256 `c37e46490f439113f12fb14c37c906e3dd3ce460b6149705ad4bd7d29869491c`。与合前逐字节相同。测量窗口没有请求
- `BlinkFrustum.js` raw 8460（合前 8460，+0），gzip9 3591（合前 3590，+1）。`DeskScreenPosters.js` raw 9402（合前 9402，+0），gzip9 4246（合前 4245，+1）。`cameraRest-BypTTmc.js` raw 2047（合前 2047，+0），gzip9 987（合前 987，+0）。三份都不在测量窗口里
- `Workstations-89RupeV.js` raw 14299（合前 14299，+0），gzip9 5298（合前 5298，+0）。`instancedSlots-o7EGXIj.js` raw 1436（合前 1436，+0），gzip9 797（合前 798，−1）。`instanceMatrix-Dghv3kF.js` raw 799，gzip9 458（合前 456，+2）。`d-DrM6TFP.js` raw 15796（合前 15796，+0），gzip9 5514（合前 5515，−1）。`PickBvhHost-CQ6qJlA.js` raw 2721（合前 2721，+0），gzip9 1307（合前 1307，+0）。这些包测量窗口都没有请求。raw 没变的差异是等长 chunk 名
- 这次 dist 192 个。合口证 #102 记录当时产物 192 个。没有新 chunk。vite 模块数 748（合前 748）。`src/scene/badgeExplodePose.ts` 只从工位晚加载分包引进去，不进这 748。圆标和房间标签的增量落在已经存在的 `floorDecor` 与 `ProgressiveRoomLabels` 里

结论：**PASS**。

### hardGate 文件

| gzip9 | url |
| ---: | --- |
| 400129 | `/assets/index-DrNAxKFI.js` |
| 13577 | `/models/street-tree-hi.glb` |
| 5061 | `/models/roof-sign.glb` |
| 3666 | `/assets/index-DgSBdyaU.css` |
| 3466 | `/models/street-tree-lo.glb` |
| 3229 | `/models/east-grille-v4-lo.glb` |
| 2666 | `/models/street-lamp.glb` |
| 1709 | `/assets/shadowBake-BIDE4SL.js` |
| 1435 | `/assets/shellClipCompile-CGdKQxe.js` |
| 1053 | `/assets/EastGrille-C8u1_xS.js` |
| 342 | `/?q=balanced` |
