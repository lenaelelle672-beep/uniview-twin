# assets/ready 说明

| 路径 | 内容 | 来源 / 记录 |
|---|---|---|
| `people/` | 人物模型及 LOD1 | `assets/2026-09-28-人物处理.md` |
| `props/` | 行道树 hi/lo、路灯、屋顶标牌 **v1**（uniview 宇视，1609 面） | `assets/2026-09-28-小资产处理.md` |
| `east-grille-hi.glb` | 东侧格栅高模（D029） | 本文件下文；`perf/2026-09-29.md` “D029 资产入库” |
| `east-grille-lo.glb` | 东侧格栅低模（性能档用） | 同上 |
| `roof-sign.glb` | 屋顶标牌 **v2**（蓝色 UNV，330 面） | 同上 |

注意：`props/roof-sign.glb` 是 v1，根目录的 `roof-sign.glb` 是 v2。app（175f1ca）的 `public/models/roof-sign.glb` 目前还是 v1。换成 v2 由场景开发把根目录这个文件拷过去，路径和材质槽都不用改。

## D029 入库（2026-09-29 01:57 UTC+8）
流水线：`tools/scripts/build-d029.sh` 调用 `props-build.mjs`，依次执行 dedup、weld、prune、reorder、法线量化（8 bit）、EXT_meshopt_compression。POSITION 保留 float32，不合并材质槽。加载时需要 `loader.setMeshoptDecoder(MeshoptDecoder)`。

| 文件 | 三角面 | 顶点 | 网格/图元/材质 | 包围盒（米） | 原始 B | 压缩后 B | gzip -9 B | 绘制调用 |
|---|---|---|---|---|---|---|---|---|
| east-grille-hi.glb | 1,980 | 4,605 | 1/1/1 `east_grille` | (0,6,0.05)~(97.4,45.5,0.5)，97.40×39.50×0.45 | 123,736 | 41,760 | 3,872 | 1（开阴影时 +1） |
| east-grille-lo.glb | 366 | 945 | 1/1/1 `east_grille` | 同上 | 26,204 | 9,600 | 1,980 | 1（性能档无阴影） |
| roof-sign.glb（v2） | 330 | 669 | 1/3/3 `sign_face`,`sign_face_cn`,`sign_body` | (−7.5,0,0)~(7.5,3,0.57)，15×3×0.57 | 20,496 | 10,548 | 5,075 | 3（与 v1 相同） |

- 校验：gltf-validator 0 错误、0 警告（2 条 info：meshopt 扩展不支持校验，占位 buffer）。three 0.186.1 在 Node 里加载，结果和原始文件一致。
- 格栅局部坐标：原点在立面左下角、地面标高；+X 沿立面，+Z 朝外；已从 y=6.0 起。摆放时 `rotation.y=+π/2`，原点放在东立面南端外皮与地面的交点。
- ⚠️ 格栅按 97.40 m 墙长、45.5 m 顶标高生成。175f1ca 代码里东楼的东立面是 51.0 m，屋面 22.8 m，两者对不上。接入前要先定墙面，必要时让建模按 `WALL_LEN`/`TOP` 重新生成，详见 perf 记录。
- 屋顶标牌 v2：3 个图元，材质顺序和 v1 一致。实测（175f1ca 副本，1366×768）draw call 不变：perf 81、balanced 118。三角面减少 1,279。

- 01:58 补记：`props/roof-sign.glb` 已替换为 v2（与根目录 `roof-sign.glb` 相同）。旧的 v1 压缩版备份在 `assets/src/backup/roof-sign-v1-ready-meshopt.glb`。

- 02:01 补记：`east-grille-hi.glb` 和 `east-grille-lo.glb` 是临时版，不要接进场景（D032）。T002 第二次返工提交后，3D建模会按东墙实际长度、错开位置和 45.5 m 高度重新生成，届时我再重新压缩入库。
