# 东楼基座石材（法线 + 粗糙度）

Poly Haven [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)。许可说明：<https://polyhaven.com/license>。作者：Rob Tuytel。

只要 OpenGL 法线（`nor_gl`）和粗糙度，1024²，由官方 1k JPG 转为 WebP quality 80。没有反照率，没有金属度。基色走已有 `stoneMaterial`。运行时只读本目录，不回源 Poly Haven。

| 文件 | 字节 | 资产 | 物理边长 |
| --- | ---: | --- | --- |
| `large_sandstone_blocks_nor.webp` / `large_sandstone_blocks_rough.webp` | 76902 / 64870 | [large_sandstone_blocks](https://polyhaven.com/a/large_sandstone_blocks) | 3.0 m |

物理边长取自 Poly Haven `info.dimensions`（3000 mm）。几何 UV 以米计，`repeat = 1 / 3`。这是 trimsheet，上下有线脚；墙面 V 把线脚对在基座顶/底，不把线脚带当无缝砌块竖向平铺。色偏风化灰。懒载，等 `__twinReady` 后再赋图，不进 hardGate / fxFiles。
