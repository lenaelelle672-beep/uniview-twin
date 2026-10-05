# 格栅 v4 压缩版（D080，2026-09-29 17:25 UTC+8，3D资产与性能）

源文件：incoming/east-grille-v4-{hi,lo}.glb（带 2×1 金属度/粗糙度贴图的版本）。
流水线：tools/scripts/grille-v4-build.mjs = props-build.mjs 基础上多量化 TEXCOORD_0（16 bit 归一化 unsigned short）。
POSITION 保持 float32，NORMAL 8 bit，EXT_meshopt_compression + KHR_mesh_quantization。加载要 MeshoptDecoder。
检查脚本：tools/scripts/grille-v4-check.mjs（gltf-transform 读回）、tools/scripts/grille-v4-load-three.mjs（three 0.186.1 GLTFLoader，Node 打桩，不解码图片）。

| 文件 | 三角面 | 顶点 | 网格/图元/材质/贴图 | 原始 B | 压缩后 B | gzip -9 B | 调用数 |
|---|---|---|---|---|---|---|---|
| east-grille-v4-hi.glb | 726 | 1,452 → 1,440 | 1/1/1/1 | incoming 71.4 KB | 15,424 | 3,718 | 1（开阴影时 +1） |
| east-grille-v4-lo.glb | 350 | 700 → 688 | 1/1/1/1 | incoming 36.1 KB | 9,568 | 3,251 | 1（性能档无阴影） |

- UV 读回：金属 (0.25000, 0.50001)，玻璃 (0.75000, 0.50001)，仍落在各自贴图格正中，NEAREST 采样无误差。
- 贴图读回：2×1 PNG，min/mag 都是 NEAREST，CLAMP，three 里 generateMipmaps=false，metalnessMap 与 roughnessMap 是同一张。metallicFactor = roughnessFactor = 1。
- 包围盒与压缩前一致：(0,19.6,0) ~ (102.259,45.5,0.45)。顶点色 COLOR_0 保持 float32 未量化。
- gltf-validator：两个文件都是 0 错误、0 警告（1 条 info：meshopt 扩展不参与校验）。
- 旧的 props-load-test.mjs 在 Node 里遇到内嵌贴图会报 self is not defined，未压缩的 incoming 原件也一样，是测试脚本不支持图片，不是文件问题。
- 状态：放在 work/，等 D075 新外壳 PR 合入并在场景里实测后再进 ready/。现在 ready/ 仍是 v3。
- sha256 前 8 位（hi/lo）：57449b31/529bb7ee
