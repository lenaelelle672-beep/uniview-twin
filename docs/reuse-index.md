| 库/资源 | 用途 | 结论 | 许可证 | 出处调研文件 |
|---|---|---|---|---|
| @react-three/fiber 9.8.1 + react 19.3 + three 0.186.x | 基线版本（three 锁 <0.187） | 直接用 | MIT | 2026-09-28-宇视大楼数字孪生.md |
| drei CameraControls（camera-controls） | 镜头飞行/fitToBox/搜索定位 | 直接用 | MIT | 2026-09-28-宇视大楼数字孪生.md |
| three InstancedMesh / drei Instances | 工位、设备、柱、树、路灯批量渲染 | 直接用 | MIT | 2026-09-28-宇视大楼数字孪生.md |
| BufferGeometryUtils.mergeGeometries | 静态楼体合并降 draw call | 直接用 | MIT | 2026-09-28-宇视大楼数字孪生.md |
| @three.ez/instanced-mesh | 实例剔除/LOD（可选） | 改一改用 | MIT | 2026-09-28-宇视大楼数字孪生.md |
| three clippingPlanes + webgl_clipping_stencil 示例 | 剖切（主方案按楼层隐藏） | 改一改用 | MIT | 2026-09-28-宇视大楼数字孪生.md |
| drei Text（troika-three-text）/ Billboard | 文字标签、图标朝向 | 改一改用 | MIT | 2026-09-28-宇视大楼数字孪生.md |
| drei PerformanceMonitor / AdaptiveDpr / AdaptiveEvents | 画质自动降档 | 直接用 | MIT | 2026-09-28-宇视大楼数字孪生.md |
| stats-gl（drei StatsGl） | 开发期性能监控 | 直接用 | MIT | 2026-09-28-宇视大楼数字孪生.md |
| drei Sky / Environment（本地 HDR）/ Lightformer | 昼夜天空与反射 | 改一改用 | MIT | 2026-09-28-宇视大楼数字孪生.md |
| @react-three/postprocessing（Bloom、SMAA） | 夜景发光（仅均衡/高档） | 直接用 | MIT（postprocessing Zlib） | 2026-09-28-宇视大楼数字孪生.md |
| three-fenestra | 幕墙假室内 interior mapping（可选） | 改一改用 | MIT | 2026-09-28-宇视大楼数字孪生.md |
| three SVGLoader + ExtrudeGeometry | site.pdf→SVG 轮廓挤出 | 改一改用 | MIT | 2026-09-28-宇视大楼数字孪生.md |
| Kenney Furniture Kit | 办公家具低模 | 直接用 | CC0 | 2026-09-28-宇视大楼数字孪生.md |
| Quaternius（家具/角色/树） | 家具、低模人、行道树 | 直接用 | CC0 | 2026-09-28-宇视大楼数字孪生.md |
| RobotExpressive（three 示例模型） | 走动角色（骨骼动画） | 不推荐（卡通风格，见补充节） | CC0 | 2026-09-28-宇视大楼数字孪生.md |
| 纯 SVG | 2D 蓝图台账视图 | 直接用 | – | 2026-09-28-宇视大楼数字孪生.md |
| Zustand | 全局状态 | 直接用 | MIT | 2026-09-28-宇视大楼数字孪生.md |
| papaparse | CSV 导出 | 直接用 | MIT | 2026-09-28-宇视大楼数字孪生.md |
| 原生 print CSS（@page A4） | A4 报告打印 PDF | 直接用 | – | 2026-09-28-宇视大楼数字孪生.md |
| Playwright（SwiftShader 参数） | WebGL 截图回归、控制台 0 报错 | 直接用 | Apache-2.0 | 2026-09-28-宇视大楼数字孪生.md |
| 楼体/幕墙/场地程序化建模 | 22 层塔楼、裙楼、庭院、悬挑楼、场地 | 确实需要自研 | – | 2026-09-28-宇视大楼数字孪生.md |
| Quaternius 31 骨骼写实人物（Man in Suit / Man / Woman Casual 等，Poly Pizza） | 走廊走动人物（Walk/Idle/Sitting，1.8k–2.8k 面） | 改一改用（合并材质、代码驱动位移） | CC0 1.0 | 2026-09-28-宇视大楼数字孪生.md |
| Quaternius Animated Human（白模，poly.pizza/m/c3Ibh9I3udk） | 素色剪影人 / 低档替代 | 直接用 | CC0 1.0 | 2026-09-28-宇视大楼数字孪生.md |
| Quaternius Animated Woman（poly.pizza/m/9kF7eTDbhO） | 单材质女性人物（1908 面） | 直接用 | CC0 1.0 | 2026-09-28-宇视大楼数字孪生.md |
| three BatchedMesh（r186 原生；玻璃、楼板各一个） | 塔楼按层合并降绘制调用，保留按层改色/隐藏/拾取（batchId） | 改一改用（R3F 用 useMemo+primitive 薄封装；手动 computeBoundingSphere；悬停自行比较 batchId；Firefox 无 multi_draw 不降 calls） | MIT | 2026-09-29-BatchedMesh.md |
| @three.ez/batched-mesh-extensions 0.0.12 | BatchedMesh 的 BVH/LOD/逐实例 uniform | 不推荐（本项目用不上；覆盖私有实现，升级有风险） | MIT | 2026-09-29-BatchedMesh.md |
| 合并网格 + floorId 顶点属性 + 自定义着色器 | BatchedMesh 的替代方案（全浏览器 1 次绘制） | 确实需要自研（仅在 Firefox 绘制调用也必须降时考虑） | – | 2026-09-29-BatchedMesh.md |
| drei `<Detailed>`（THREE.LOD 薄封装） | 高低模按相机距离切换（格栅 D031：distances=[0,80]） | 直接用 | MIT | 群聊 D031（2026-09-29），无单独调研文件 |
| three `material.visible=false` | 只用于拾取的隐形网格：不产生绘制调用，射线仍可拾取（B1Pick） | 直接用（three 内置） | MIT | 群聊（2026-09-29），无单独调研文件 |
