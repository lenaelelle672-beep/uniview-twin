# D300 merge #56（T051 快捷键速查）

| 项 | 值 |
| --- | --- |
| pre SHA | `b422ab366026622275e11bb67668c27079d61135` |
| merge SHA | `b38e827b1308c60b33b959d7088d6b00f7d45636` |
| parents | `b422ab366026622275e11bb67668c27079d61135` `5f333df1870040f505bf0fcc789e5812d32d45e4` |
| PR head | `5f333df1870040f505bf0fcc789e5812d32d45e4` |
| hardGate | 436300（≤ 436361，余量 61）PASS |
| balancedFx | 104553（≤ 105000，余量 447）PASS |
| twinReady | true |
| pageerror | 0 |
| CloudAgent | `bc-fed9b31d-72bf-5e03-ac54-921f313150a4` |

本文件按 `reviews/merge-d300-58.md` 的字段来写：合并前 SHA、merge SHA、parents、门禁数字、twinReady / pageerror、CloudAgent id。

## 合并

合并前 `origin/main` 与 `origin/integration` 都是 `b422ab366026622275e11bb67668c27079d61135`。PR #56 的 `headRefOid` 是 `5f333df1870040f505bf0fcc789e5812d32d45e4`，其父提交就是这条基线，`mergeable` 为 MERGEABLE。草稿已标为 ready。没有改写这条 tip。

`gh pr merge` 没有 `--no-ff` 开关。用的是 merge commit 策略（不是 squash，不是 rebase），并锁了 `--match-head-commit 5f333df1870040f505bf0fcc789e5812d32d45e4`：

```
gh pr ready 56
gh pr merge 56 --merge --match-head-commit 5f333df1870040f505bf0fcc789e5812d32d45e4 -t "Merge PR #56: T051 shortcuts panel (5f333df)"
```

没有 force-push。GitHub [PR #56](https://github.com/lenaelelle672-beep/uniview-twin/pull/56) 状态是 **MERGED**，`mergeCommit` 是 `b38e827b1308c60b33b959d7088d6b00f7d45636`（`mergedAt` 2026-10-23T01:09:45Z）。两个父提交是 `b422ab366026622275e11bb67668c27079d61135` 与 `5f333df1870040f505bf0fcc789e5812d32d45e4`。

门禁跑在 merge 提交上。本说明是紧随其后的一次提交，只加这个证据文件，不含产品代码。`main` 与 `integration` 一起快进到该说明提交，两条引用保持相同。PR #55 没有动。

## 门禁

`npm ci`，然后 `SHADER_PREWARM=false npm run build`。`scripts/measure-first-screen.mjs`，均衡档 1366×768，Python `gzip.compress(9)`。

- **hardGate 436300** ≤ 436361，余量 61，**PASS**（与合并前 tip 锁机基线 436300 相同）
- **balancedFx 104553** ≤ 105000，余量 447，**PASS**（与基线 104553 相同）
- 性能档总览没有请求 balancedFx（gzip 0）；性能档首屏 hardGate 口径 422723
- 入口 `index-BYXrFgCX.js` raw 1413153，gzip9 400095
- `balancedFx-Cf8zD7Xk.js` raw 246234，gzip9 104553
- hardGate 文件里没有 SoftShadows、DemandLoop、cameraRest、frameSchedule、Stage、ShortcutSheet、host、arm。测量窗口（`__twinReady` 后再等 1500ms）也没有请求这几块
- `Stage.tsx` 没有 shortcuts 静态挂点。ShortcutSheet 打进 `host-BtSAFKO7.js`，没有单独的 ShortcutSheet 分包，也没有 `Stage-*.js`。入口包里没有 `armShortcutKeys` / `shortcut-host` / `toggleShortcutPanel`
- 锁机 cutoff 是首帧 + 64ms。另一次冒烟把页面留到首帧后约 5.3s（均衡）/ 5.2s（性能）：均衡档 DemandLoop 与 BalancedSoftShadows 都在首帧后 2614ms，frameSchedule 在 2621ms，cameraRest 在 2622ms，arm 在 2634ms，都在 cutoff 之外。性能档没有请求 SoftShadows；DemandLoop 在首帧后 2616ms，cameraRest 与 frameSchedule 在 2624ms，arm 在 2646ms。两个档位都没有请求 host / ShortcutSheet。`preserveDrawingBuffer` 为 false（URL 没有 `keepDrawingBuffer=1`）
- 控制台冒烟：`window.__twinReady === true`，`pageerror` 为 0（均衡档与性能档各一次）
- `src/shortcuts/shortcut.test.ts` 6 项通过

### hardGate 文件

| gzip9 | url |
| ---: | --- |
| 400095 | `/assets/index-BYXrFgCX.js` |
| 13577 | `/models/street-tree-hi.glb` |
| 5061 | `/models/roof-sign.glb` |
| 3666 | `/assets/index-DgSBdyaU.css` |
| 3466 | `/models/street-tree-lo.glb` |
| 3229 | `/models/east-grille-v4-lo.glb` |
| 2666 | `/models/street-lamp.glb` |
| 1709 | `/assets/shadowBake-BIDE4SLl.js` |
| 1436 | `/assets/shellClipCompile-C--Ilgmp.js` |
| 1054 | `/assets/EastGrille-CcxcPXHV.js` |
| 341 | `/?q=balanced` |
