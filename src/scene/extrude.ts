import { ExtrudeGeometry, Path, Shape, ShapeUtils, Vector2 } from 'three'

function ring(points: Array<[number, number]>, hole: boolean): Vector2[] {
  const vectors = points.map(([x, z]) => new Vector2(x, -z))
  const clockwise = ShapeUtils.isClockWise(vectors)
  if (hole ? !clockwise : clockwise) vectors.reverse()
  return vectors
}

/** 把 XZ 平面上的多边形向上挤出。孔洞在挤出前按相反绕向写入。 */
export function extrudeUp(
  outline: Array<[number, number]>,
  height: number,
  holes: Array<Array<[number, number]>> = [],
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
  geometry.computeVertexNormals()
  return geometry
}
