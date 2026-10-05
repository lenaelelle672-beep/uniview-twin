import { ExtrudeGeometry, Path, Shape, ShapeUtils, Vector2, Vector3, type BufferGeometry } from 'three'

function ring(points: Array<[number, number]>, hole: boolean): Vector2[] {
  const vectors = points.map(([x, z]) => new Vector2(x, -z))
  const clockwise = ShapeUtils.isClockWise(vectors)
  if (hole ? !clockwise : clockwise) vectors.reverse()
  return vectors
}

/** 丢掉朝下的底面（总览看不见）。 */
export function dropBottomFaces(geometry: BufferGeometry): BufferGeometry {
  const pos = geometry.getAttribute('position')
  if (!pos) return geometry
  if (!geometry.getIndex()) {
    const indices: number[] = []
    for (let i = 0; i < pos.count; i += 1) indices.push(i)
    geometry.setIndex(indices)
  }
  const index = geometry.getIndex()
  if (!index) return geometry
  const kept: number[] = []
  const a = new Vector3()
  const b = new Vector3()
  const c = new Vector3()
  const ab = new Vector3()
  const ac = new Vector3()
  const normal = new Vector3()
  for (let i = 0; i < index.count; i += 3) {
    const ia = index.getX(i)
    const ib = index.getX(i + 1)
    const ic = index.getX(i + 2)
    a.fromBufferAttribute(pos, ia)
    b.fromBufferAttribute(pos, ib)
    c.fromBufferAttribute(pos, ic)
    ab.subVectors(b, a)
    ac.subVectors(c, a)
    normal.crossVectors(ab, ac)
    if (normal.y >= -1e-5) kept.push(ia, ib, ic)
  }
  geometry.setIndex(kept)
  geometry.computeVertexNormals()
  return geometry
}

/** 把 XZ 平面上的多边形向上挤出。孔洞在挤出前按相反绕向写入。 */
export function extrudeUp(
  outline: Array<[number, number]>,
  height: number,
  holes: Array<Array<[number, number]>> = [],
  caps: 'both' | 'top' = 'both',
): ExtrudeGeometry {
  const shape = new Shape(ring(outline, false))
  holes.forEach((hole) => {
    shape.holes.push(new Path(ring(hole, true)))
  })
  const geometry = new ExtrudeGeometry(shape, {
    depth: height,
    bevelEnabled: false,
    curveSegments: 1,
    steps: 1,
  })
  geometry.rotateX(-Math.PI / 2)
  if (caps === 'top') dropBottomFaces(geometry)
  geometry.computeVertexNormals()
  return geometry
}
