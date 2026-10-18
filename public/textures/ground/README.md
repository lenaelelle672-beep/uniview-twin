# 场地贴图（法线 + 粗糙度）

Poly Haven [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)。许可说明：<https://polyhaven.com/license>。

只要 OpenGL 法线（`nor_gl`）和粗糙度，各 1024²，由官方 1k JPG 转为 WebP quality 80。没有反照率，没有金属度。运行时只读本目录，不回源 Poly Haven。

| 文件 | 表面 | 资产 | 作者 | 物理边长 |
| --- | --- | --- | --- | --- |
| `grass_nor.webp` / `grass_rough.webp` | 草地 | [aerial_grass_rock](https://polyhaven.com/a/aerial_grass_rock) | Rob Tuytel | 15 m |
| `road_nor.webp` / `road_rough.webp` | 道路 | [asphalt_02](https://polyhaven.com/a/asphalt_02) | Rob Tuytel | 3 m |
| `paving_nor.webp` / `paving_rough.webp` | 铺装 | [concrete_pavement](https://polyhaven.com/a/concrete_pavement) | Charlotte Baglioni | 1.8 m |
| `sidewalk_nor.webp` / `sidewalk_rough.webp` | 人行道 | [concrete_floor_painted](https://polyhaven.com/a/concrete_floor_painted) | Rob Tuytel | 2 m |

物理边长取自 Poly Haven `info.dimensions`（毫米）。几何 UV 以米计，`repeat = 1 / 边长`。
