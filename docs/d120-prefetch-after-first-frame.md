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
