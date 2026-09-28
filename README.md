# 宇视总部大楼数字孪生

网页 3D 数字孪生 DEMO。当前为 T001：工程脚手架、可替换数据层，以及中文界面外壳。楼体、室内、搜索和告警抽屉在后续任务中接入。

## 启动

```bash
npm install
npm run dev
```

浏览器打开 [http://localhost:5190](http://localhost:5190)。开发服务器固定使用 5190 端口（`strictPort`，端口被占用时会直接失败）。

单元测试：

```bash
npm test
```

## 页面上有什么

- 顶栏：总览 / 单层 / 蓝图、白天 / 夜间、性能 / 均衡 / 高画质，以及搜索框（搜索结果在后续任务实现，输入会记在筛选状态里）。
- 左侧楼层栏：可折叠。默认数据列出 B1、F1～F22 共 23 层，每层显示告警数和离线数。
- 右侧详情：占位，显示当前楼层的工位、设备和告警/离线数量。
- 中间画布：地面和一座方块，表示稍后替换的楼体。

## 地址栏参数

进入页面时先解析地址栏，再渲染。改视图、楼层或画质后会写回地址栏。

| 参数 | 含义 | 示例 |
| --- | --- | --- |
| `view` | `building` 总览、`floor` 单层、`blueprint` 蓝图。默认总览，不写进地址栏 | `?view=floor` |
| `floor` | `B1` 或 `F1`～`F22` | `?floor=F12` |
| `pos` | 工位号，如 `F12-66`、`B1-8` | `?pos=F12-66` |
| `cam` | 固定机位：`photo1`、`p2f000`、`p2f001`、`p2f002`、`p2f003` | `?cam=p2f000` |
| `data` | 站内 JSON，必须以 `/` 开头 | `?data=/sample.json` |
| `q` | 画质档 `perf`、`balanced`、`high`。出现该参数后画质被固定，不会自动降档 | `?q=perf` |

不带 `data` 时使用内置 Mock 数据。Mock 使用固定种子 `20260928`，刷新后告警数和离线数不变。每层 100 个工位，每个工位 1 人、1 台电脑、1 部 IP 电话，另有 2 台打印机和 4～6 个摄像头。设备状态约为在线 75%、空闲 15%、告警 4%、离线 6%，普通层告警大约 5～10 条。F3、F12、F18 的告警比例约为普通层的两倍。状态取值仍是在线 `online`、空闲 `idle`、告警 `alarm`、离线 `offline`。

样例：

- [http://localhost:5190/?data=/sample.json](http://localhost:5190/?data=/sample.json) 加载 `public/sample.json`
- [http://localhost:5190/?data=/不存在.json](http://localhost:5190/?data=/不存在.json) 显示中文错误，页面不会白屏

## 样例字段

`public/sample.json` 与 Mock 使用同一结构。楼层上的 `alarmCount` / `offlineCount` 会在加载时按设备状态重算。

- `floors[]`：`id`、`name`、`level`、`elevation`（米）、`height`（米）
- `desks[]`：`id`（`F12-66` 或 `B1-8`）、`floorId`、`index`、`zone`（`tower` / `podium` / `east`）、`x`、`y`、`z`
- `devices[]`：`id`、`floorId`、可选 `deskId`、`type`（`pc` / `phone` / `printer` / `camera`）、`status`、`zone`
- `people[]`：`id`、`deskId`、`floorId`、`name`
- `alarms[]`：`id`、`deviceId`、`floorId`、`message`

坐标单位是米，Y 轴向上。原点在塔楼平面中心的地面（±0.00），+X 为东，-Z 为北。B1 层高 5.5 m（标高 -5.5 m），1F 层高 6.0 m，2F～22F 层高 4.2 m，塔楼屋面约 94.2 m。

## 运行时不访问外网

字体、环境贴图和解码器都不能在运行时向 CDN 请求。本任务的场景没有使用 drei 的 Environment 预设、troika 默认字体或 Draco / Meshopt / KTX2 解码器。后续任务若需要这些资源，放到 `public/` 下并从本地路径加载。
