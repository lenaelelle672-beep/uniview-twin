# D137：`__twinReady` 等树 lo（对标 D124 格栅）

## 只读排查（动手前）

`git fetch` 后对照：d=`82a50a3`，a 最新=`67725ee`（指定点 `2b16099` / QA `8f9649e`），b=`d76c562`，c=`5e890c6`。未改 a/b/c 分支。

树的 loader 四条线都在同一对文件，没有被 lazy，也没有被 c 挪到首帧之后：

| 分支 | 常量 / loader | 谁挂树 | 预加载 |
| --- | --- | --- | --- |
| d 82a50a3 | `InstancedProp.tsx` 9–10、66、131 `useLoader(GLTFLoader, url)` | `Site.tsx` 113–120：可见树 `TREE_HI`（均衡）或 `TREE_LO`（性能）；`FoliageShadow` 再拉 `TREE_LO` | 只 preload 灯（15 行），**不** preload 树 lo |
| a 8f9649e / 2b16099 / 67725ee | 同上 9–10、66、131 | `Site.tsx` 112–120 同结构 | 只 preload 灯 |
| b d76c562 | 同上 9–10、66、131 | `Site.tsx` 123–131 同结构 | 只 preload 灯 |
| c 5e890c6 | 同上 9–10、68、133；另 preload 了 `roof-sign`（16–17 行） | `Site.tsx` 112–120 同结构 | 灯 + 招牌，**仍不** preload 树 lo |

就绪门（谁和树在同一个 Suspense）：

- **a 8f9649e `Scene.tsx` 68–86**：`Site`（80）与 `RenderProbe`（85）同边界。`RenderProbe.tsx` 15 行 `markSuspenseReady()`。QA 就绪后第一帧看得见树，是因为树的 `useLoader` 会挡住这层 Suspense。
- **b d76c562 `Scene.tsx` 71–89**：仍是 `Site` + `RenderProbe` 同边界。D124 格栅：`EastBlock.tsx` 24–26、80 行 `lazy(import('./EastGrille'))` + `preloadEastGrilleForQuality()`（`eastGrilleAssets.ts` 18–20 预加载 lo GLB），和 Probe 同 Suspense，所以 `__twinReady` 等格栅 chunk + lo GLB。**b 没有把树移出就绪门。**
- **c 5e890c6 `Scene.tsx` 99–120 / 129**：`Site` 仍在 111 行那层 Suspense 里。c 首帧后才挂的是 `FacadeSamples`（131–133，`afterFirstFrame`），楼层内装是 `FloorStage.tsx` 16–18、117 行的**内层** `Suspense`（进楼层才拉）。**树没有被延后。** 但 `RenderProbe` 被挪到外层 129 行，且 `RenderProbe.tsx` 直接 `window.__twinReady = true`。叠加时若采用 c 的 Scene 结构，树的 `useLoader` 不再挡住就绪门，预取可以抢在 `street-tree-lo.glb` 前面。
- **d 82a50a3 `Scene.tsx` 68–86**：与 a 一样 Probe 在树的 Suspense 内；闸门只显式等 HDR/PMREM + `markSuspenseReady()`，**没有**像 D124 那样给树 lo 单独记账。单跑 d 时树仍会被 Suspense 挡住；叠上 c 的 Scene 后这层隐式等待会丢。

**结论：只改 d 能让叠加后的就绪门等到树。** 缺树不是 b 把 loader 挪走，而是 c `Scene.tsx:129` 把 `RenderProbe` 移出树所在 Suspense。d 按 D124 给树 lo 做 `useLoader.preload` + 现有 `overviewReady` 记账，不依赖 Probe 是否还在那层 Suspense 里。不要改 a/b/c。本单 d 分支没有格栅（b 未合入），九轮里格栅列为无。

## D137 改动

未改 `prefetchLazyChunks.ts`、`LocalEnvironment.tsx`。`overviewReady.ts` 只加 `markTreeLoReady()` 和闸门条件。`InstancedProp.tsx` preload `TREE_LO`（三档都用）并在 lo `useLoader` 返回后记账。白模走已有 `markHdrNotRequired()`，不等树。

## 九轮时序（禁缓存）

页内 `performance.now()` ms。预取列为 CDP wall − 首帧 Unix ms。顺序均为 **树 lo 完成 → HDR/PMREM → ready → 首帧 → 预取**。格栅 chunk / 格栅 lo 本分支无请求。

| 轮次 | 树 lo | HDR / PMREM | ready | 首帧 | 三预取相对首帧 |
| --- | ---: | ---: | ---: | ---: | --- |
| normal-1 | 678.9 | 799.9 / 824.2 | 948.7 | 1881.6 | +374.3 / +374.4 / +374.5 |
| normal-2 | 659.5 | 755.2 / 775.8 | 935.9 | 1886.9 | +393.9 / +394.0 / +394.1 |
| normal-3 | 677.8 | 800.5 / 820.9 | 960.0 | 1907.2 | +406.1 / +406.2 / +406.3 |
| cpu-x8-1 | 1828.8 | 1664.1 / 1792.6 | 1945.9 | 3104.7 | +4229.5 / +4229.6 / +4229.7 |
| cpu-x8-2 | 2033.0 | 1837.5 / 1972.0 | 2304.6 | 3298.1 | +3368.0 / +3377.3 / +3377.4 |
| cpu-x8-3 | 2070.2 | 1830.8 / 2012.0 | 2267.3 | 3298.9 | +4504.3 / +4506.6 / +4506.7 |
| fast3g-1 | 3878.5 | 8913.9 / 9096.8 | 9096.8 | 9097.1 | +1442.1 / +1442.2 / +1442.3 |
| fast3g-2 | 3872.5 | 8916.3 / 9107.0 | 9107.0 | 9108.9 | +1482.7 / +1482.9 / +1483.0 |
| fast3g-3 | 3905.9 | 8951.7 / 9221.1 | 9221.1 | 9221.4 | +1437.6 / +1437.7 / +1437.8 |

就绪后第一帧截图：`docs/d137-first-frame-trees.png`（场地一圈有树）。

## 首屏（仅本单，Python `gzip.compress(9)`）

上限 **436,361 B**。不含 `.hdr`、favicon、预取。树 lo 计入。

**428,568 B**（余量 7,793）。主包 `index-UP669uws.js` **395,899 B**，相对 D126 `index-DjFczZ3G.js` 395,838 B，增量 **+61 B**（≤100 B）。

| 文件 | gzip9 |
| --- | ---: |
| `/index.html` | 342 |
| `/assets/index-UP669uws.js` | 395,899 |
| `/assets/index-CRsjujUE.css` | 3,320 |
| `/assets/badge-digits-bold-C_MyspKJ.png` | 4,237 |
| `/models/roof-sign.glb` | 5,061 |
| `/models/street-lamp.glb` | 2,666 |
| `/models/street-tree-lo.glb` | 3,466 |
| `/models/street-tree-hi.glb` | 13,577 |

tsc / vitest 109 / build 通过。九轮 console error/warning 0/0，外网 0。

---

# D120 / D126 预取晚于总览首帧，且首帧带环境光

分支 `cursor/d-lazy-split-1005`。  
条件：发布预览 `?q=balanced`，窗口 1366×768，系统 Chrome + CDP（`Network` + `Emulation.setCPUThrottlingRate` + Chrome Fast 3G）。  
页内时间用 `performance.now()`；请求发出时刻用 CDP `wallTime`（毫秒）。

## D126 闸门（2026-10-05）

HDR 仍在主 `Suspense` 外（`LocalEnvironment`），切档、从楼层回总览、打开蓝图再回总览都不会整块场景退回 fallback。  
`__twinReady` 要同时满足：

1. Suspense 内总览资源就绪（roof-sign、lamp、tree-lo/hi、徽标 PNG）
2. 天空 `.hdr` 已解码（`window.__twinHdrLoadedAt`）
3. PMREM 已生成并赋给 `scene.environment`（`window.__twinHdrReadyAt`）

之后才记首帧 `__twinFirstFrameAt`，再 ≥1 个 `requestAnimationFrame`，可选 `requestIdleCallback`，才 `import()` 三个按需包。

性能档和均衡档共用这一张 HDR（`LocalEnvironment enabled={!model}`，与 `quality` 无关），所以性能档同样等待。只有白模（`presentation=model`）或 HDR 加载失败才 `markHdrNotRequired()`，不等贴图。

`.hdr` 仍不算进首屏（D109 / D125）。

## 六轮时间戳

顺序必须是 **HDR 完成 → PMREM 就绪 / `__twinReady` / 首帧 → 三个预取**。六轮 `orderOk` 均为是。

| 轮次 | 条件 | HDR 完成 | PMREM `__twinHdrReadyAt` | `__twinReady` | 首帧 | floorDecor | textRuntime | BlueprintView |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| normal-1 | 1× | 804.7 | 827.2 | 968.8 | 1874.7 | +385.8 | +385.9 | +386.0 |
| normal-2 | 1× | 797.4 | 818.4 | 969.6 | 1892.3 | +376.7 | +376.9 | +377.0 |
| cpu-x8-1 | CPU×8 | 1770.9 | 1911.1 | 2251.2 | 3242.1 | +4519.6 | +4524.3 | +4525.7 |
| cpu-x8-2 | CPU×8 | 1893.1 | 2077.4 | 2465.5 | 3430.1 | +4276.5 | +4276.7 | +4278.6 |
| fast3g-1 | Chrome Fast 3G | 8950.7 | 9163.2 | 9163.2 | 9163.5 | +1417.3 | +1417.5 | +1417.5 |
| fast3g-2 | Chrome Fast 3G | 8903.7 | 9272.1 | 9272.1 | 9272.6 | +1433.8 | +1434.1 | +1434.2 |

页内列为 `performance.now()`（毫秒）。三个预取列为 CDP 请求 wall − `__twinFirstFrameUnixMs`（毫秒，皆为正）。

Fast 3G 下 HDR 约 1.4 MB，网络完成约 5.3 s，Suspense 资源先到；`__twinReady` 与 PMREM 同一时刻置位，首帧紧跟（+0.3 ms），预取仍在其后。CPU×8 下 idle 超时把预取推到首帧后约 4.3–4.5 s。

Fast 3G 首帧截图：`docs/d126-fast3g-first-frame.png`。玻璃幕墙有环境反射，场地不是整片黑。

## 首屏（D125：Python `gzip.compress(9)`）

只计实际请求。不含 `.hdr`、favicon、balancedFx（本构建未请求）、首帧后的三个预取包。硬门禁 **≤ 436,361 B**。

不含预取（验收口径）**428,508 B** ≤ **436,361 B**（余量 7,853）：

| 文件 | gzip.compress(9) | 相对首帧 |
| --- | ---: | --- |
| `/index.html` | 343 | 之前 |
| `/assets/index-DjFczZ3G.js` | 395,838 | 之前 |
| `/assets/index-CRsjujUE.css` | 3,320 | 之前 |
| `/assets/badge-digits-bold-C_MyspKJ.png` | 4,237 | 之前 |
| `/models/roof-sign.glb` | 5,061 | 之前 |
| `/models/street-lamp.glb` | 2,666 | 之前 |
| `/models/street-tree-lo.glb` | 3,466 | 之前 |
| `/models/street-tree-hi.glb` | 13,577 | 之前 |
| **合计** | **428,508** | |

天空 HDR 原始 1,435,119 B，请求发生在首帧前，按口径不计入。

含预取（只作对照，不算验收）**481,836 B**：

| 文件 | gzip.compress(9) | 相对首帧 |
| --- | ---: | --- |
| 上表 8 个文件 | 428,508 | 之前 |
| `/assets/floorDecor-O7So_7l5.js` | 9,207 | 之后 |
| `/assets/textRuntime-BIINqYTI.js` | 41,611 | 之后 |
| `/assets/BlueprintView-CEHy_6vp.js` | 2,510 | 之后 |
| **合计** | **481,836** | |

## 自测

- 主包字符串：troika 0、Billboard 0、Detailed 0。三个懒包仍是独立 `import()`。
- 总览双击 F1 徽标一次进入单层，`__twinInterior` 为 F1 / 100 桌，芯片「单层视图 · F1」。返回总览画布仍在，无 fallback 横幅。
- 切到性能档画布仍在；顶栏「蓝图」打开 `.blueprint`；再回总览 `__twinReady` 且 `__twinHdrReadyAt` 仍在。
- 控制台 error 0、warning 0。
- 外部请求 0。
- 字体只有 `/fonts/NotoSansSC-Regular-subset.woff`，无 otf。

## a 单 merge 后复核（2026-10-05）

分支 `cursor/a-floor-interiors-1005`。  
普通 merge：`git fetch origin cursor/d-lazy-split-1005 && git merge --no-ff origin/cursor/d-lazy-split-1005`。  
**merge commit** `df4cea1048ab313e6da7cac0615b18b92c1bde37`（parents `c3e4a12` + `82a50a3`，闸门 `f0b3b91`）。  
预取闸门和 HDR 以 d 为准；a 保留 `__twinScene`。

merge 后再测六轮，顺序均为 **HDR 完成 → PMREM / `__twinReady` / 首帧 → 三个预取**，`orderOk` 全是。

| 轮次 | 条件 | HDR 完成 | PMREM `__twinHdrReadyAt` | `__twinReady` | 首帧 | floorDecor | textRuntime | BlueprintView |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| normal-1 | 1× | 1113.5 | 1142.4 | 1242.7 | 2236.8 | +411.6 | +411.9 | +413.2 |
| normal-2 | 1× | 1017.0 | 1040.4 | 2280.2 | 2289.7 | +384.3 | +384.8 | +384.9 |
| cpu-x8-1 | CPU×8 | 1801.1 | 1942.3 | 2425.5 | 3420.3 | +5183.8 | +5187.1 | +5188.5 |
| cpu-x8-2 | CPU×8 | 1782.2 | 1920.4 | 2449.9 | 3258.3 | +4507.3 | +4512.0 | +4513.5 |
| fast3g-1 | Chrome Fast 3G | 8924.2 | 9238.7 | 9238.7 | 9239.6 | +1437.4 | +1437.9 | +1438.0 |
| fast3g-2 | Chrome Fast 3G | 8882.9 | 9102.5 | 9102.5 | 9102.8 | +1452.1 | +1452.5 | +1452.6 |

页内列为 `performance.now()`（毫秒）。三个预取列为 CDP 请求 wall − `__twinFirstFrameUnixMs`（毫秒，皆为正）。控制台 error 0、外部请求 0。

### 首屏（D125：Python `gzip.compress(9)`，a merge 后构建）

不含 `.hdr`、favicon、balancedFx、首帧后三个预取。硬门禁 **≤ 436,361 B**。

不含预取（验收口径）**426,448 B** ≤ **436,361 B**（余量 9,913）：

| 文件 | gzip.compress(9) | 相对首帧 |
| --- | ---: | --- |
| `/index.html` | 344 | 之前 |
| `/assets/index-mITJ4Pey.js` | 393,777 | 之前 |
| `/assets/index-CRsjujUE.css` | 3,320 | 之前 |
| `/assets/badge-digits-bold-C_MyspKJ.png` | 4,237 | 之前 |
| `/models/roof-sign.glb` | 5,061 | 之前 |
| `/models/street-lamp.glb` | 2,666 | 之前 |
| `/models/street-tree-lo.glb` | 3,466 | 之前 |
| `/models/street-tree-hi.glb` | 13,577 | 之前 |
| **合计** | **426,448** | |

天空 HDR 原始 1,435,119 B，按口径不计入。

含预取（只作对照，不算验收）**480,636 B**：

| 文件 | gzip.compress(9) | 相对首帧 |
| --- | ---: | --- |
| 上表 8 个文件 | 426,448 | 之前 |
| `/assets/floorDecor-Dymwh2TN.js` | 9,512 | 之后 |
| `/assets/textRuntime-CLYmTiN6.js` | 41,633 | 之后 |
| `/assets/BlueprintView-2_5gwuOG.js` | 3,043 | 之后 |
| **合计** | **480,636** | |
