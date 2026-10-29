# D300 merge #94（T092 InstancedMesh 动态矩阵批更）

| 项 | 值 |
| --- | --- |
| PR | [#94](https://github.com/lenaelelle672-beep/uniview-twin/pull/94) T092：InstancedMesh 动态矩阵批更 |
| pre / base SHA | `5e681baa31d55361c84e907b9cd8548f88968271` |
| PR head / tip SHA | `d40de949e45ce42b7efd453e8f9b9429345f8c53` |
| merge SHA | `ffd03ebc29dd39175063b2edfe8060828e9a6014` |
| parents | `5e681baa31d55361c84e907b9cd8548f88968271` `d40de949e45ce42b7efd453e8f9b9429345f8c53` |
| 合口证 tip | 本提交。parent 是 merge commit `ffd03ebc29dd39175063b2edfe8060828e9a6014`。合并刚完成时 `origin/main` 就是这枚 merge commit |
| hardGate | 436346（≤ 436361，余量 15）PASS |
| balancedFx | 104555（≤ 105000，余量 445）PASS |
| 相对合前 | −1 / +0 |
| twinReady | 量脚本等到 `window.__twinReady === true` 才记数 |
| pageerror | 未单测（没有对 merge SHA 做功能冒烟） |
| console.error | 未单测（没有对 merge SHA 做功能冒烟） |
| 结论 | **PASS** |
| CloudAgent | `bc-ba9891ab-d542-5f23-9339-27758271d718` |

本文件是 merge 之后单独的合口证。parent 是 merge commit `ffd03ebc29dd39175063b2edfe8060828e9a6014`。只加这一份说明，没有产品代码。门禁跑在 merge 提交上；本提交相对它只多这份说明，产品树与 merge 树相同。

## 合并

合并前 `origin/main` 与 PR `baseRefOid` 都是 `5e681baa31d55361c84e907b9cd8548f88968271`。PR head `d40de949e45ce42b7efd453e8f9b9429345f8c53`。当时 DRAFT、OPEN、MERGEABLE、`mergeable_state` clean。标 ready 之后再查了一次：`isDraft` 变成 false，`headRefOid` 没有变，`mergeable` 仍是 MERGEABLE，`mergeStateStatus` 仍是 CLEAN。没有 force，没有改 feature 分支 tip，没有删分支。

```
gh api repos/lenaelelle672-beep/uniview-twin/pulls/94 --jq '{head:.head.sha,base:.base.sha,draft:.draft,mergeable:.mergeable}'
git fetch origin main && git rev-parse origin/main
gh pr ready 94 --repo lenaelelle672-beep/uniview-twin
gh pr view 94 --repo lenaelelle672-beep/uniview-twin --json state,isDraft,mergeable,mergeStateStatus,headRefOid,baseRefOid
gh pr merge 94 --repo lenaelelle672-beep/uniview-twin --merge --match-head-commit d40de949e45ce42b7efd453e8f9b9429345f8c53
```

GitHub 状态是 **MERGED**，`mergedAt` 2026-10-29T12:36:25Z。`mergeCommit` 是 `ffd03ebc29dd39175063b2edfe8060828e9a6014`。两个父提交按顺序是 base `5e681baa31d55361c84e907b9cd8548f88968271` 与 tip `d40de949e45ce42b7efd453e8f9b9429345f8c53`。merge 树与 PR head 树相同（`bb08526295d626a8477bb49b7b74055874718720`）。`package.json` 与 `package-lock.json` 相对合前 0 diff，相对 tip 树也是 0 diff。

`origin/integration` 仍停在 `be8303022a4733060f77ebb1cc83897d20b94aa8`。这次只把证据推到 `main`，没有快进 integration。没有合其他 PR。#95 仍是 OPEN draft，head `af1ccc9d52fde704ec0f477edb612336f1ab59f4`。feature 分支 `cursor/instanced-matrix-t092-887a` 仍在 `d40de949e45ce42b7efd453e8f9b9429345f8c53`。

## 门禁

在 merge 提交 `ffd03ebc29dd39175063b2edfe8060828e9a6014` 上 `npm ci`，然后 `SHADER_PREWARM=false npm run build`。`npx vite preview --port 5294 --strictPort --host 127.0.0.1`，再跑 `ARTIFACT_DIR=/tmp/t092-gate node scripts/measure-first-screen.mjs http://127.0.0.1:5294 merge94`，均衡档 1366×768，Python `gzip.compress(9)`。脚本 `ok: true`，`failures` 为空。性能档总览没有请求 balancedFx。合前基线 `5e681ba` 为 436347 / 104555。没有对 merge SHA 做功能冒烟。

- **hardGate 436346** ≤ 436361，余量 15，**PASS**（相对合前 −1）
- **balancedFx 104555** ≤ 105000，余量 445，**PASS**（相对合前 +0）
- 性能档首屏 hardGate 口径 422769（合前 422770，−1）。少掉的是均衡档才拉的 `street-tree-hi.glb`（gzip9 13577）：436346 − 13577 = 422769。性能档没有 balancedFx，也没有 `instanceMatrix-CFYFh1g.js` / `ShaderPreload.js` / `PreloadLayer.js` / `StationExplode.js`
- 相对合前公布表，五份首屏模型、`shadowBake`、CSS 的 gzip9 都没变。入口 gzip9 400143（合前 400143，+0），`index.html` gzip9 340（合前 342，−2），`EastGrille` gzip9 1054（合前 1054，+0），`shellClipCompile` gzip9 1435（合前 1434，+1）。合计 −1
- 入口 `index-DjD9x9-V.js` raw 1413238（合前 1413274，−36），gzip9 400143，sha256 `f0a37b547f71e02bf52289a93577344873c8fbff5b71fbdc11de3f9e06406241`。raw 少掉的 36 字节是 `InstancedProp` 里 `__foliage` 改成 `__f`（标识符 6 处 × 6 字节）。`markInstanceMatrixDynamic`、`armRepeatedInstanceMatrices`、`commitInstanceMatrices`、`flushInstanceMatrices`、`askInstanceFrame`、`setInstancePose`、`stepInstanceMesh`、`stepInstanceGroup`、`resetInstanceMatrixMotion`、`InstanceMatrixMotion`、`instanceMatrix-CFYFh1g` 都是 0 处。`StationExplode`、`mountStationExplode`、`station-explode`、`ShaderPreload`、`PreloadLayer`、`shader-preload`、`mountShaderPreload`、`preloadOn`、`openPathChunk`、`yieldMain`、`growBvhMount`、`uploadGpuInBatches`、`scheduler.yield` 也都是 0 处
- `balancedFx-BL5uZvr.js` raw 246234，gzip9 104555，sha256 `c7fa4125f4010079c6736a709ffd48383294d72816d640ff302a2a3be8bf0ed1`。raw 与 gzip9 与合前相同，sha256 变了。上面这些名字也是 0 处
- `index.html` raw 483，gzip9 340，sha256 `d64609da9228500e0a4734761c87af9c755b25d87e2ec2664a5749c8597bec27`。入口文件名从 `index-DKEjBHXi.js` 换成 `index-DjD9x9-V.js`，哈希长度不变，所以 raw 仍是 483，gzip9 少 2
- `EastGrille-CD2fcsL.js` gzip9 1054，sha256 `0a2a1995dca925cc8fc38b240daa4883a0fbd4700db363688bc40f252bbcf8f7`。`shellClipCompile-qseNxc6.js` raw 3063，gzip9 1435，sha256 `e16b2ee485710b9cde9a9539e118c678ac591d1ed5602783fabf774192e87eb2`。`shadowBake-BIDE4SL.js` gzip9 1709，sha256 `683d90f410b56fab024f007bbcb241ff4214e77d8c04584d88d3d5f17c185a99`。`index-DgSBdyaU.css` gzip9 3666，sha256 `10e54ed37afdd646fc000e729f8429639cf2b51f1ff04196b0e5b31c5855f0e4`。测量窗口的 hardGate 文件里没有 `instanceMatrix-CFYFh1g.js`、`d-DmLndvC.js`、`StationExplode.js`、`ShaderPreload.js`、`PreloadLayer.js`、`dock-CQvU8FM.js`、`openPathChunk-GRg0qoo.js`、`PickBvhHost-vRodpHo.js`、`TreeLod-Bt5NpW4.js`、`Workstations-aODcpSh.js`、`floorInteriorMesh-B5S_0Qz.js`
- `instanceMatrix-CFYFh1g.js` raw 799，gzip9 458，sha256 `e3bd1b6a339295a2905a9d702316bf5950bab4f4dba5ccc45a40f941ac7d29bd`。gzip9 大于余量 15。测量窗口没有请求。树 / 灯的 `setMatrixAt` 补丁和 `DynamicDrawUsage`（35048）留在这个懒包
- `d-DmLndvC.js` raw 13623，gzip9 4744，sha256 `4740a95f6695dd5e3d743fd2e667d16d84a1cd97a806ebee45590f127374deeb`。它 import 了 `instanceMatrix-CFYFh1g.js`，是晚循环那份（`armRepeatedInstanceMatrices` 挂在这里）。gzip9 大于余量 15。测量窗口没有请求
- `TreeLod-Bt5NpW4.js` raw 3516，gzip9 1626，sha256 `a03bd51a2a514ad3d02b92c06a9e8394f58faf48cfedfc498507c5a52e8cc457`。`Workstations-aODcpSh.js` raw 15037，gzip9 5492，sha256 `bdd404168fac848417b28dc0d62aa2f405e2dc745eb24fbc54e0c4fa40c38889`。`floorInteriorMesh-B5S_0Qz.js` raw 3178，gzip9 1514，sha256 `c3130588fbd332333cfba228121a48696675754b6972309f96d259c57c38d65f`。三份都 import 了 `instanceMatrix-CFYFh1g.js`。测量窗口没有请求
- `dock-CQvU8FM.js` raw 16696（合前 16696，+0），gzip9 6274（合前 6273，+1），sha256 `5c7a0647ab9839a3264276d65e24246de01da6884084e32a29094e21cb032448`。dock 不在 hardGate 里。测量窗口没有请求
- `StationExplode.js` raw 6813，gzip9 2897，sha256 `66a6ec2424135aa98ea8f83e0ad29dda362ae0b4020dd16ce752a7892f297cb8`。与合前逐字节相同。gzip9 大于余量 15。测量窗口没有请求
- `ShaderPreload.js` raw 983，gzip9 557，sha256 `de83768e2cf9e787290b0ba0d465eced1a8add19e5183d3ed552ecf285b94db0`。raw 与 gzip9 与合前相同。gzip9 大于余量 15。测量窗口没有请求
- `PreloadLayer.js` raw 141056，gzip9 38234（合前 38233，+1），sha256 `672fcd934c1bfbac146e7d93fefce967954e8843e492d7f6d5f1b579f5e31dd8`。gzip9 大于余量 15。测量窗口没有请求
- `openPathChunk-GRg0qoo.js` raw 1752，gzip9 794，sha256 `c37e46490f439113f12fb14c37c906e3dd3ce460b6149705ad4bd7d29869491c`。与合前逐字节相同。测量窗口没有请求
- 这次 dist 190 个。合口证 #98 记录当时产物 189 个。多出来的是 `instanceMatrix-CFYFh1g.js`

结论：**PASS**。

### hardGate 文件

| gzip9 | url |
| ---: | --- |
| 400143 | `/assets/index-DjD9x9-V.js` |
| 13577 | `/models/street-tree-hi.glb` |
| 5061 | `/models/roof-sign.glb` |
| 3666 | `/assets/index-DgSBdyaU.css` |
| 3466 | `/models/street-tree-lo.glb` |
| 3229 | `/models/east-grille-v4-lo.glb` |
| 2666 | `/models/street-lamp.glb` |
| 1709 | `/assets/shadowBake-BIDE4SL.js` |
| 1435 | `/assets/shellClipCompile-qseNxc6.js` |
| 1054 | `/assets/EastGrille-CD2fcsL.js` |
| 340 | `/?q=balanced` |
