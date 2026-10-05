# D120 预取晚于总览首帧

分支 `cursor/d-lazy-split-1005`，测量时代码 `ed0b83c`。  
条件：发布预览 `?q=balanced`，窗口 1366×768，系统 Chrome + CDP（`Network` + worker attach）。  
时间：`performance.now()` 记在页内；请求发出时刻用 CDP `wallTime`（毫秒）。差值 = 请求 wall − `__twinFirstFrameUnixMs`。

实现顺序：`__twinReady`（Suspense 解开，总览要用的文件已加载）→ 第一帧 `useFrame` 写入 `__twinFirstFrameAt` → 再 `requestAnimationFrame` 一帧 → 可选 `requestIdleCallback` → 才 `import()` 三个按需包。

## 三轮时间戳

| 轮次 | CPU | 就绪 `performance.now` | 首帧 `performance.now` | 预取调用晚于首帧 | floorDecor | textRuntime | BlueprintView | 预取都晚于首帧 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| normal-1 | 1× | 965.7 ms | 1901.4 ms | +423 ms | +424.2 ms | +424.3 ms | +424.4 ms | 是 |
| normal-2 | 1× | 943.9 ms | 1907.6 ms | +447 ms | +448.0 ms | +448.1 ms | +448.2 ms | 是 |
| cpu-x8 | 8×（CDP `Emulation.setCPUThrottlingRate`） | 2527.9 ms | 3279.5 ms | +4929 ms | +4939.1 ms | +4940.1 ms | +4940.2 ms | 是 |

cpu-x8 下首帧被拖到约 3.3 s，idle 超时约 4 s 后才发预取，仍全部晚于首帧。旧闸（view=building 就 idle timeout 4 s + `setTimeout` 2.5 s）在这种负载下会在首帧前发出。

## 首屏（D109 / D119）

只计实际请求、各自 `gzip -9`。不含 `.hdr`、favicon。预取在首帧之后发出，D119 不算进首屏。

不含预取（验收口径）**428,753 B** ≤ **436,882 B**（余量 8,129）：

| 文件 | gzip -9 | 相对首帧 |
| --- | ---: | --- |
| `/index.html` | 354 | 之前 |
| `/assets/index-D3pTG-t6.js` | 395,954 | 之前 |
| `/assets/index-CRsjujUE.css` | 3,339 | 之前 |
| `/assets/badge-digits-bold-C_MyspKJ.png` | 4,268 | 之前 |
| `/models/roof-sign.glb` | 5,075 | 之前 |
| `/models/street-lamp.glb` | 2,682 | 之前 |
| `/models/street-tree-lo.glb` | 3,485 | 之前 |
| `/models/street-tree-hi.glb` | 13,596 | 之前 |
| **合计** | **428,753** | |

含预取（只作对照，不算验收）**482,071 B**：

| 文件 | gzip -9 | 相对首帧 |
| --- | ---: | --- |
| 上表 8 个文件 | 428,753 | 之前 |
| `/assets/floorDecor-B9Mjac0d.js` | 9,219 | +1.4 s |
| `/assets/textRuntime-ByYxKwxE.js` | 41,563 | +1.4 s |
| `/assets/BlueprintView-D1J5mYhU.js` | 2,536 | +1.4 s |
| **合计** | **482,071** | |

## 自测

- 主包字符串：troika 0、Billboard 0、Detailed 0。三个懒包仍是独立 `import()`。
- 总览双击楼层徽标一次进入 F1，`__twinInterior` 有值，芯片为单层。
- 顶栏「蓝图」打开 `.blueprint`。
- 控制台 error 0、warning 0。
- 外部请求 0。
- 字体只有 `/fonts/NotoSansSC-Regular-subset.woff`，无 otf。
