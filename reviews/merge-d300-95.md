# D300 merge #95（T093 Suspense 分区 + 3D skeleton）

| 项 | 值 |
| --- | --- |
| PR | [#95](https://github.com/lenaelelle672-beep/uniview-twin/pull/95) T093：Suspense 分区 + 3D skeleton（C7） |
| pre / base SHA | `23f2a0293b71630942a239494b048505497356db` |
| PR head / tip SHA | `24be9f4b2cb12a7cd7782ff0cde63906a6382635` |
| merge SHA | `1246cf02c75a8a368c0240a0255a0f3850e60007` |
| parents | `23f2a0293b71630942a239494b048505497356db` `24be9f4b2cb12a7cd7782ff0cde63906a6382635` |
| 合口证 tip | 本提交。parent 是 merge commit `1246cf02c75a8a368c0240a0255a0f3850e60007`。合并刚完成时 `origin/main` 就是这枚 merge commit |
| hardGate | 436337（≤ 436361，余量 24）PASS |
| balancedFx | 104556（≤ 105000，余量 444）PASS |
| 相对合前 | −9 / +1 |
| twinReady | 量脚本等到 `window.__twinReady === true` 才记数 |
| pageerror | 未单测（没有对 merge SHA 做功能冒烟） |
| console.error | 未单测（没有对 merge SHA 做功能冒烟） |
| 结论 | **PASS** |
| CloudAgent | `bc-93744682-6700-5dc3-8fe4-71a251c109ae` |

本文件是 merge 之后单独的合口证。parent 是 merge commit `1246cf02c75a8a368c0240a0255a0f3850e60007`。只加这一份说明，没有产品代码。门禁跑在 merge 提交上；本提交相对它只多这份说明，产品树与 merge 树相同。

## 合并

合并前 `origin/main` 与 PR `baseRefOid` 都是 `23f2a0293b71630942a239494b048505497356db`。PR head `24be9f4b2cb12a7cd7782ff0cde63906a6382635`。当时 DRAFT、OPEN、MERGEABLE、`mergeable_state` clean。标 ready 之后再查了一次：`isDraft` 变成 false，`headRefOid` 没有变，`mergeable` 仍是 MERGEABLE，`mergeStateStatus` 仍是 CLEAN。没有 force，没有改 feature 分支 tip，没有删分支。

```
gh api repos/lenaelelle672-beep/uniview-twin/pulls/95 --jq '{head:.head.sha,base:.base.sha,draft:.draft,mergeable:.mergeable}'
git fetch origin main && git rev-parse origin/main
gh pr ready 95 --repo lenaelelle672-beep/uniview-twin
gh pr view 95 --repo lenaelelle672-beep/uniview-twin --json state,isDraft,mergeable,mergeStateStatus,headRefOid,baseRefOid
gh pr merge 95 --repo lenaelelle672-beep/uniview-twin --merge --match-head-commit 24be9f4b2cb12a7cd7782ff0cde63906a6382635
```

GitHub 状态是 **MERGED**，`mergedAt` 2026-10-29T13:16:42Z。`mergeCommit` 是 `1246cf02c75a8a368c0240a0255a0f3850e60007`。两个父提交按顺序是 base `23f2a0293b71630942a239494b048505497356db` 与 tip `24be9f4b2cb12a7cd7782ff0cde63906a6382635`。merge 树与 PR head 树相同（`6706e7a4247b9cfb8ce53f3aa711f2ed322003ea`）。`package.json` 与 `package-lock.json` 相对合前 0 diff，相对 tip 树也是 0 diff。

`origin/integration` 仍停在 `be8303022a4733060f77ebb1cc83897d20b94aa8`。这次只把证据推到 `main`，没有快进 integration。没有合其他 PR。feature 分支 `cursor/t093-suspense-skeleton-a696` 仍在 `24be9f4b2cb12a7cd7782ff0cde63906a6382635`。

## 门禁

在 merge 提交 `1246cf02c75a8a368c0240a0255a0f3850e60007` 上 `npm ci`，然后 `SHADER_PREWARM=false npm run build`。`npx vite preview --port 57961 --strictPort --host 127.0.0.1`，再跑 `ARTIFACT_DIR=/tmp/t093-gate node scripts/measure-first-screen.mjs http://127.0.0.1:57961 merge95`，均衡档 1366×768，Python `gzip.compress(9)`。脚本 `ok: true`，`failures` 为空。性能档总览没有请求 balancedFx。合前基线 `23f2a02` 公布值为 436346 / 104555。同一套 `SHADER_PREWARM=false` 构建 parent，入口 gzip9 400143、balancedFx gzip9 104555，与合口证 #94 公布值一致。没有对 merge SHA 做功能冒烟。

- **hardGate 436337** ≤ 436361，余量 24，**PASS**（相对合前 −9）
- **balancedFx 104556** ≤ 105000，余量 444，**PASS**（相对合前 +1）
- 性能档首屏 hardGate 口径 422760（合前 422769，−9）。少掉的是均衡档才拉的 `street-tree-hi.glb`（gzip9 13577）：436337 − 13577 = 422760。性能档没有 balancedFx，也没有 `workstationMeshes-BN9oN-Z.js` / `instancedSlots-DR6ikT_.js` / `Workstations-B0RtPOp.js` / `floorDecor-DQDUeeT.js` / `instanceMatrix-BT3Usmi.js` / `ShaderPreload.js` / `PreloadLayer.js` / `StationExplode.js`
- 相对合前公布表，五份首屏模型、`shadowBake`、CSS 的 gzip9 都没变。入口 gzip9 400138（合前 400143，−5），`index.html` gzip9 340（合前 340，+0），`EastGrille` gzip9 1053（合前 1054，−1），`shellClipCompile` gzip9 1432（合前 1435，−3）。合计 −9
- 入口 `index-i5zG-xin.js` raw 1413238（合前 1413238，+0），gzip9 400138，sha256 `f45d11ea244762dfe1f17ccec3237872f1909df7953b5502a7c183eba22b5290`。raw 不变。和合前入口的差异是 128 处等长哈希替换（`floorDecor-DFlLxRQ.js` 换成 `floorDecor-DQDUeeT.js`，以及跟着变的 chunk 名）。`WorkstationSkeleton`、`PeopleSkeleton`、`PeopleTextureSuspense`、`WorkstationMeshes`、`instancedSlots`、`workstationMeshes`、`markInstanceMatrixDynamic`、`commitInstanceMatrices`、`stepInstanceMesh`、`StationExplode`、`ShaderPreload`、`PreloadLayer`、`openPathChunk` 都是 0 处。`WorkstationDesks` 与 `WorkstationMonitors` 仍各 1 处，是 `getObjectByName`，合前也是 1 处。`floorDecor-` 动态 import 仍是 1 处
- `balancedFx-Dj4Q57r.js` raw 246234，gzip9 104556，sha256 `913306d03a9c5b1ff9a92c2b8fe2e2a1340f901585a0edde102701327c1fb27b`。raw 与合前相同，gzip9 +1，sha256 变了。上面这些 skeleton / 工位 chunk 名字也是 0 处。`WorkstationChairs` 与 `WorkstationMonitors` 仍各 1 处，合前也是 1 处
- `index.html` raw 483，gzip9 340，sha256 `0397866c7d6fadecf2b7b5f3e952c15b6a5d6f42cae6d35e084cb11bc55d0189`。入口文件名从 `index-DjD9x9-V.js` 换成 `index-i5zG-xin.js`，哈希长度不变，所以 raw 仍是 483，gzip9 仍是 340
- `EastGrille-C-Igr5y.js` raw 2090，gzip9 1053，sha256 `8a5411a7920a7d329df569713c27babf0d54507c24e0921e55b15a6edbac18ac`。raw 与合前相同。变的是入口 import 名和局部压缩名
- `shellClipCompile-BA_leON.js` raw 3063，gzip9 1432，sha256 `fed77192782d98322178c826f1c3adcfb356d028612dc400ce932c1da2edb5b2`。raw 与合前相同。变的是入口 import 名，以及局部函数名 `X` 换成 `Y`
- `shadowBake-BIDE4SL.js` gzip9 1709，sha256 `683d90f410b56fab024f007bbcb241ff4214e77d8c04584d88d3d5f17c185a99`。与合前逐字节相同。`index-DgSBdyaU.css` gzip9 3666，sha256 `10e54ed37afdd646fc000e729f8429639cf2b51f1ff04196b0e5b31c5855f0e4`。与合前逐字节相同。五份首屏模型也与合前逐字节相同。测量窗口的 hardGate 文件里没有 `workstationMeshes-BN9oN-Z.js`、`instancedSlots-DR6ikT_.js`、`Workstations-B0RtPOp.js`、`floorDecor-DQDUeeT.js`、`instanceMatrix-BT3Usmi.js`、`d-8WVg9mX.js`、`StationExplode.js`、`ShaderPreload.js`、`PreloadLayer.js`、`dock-B9pxvu3.js`、`openPathChunk-GRg0qoo.js`、`PickBvhHost-CF9YufY.js`、`TreeLod-BwKyc3t.js`、`floorInteriorMesh-CjPE8yF.js`
- `workstationMeshes-BN9oN-Z.js` raw 569，gzip9 314，sha256 `be0939e4d44ffafc7aadc01d694ff0f1bf5c05ced53f3ff8c711e2812c59b4e9`。这是新 chunk。里面有 `WorkstationMeshes`、`WorkstationDesks`、`WorkstationChairs`、`WorkstationMonitors`，并 import `instancedSlots-DR6ikT_.js`。gzip9 大于余量 24。测量窗口没有请求。`Workstations-B0RtPOp.js` 用 `lazy` 引它
- `instancedSlots-DR6ikT_.js` raw 1436，gzip9 797，sha256 `3598ea42a10516f3c9e862ba2cf7e898aa50e89a6b5002e5b5a6f13345e0346c`。这是新 chunk。`InstancedSlots` 从工位文件拆到这里，并 import `instanceMatrix-BT3Usmi.js`。合前单独的 `layerGate-DRQAtiJ.js`（raw 587，gzip9 370，sha256 `798cff570fe2a05247a267385ac73a8d88f5cf9d1233c6b3ac77886e09e61932`）不再单独出包，`layerShown` 的 `(u==="people"?e!=="perf":!0)` 和 `twin-frustum-blink` 折进这个包。gzip9 大于余量 24。测量窗口没有请求
- `Workstations-B0RtPOp.js` raw 14347（合前 15037，−690），gzip9 5224（合前 5492，−268），sha256 `bbf124ddc23cab477bf6ce6e682fa358e53fe3832be79045e66982d5d1906c08`。里面有 `WorkstationSkeleton` 1 处，并 `lazy` import `workstationMeshes-BN9oN-Z.js`。gzip9 大于余量 24。测量窗口没有请求
- `floorDecor-DQDUeeT.js` raw 29995（合前 29303，+692），gzip9 11767（合前 11509，+258），sha256 `9fbe505a803ecb9bf18f15c993d450582fce2d795b4897102c6c48ed10377615`。里面有 `PeopleSkeleton` 1 处，并 import `instancedSlots-DR6ikT_.js`。入口仍是首帧路径上的动态 import，这份包在测量窗口里没有请求。gzip9 大于余量 24
- `instanceMatrix-BT3Usmi.js` raw 799（合前 799，+0），gzip9 456（合前 458，−2），sha256 `5bd94e2413ac2b486d49215484003dc55497ec0540e9108d7dbc8ebf3389289b`。gzip9 大于余量 24。测量窗口没有请求。`TreeLod-BwKyc3t.js` raw 3516，gzip9 1625（合前 1626，−1），sha256 `e1747f625ed8385aa438cff55e8e7b739a7adb389e87e2ff7bae6204b920b23e`。`floorInteriorMesh-CjPE8yF.js` raw 3178，gzip9 1511（合前 1514，−3），sha256 `fb27c9c249e0a9b5a6b7f32447e741a63799c561eb211e6f665da6d567e46569`。`d-8WVg9mX.js` raw 13623，gzip9 4744（合前 4744，+0），sha256 `834570a056176c54cba267f875b5dacfedd8f5b60bd17b342bf712c438b72115`。三份都 import 了 `instanceMatrix-BT3Usmi.js`。测量窗口没有请求
- `dock-B9pxvu3.js` raw 16696（合前 16696，+0），gzip9 6275（合前 6274，+1），sha256 `7b4b3dff99f4522e57a09cad241e6986e119927f8df2e0b98d6fa3027dc8a455`。dock 不在 hardGate 里。测量窗口没有请求
- `StationExplode.js` raw 6813，gzip9 2897，sha256 `66a6ec2424135aa98ea8f83e0ad29dda362ae0b4020dd16ce752a7892f297cb8`。与合前逐字节相同。gzip9 大于余量 24。测量窗口没有请求
- `ShaderPreload.js` raw 983，gzip9 556（合前 557，−1），sha256 `97fb7c82900640b7e84a178ffb4b9c15b303c8771ba8cccf4be85f783c39178b`。gzip9 大于余量 24。测量窗口没有请求
- `PreloadLayer.js` raw 141056，gzip9 38232（合前 38234，−2），sha256 `d1e7397f9cda735edd8ccfd82d6e66960e78769e3583ad84e28674d8f9400e1a`。gzip9 大于余量 24。测量窗口没有请求
- `openPathChunk-GRg0qoo.js` raw 1752，gzip9 794，sha256 `c37e46490f439113f12fb14c37c906e3dd3ce460b6149705ad4bd7d29869491c`。与合前逐字节相同。测量窗口没有请求
- 这次 dist 191 个。合口证 #94 记录当时产物 190 个。少掉 `layerGate-DRQAtiJ.js`，多出 `instancedSlots-DR6ikT_.js` 与 `workstationMeshes-BN9oN-Z.js`。vite 模块数 747（合前 743）。多出来的是 `innerFill.tsx`、`instancedSlots.tsx`、`peopleTextureSuspense.tsx`、`workstationMeshes.tsx`

结论：**PASS**。

### hardGate 文件

| gzip9 | url |
| ---: | --- |
| 400138 | `/assets/index-i5zG-xin.js` |
| 13577 | `/models/street-tree-hi.glb` |
| 5061 | `/models/roof-sign.glb` |
| 3666 | `/assets/index-DgSBdyaU.css` |
| 3466 | `/models/street-tree-lo.glb` |
| 3229 | `/models/east-grille-v4-lo.glb` |
| 2666 | `/models/street-lamp.glb` |
| 1709 | `/assets/shadowBake-BIDE4SL.js` |
| 1432 | `/assets/shellClipCompile-BA_leON.js` |
| 1053 | `/assets/EastGrille-C-Igr5y.js` |
| 340 | `/?q=balanced` |
