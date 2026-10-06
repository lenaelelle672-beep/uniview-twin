# 宇视总部大楼 3D 工位/设备数字孪生 DEMO 方案

- 版本：v0.2（2026-09-28 22:50，架构师；v0.1 22:40）
- 截止：2026-09-29 18:00
- 状态：待用户拍板；调研依据 `research/2026-09-28-宇视大楼数字孪生.md`（下称“调研”）
- 资料：`/workspace/drawings/`（photo1、p2f000~003、site.pdf、B1.pdf、ref-video.mp4）

## 1. 总体原则
1. 楼体、场地、室内全部用代码按参数生成（不等手工建模），小资产（楼顶标识、行道树、路灯、人物）由 3D建模 交 GLB。
2. 重复物体一律实例化（工位、显示器、椅子、设备圆标、树、路灯、柱子、幕墙竖梃）。
3. 只渲染需要的：总览只画外壳 + 楼层色带；进入某层才生成该层室内。
4. 能用现成库就用（drei、@react-three/postprocessing、zustand、camera-controls），自研项在第 9 节逐条说明理由。

## 2. 技术栈与工程
- Vite + React 19 + TypeScript + @react-three/fiber 9.x + drei 10.x + zustand + @react-three/postprocessing；**three 锁 0.186.x**（postprocessing 要求 three < 0.187，见调研版本节）
- 开发端口 5190（`vite --port 5190 --strictPort`）
- 仓库：新建私有仓库 `uniview-twin`（用户 09-28 22:32 已同意新建）
- 测试：Vitest（数据层、搜索、URL 解析）+ Playwright（WebGL 截图回归、控制台 0 报错、固定机位截图）。Chromium 137+ 用 SwiftShader 需加 `--enable-unsafe-swiftshader`；测试一律带 `?q=perf|balanced|high` 固定画质档，关闭自动降档。
- **禁止运行时访问 CDN**：drei Environment 用本地 HDR/自建环境、troika 字体用本地中文子集字体、Draco/Meshopt/KTX2 解码器放 `public/`。否则控制台 0 报错无法保证。

## 3. 坐标与尺寸约定
- 单位：米。Y 轴向上。原点：塔楼平面中心的地面（±0.00）。+X 为东，-Z 为北（总平面图上方为北）。
- 层高：1F 6.0 m；2F~22F 4.2 m；B1 层高 5.5 m（地面以下）。塔楼屋面约 94.2 m，女儿墙格栅再高 4 m。
- 楼顶标识（按 photo1）：宽 15 m、高 3 m，贴在塔楼南侧女儿墙格栅立面上、靠西端，字面朝南（+Z），底边与屋面齐平。材质槽 `sign_face`（uniview 字，夜景白光）、`sign_face_cn`（宇视，夜景蓝光）、`sign_body`（底板与侧面）。字形为 Noto Sans SC 近似，非真实 logo，自评注明。
- 塔楼：约 27 × 67 m 板式，长边东西向（以 site.pdf 提取轮廓为准，偏差写进自评）。
- 裙楼：2 层，弧形玻璃廊环绕塔楼南侧底部，前方椭圆下沉庭院（长轴约 30 m，深 5.5 m 接 B1）。
- 右侧楼：5 层，与裙楼合计占地约 97 × 52 m；3~5F 整体悬挑约 4 m，1~2F 内退为玻璃；朝前一侧为弧面；立面竖向格栅。
- 楼层编号：B1、F1~F22。右侧楼与裙楼楼层归属同标高的 F1~F5（数据里带 zone 字段：tower / podium / east）。

## 4. 组件树
```
<App>
  <UIShell>             顶栏（视图切换、昼夜、画质、搜索）、左侧楼层栏（可折叠）、右侧详情、告警抽屉
  <Canvas>
    <QualityManager/>   画质档 + PerformanceMonitor 自动降档 + DPR 控制
    <CameraRig/>        camera-controls 封装：飞行、固定机位 ?cam=、定位 ?pos=
    <Environment/>      昼：Sky + 平行光 + 环境贴图；夜：星空 + 暖色点光（烘焙到材质发光，不用大量实时灯）
    <Site/>             地块、道路、人行道、斑马线、行道树（实例化）、路灯（实例化）
    <Building>
      <Tower/>          每层一个 FloorShell（楼板 + 幕墙），幕墙网格用贴图/着色器而不是真几何（性能档）
      <Podium/>         弧形廊 + 下沉庭院
      <EastBlock/>      悬挑体 + 竖向格栅
      <RoofParapet/>    镂空格栅 + <Logo/>（GLB）
      <FloorBadges/>    每层告警数/离线数（总览 23 个，用 drei Text + 实例化底板，不用 Html）
    </Building>
    <FloorInterior floor=Fxx/>  仅选中楼层：核心筒、会议室、前台、茶水间、柱子吊顶、工位（实例化）、设备圆标（实例化 sprite）、房间标签（Line 引线 + Text，≤ 30 个）、走动人物
    <ExplodedLayout/>   爆炸视图：各层 Y 方向拉开，动画插值
    <SectionClip/>      剖切：按楼层隐藏选中层以上 + 选中层楼板顶面当切面，不做 stencil 封盖、不用 CSG
  </Canvas>
  <BlueprintView/>      2D 平面台账（SVG，不走 WebGL），与 3D 共用 store
  <ReportPrint/>        A4 报告（独立路由/打印样式，window.print 输出 PDF）
</App>
```

## 5. 状态管理（zustand，一个 store 分片）
- `viewSlice`：view（building | floor | blueprint）、exploded、dayNight、quality、selectedFloor、hoveredFloor、focusedDeskId
- `dataSlice`：floors[]、desks[]、devices[]、people[]、alarms[]、加载状态
- `filterSlice`：告警抽屉楼层范围、状态筛选、搜索词
- URL 同步：`?view= &floor= &pos=F12-66 &cam=p2f000 &data=/sample.json &q=quality`，进入页面先解析 URL 再渲染

## 6. 数据层（可替换适配器）
```ts
interface TwinDataAdapter { load(): Promise<TwinData> }
// MockAdapter：固定随机种子生成 B1 + F1~F22，每层约 100 工位，每工位 1 人 + 电脑 + IP 电话；每层另有 2 台打印机、4~6 个摄像头
// JsonAdapter：?data=/sample.json，按同一 TwinData 结构校验（缺字段报中文错误，不白屏）
```
- 设备状态：online（绿，圆）、idle（蓝，方）、alarm（红，三角，脉动）、offline（灰，叉）。颜色 + 形状双编码，满足色弱可辨。
- 工位号格式 `F12-66`；B1 为 `B1-xx`。
- `public/sample.json` 附一份小样例，README 写清字段。

## 7. 相机与固定机位
- 控制器：camera-controls（drei `CameraControls`），飞行用它自带的 `setLookAt(..., true)` 平滑过渡。
- 总览默认机位：从东南方向 45° 俯视。
- 同角度对比机位（初值是按照片目测的估计值，T003 里由开发对照照片校准，校准后回写本表）：

| 参数 | 对应图 | 相机位置 (x,y,z) | 看向 (x,y,z) | 竖向视场角 |
|---|---|---|---|---|
| `?cam=photo1` | photo1 夜景人视 | (-40, 1.6, 170) | (20, 40, 0) | 50° |
| `?cam=p2f000` | 正南略俯视 | (10, 90, 260) | (10, 35, 0) | 30° |
| `?cam=p2f001` | 东南俯视 | (220, 110, 180) | (15, 30, 0) | 30° |
| `?cam=p2f002` | 东侧 | (260, 90, -20) | (15, 30, 0) | 30° |
| `?cam=p2f003` | 西南，看弧廊与庭院 | (-200, 90, 190) | (10, 30, 0) | 30° |

照片2 是白色实体模型，对比截图时加 `&style=model`（白模材质、黑背景），方便逐项比对形体。

## 8. 性能预算（总览视角上限；进入单层视角另注）
| 档位 | 绘制调用 | 三角面 | 贴图显存 | 像素比 | 阴影 | 后处理 |
|---|---|---|---|---|---|---|
| 性能 | ≤ 100 | ≤ 30 万 | ≤ 64 MB | 1 | 无 | 无 |
| 均衡（默认） | ≤ 250 | ≤ 80 万 | ≤ 128 MB | ≤ 1.5 | 1 盏平行光 1024 | 抗锯齿 |
| 高画质 | ≤ 500 | ≤ 200 万 | ≤ 256 MB | ≤ 2 | 2048 | 环境光遮蔽 + 泛光 |

- 单层视角：在上表基础上绘制调用可多 50（室内），三角面不变。
- 首屏加载（gzip）三档共用：≤ 8 MB；首屏可交互 ≤ 5 秒（本机测量，注明环境）。
- 自动降档：连续 3 秒平均帧率 < 30 降一档，最低到性能档，不自动升档；手动可切回。
- 小资产面数：楼顶标识 ≤ 5000；行道树 LOD0 ≤ 800 / LOD1 ≤ 200；路灯 ≤ 300；人物 LOD0 ≤ 3000 / LOD1 ≤ 800；每层走动人数 ≤ 12。
- 场地布置：行道树沿人行道每 8 m 一棵；路灯每 30 m 一盏，道路两侧交错。
- 测量说明：共享机器大概率为软件渲染，帧率仅作参考；绘制调用、三角面、加载体积以 `renderer.info` 和网络面板实测为准。

## 9. 现成方案与自研清单（依据：调研）
| 功能 | 方案 | 结论 |
|---|---|---|
| 镜头飞行、固定机位、搜索定位、?pos= | drei `CameraControls`（`setLookAt`、`fitToBox`），`makeDefault`，不与 OrbitControls 并存 | 直接用 |
| 剖切 | 选中层以上隐藏（或爆炸时移走），选中层楼板顶面即切面；不开 stencil、不用 CSG（每个物体多 2 个 pass，低配扛不住） | 改一改用 |
| 工位、显示器、椅子、设备 | 原生 `InstancedMesh`，每类一个绘制调用；总览只画合并外壳（`mergeGeometries`），进单层才生成室内 | 直接用 |
| 设备圆标 | InstancedMesh 平面 + 图标图集 + 朝向相机的着色器（约 50 行） | 改一改用 |
| 文字、楼层徽标、房间标签 | drei `Text`（troika）+ 本地中文子集字体；单层视图才显示室内文字；引线用 `Line` 自研 | 改一改用 |
| 画质分档 | drei `PerformanceMonitor`（onDecline 降档，配 flipflops 防抖）+ `AdaptiveDpr` + `AdaptiveEvents`；三档配置表放 zustand | 直接用 |
| 玻璃 | `MeshPhysicalMaterial`/`MeshStandardMaterial` + 环境反射，**不用 MeshTransmissionMaterial**（会多渲染一遍场景） | 决策 |
| 昼夜 | drei `Sky` / `Stars` + 夜景发光材质；Bloom 只在均衡和高画质档开 | 直接用 |
| 走动人物 | 低模人形 InstancedMesh 沿走廊折线插值（每层 ≤ 12）；单层近景可挂 RobotExpressive（CC0）+ `useAnimations`。不用 Mixamo 模型（许可风险），不引入 recast/yuka | 改一改用 |
| 家具 | 程序化 Box 组合工位（最省绘制调用）；需要细节时用 Kenney / Quaternius（CC0） | 改一改用 |
| 楼体、幕墙、格栅、场地 | `SVGLoader` + `ExtrudeGeometry` + `ShapeGeometry` 按 site.pdf / B1.pdf 轮廓程序化生成 | 自研：没有现成的宇视大楼模型 |
| 蓝图台账 2D | SVG，数据量小，不引库 | 自研：数据只有约 2300 个点，直接画即可 |
| 性能监控 | drei `StatsGl` + `gl.info.render.calls` 自检 | 直接用 |

## 10. 任务拆分与排期
| 编号 | 内容 | 依赖 | 目标完成 |
|---|---|---|---|
| T001 | 脚手架、store、数据适配器（Mock + JSON）、URL 解析、中文 UI 外壳 | 无 | 09-29 02:00 |
| T002 | 场地 + 楼体外壳参数化生成（塔楼、裙楼、右侧楼、女儿墙） | T001 | 09-29 08:00 |
| T003 | 总览视图：楼层标记、单击高亮、固定机位 ?cam=、白模对比模式 | T002 | 09-29 10:00 |
| T004 | 单层舞台：剖切 + 飞入 + 室内布置 + 工位/设备实例化 | T002 | 09-29 12:00 |
| T005 | 搜索定位 + ?pos= 直达 | T004 | 09-29 13:00 |
| T006 | 画质三档 + 自动降档 + 昼夜模式 | T002 | 09-29 14:00 |
| T007 | 蓝图台账 2D + 爆炸视图 | T004 | 09-29 15:00 |
| T008 | 告警抽屉 + CSV + A4 报告 | T001 | 09-29 15:00 |
| T009 | 走动人物 + 设备圆标 + 房间引线标签 + 小资产接入 | T004、资产 | 09-29 15:30 |
| T010 | 响应式、可访问性、Playwright 回归、README | 全部 | 09-29 16:30 |
| — | 性能实测（资产与性能）、验收（验收测试）、对比截图与自评报告 | — | 09-29 17:30 |

砍需求顺序（时间不够时，从下往上砍，需用户同意）：走动人物 → 爆炸视图动画（改为瞬切）→ 高画质后处理 → B1 细节。

## 11. 待用户确认
1. 代码仓库名与位置。
2. 1F 平面缺失，1F 先按大堂 + 前台示意。
3. 塔楼 2~22F 全部按办公层处理。
