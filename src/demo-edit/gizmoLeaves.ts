import {
  BufferGeometry,
  Float32BufferAttribute,
  MeshBasicMaterial,
  Object3D,
  Vector3,
  type BufferGeometry as BufferGeometryType,
  type Frustum,
  type FrustumArray,
  type Material,
} from 'three'

/**
 * 这六个类只给 three-stdlib TransformControls 和摆点球标用。
 * 它们已经在 three 入口包里，再从 'three' 点名会多出 early index 的 export。
 * 拖动手柄仍用入口包里的 Object3D / Mesh / Quaternion，避免第二份 three。
 */

const EULER_ORDER = 'XYZ'

function setKind(object: object, type: string): void {
  ;(object as { type: string }).type = type
}

export class Euler {
  isEuler = true
  _x = 0
  _y = 0
  _z = 0
  _order: string = EULER_ORDER

  constructor(x = 0, y = 0, z = 0, order = EULER_ORDER) {
    this._x = x
    this._y = y
    this._z = z
    this._order = order
  }

  set(x: number, y: number, z: number, order = this._order): this {
    this._x = x
    this._y = y
    this._z = z
    this._order = order
    return this
  }
}

export class LineBasicMaterial extends MeshBasicMaterial {
  isLineBasicMaterial = true
  linewidth = 1
  linecap = 'round'
  linejoin = 'round'

  constructor(parameters?: Record<string, unknown>) {
    super()
    setKind(this, 'LineBasicMaterial')
    if (parameters) this.setValues(parameters)
  }

  override copy(source: MeshBasicMaterial): this {
    super.copy(source)
    const line = source as LineBasicMaterial
    if (typeof line.linewidth === 'number') this.linewidth = line.linewidth
    if (typeof line.linecap === 'string') this.linecap = line.linecap
    if (typeof line.linejoin === 'string') this.linejoin = line.linejoin
    this.isLineBasicMaterial = true
    setKind(this, 'LineBasicMaterial')
    return this
  }
}

export class Line extends Object3D {
  isLine = true
  geometry: BufferGeometryType
  material: Material | Material[]

  constructor(geometry?: BufferGeometryType, material?: Material | Material[]) {
    super()
    setKind(this, 'Line')
    this.geometry = geometry ?? new BufferGeometry()
    this.material = material ?? new LineBasicMaterial()
  }

  override copy(source: this, recursive?: boolean): this {
    super.copy(source, recursive)
    this.geometry = source.geometry
    this.material = Array.isArray(source.material) ? source.material.slice() : source.material
    return this
  }

  override intersectsFrustum(frustum: Frustum | FrustumArray): boolean {
    return frustum.intersectsObject(this)
  }
}

const OCTA_VERTICES = [1, 0, 0, -1, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 1, 0, 0, -1]
const OCTA_INDICES = [0, 2, 4, 0, 4, 3, 0, 3, 5, 0, 5, 2, 1, 2, 5, 1, 5, 3, 1, 3, 4, 1, 4, 2]

function readOctaVertex(index: number, target: Vector3): void {
  const stride = index * 3
  target.set(OCTA_VERTICES[stride], OCTA_VERTICES[stride + 1], OCTA_VERTICES[stride + 2])
}

function pushVertex(out: number[], vertex: Vector3): void {
  out.push(vertex.x, vertex.y, vertex.z)
}

function subdivideFace(a: Vector3, b: Vector3, c: Vector3, detail: number, out: number[]): void {
  const cols = detail + 1
  const grid: Vector3[][] = []
  for (let i = 0; i <= cols; i += 1) {
    grid[i] = []
    const aj = a.clone().lerp(c, i / cols)
    const bj = b.clone().lerp(c, i / cols)
    const rows = cols - i
    for (let j = 0; j <= rows; j += 1) {
      grid[i][j] = j === 0 && i === cols ? aj : aj.clone().lerp(bj, j / rows)
    }
  }
  for (let i = 0; i < cols; i += 1) {
    for (let j = 0; j < 2 * (cols - i) - 1; j += 1) {
      const k = Math.floor(j / 2)
      if (j % 2 === 0) {
        pushVertex(out, grid[i][k + 1])
        pushVertex(out, grid[i + 1][k])
        pushVertex(out, grid[i][k])
      } else {
        pushVertex(out, grid[i][k + 1])
        pushVertex(out, grid[i + 1][k + 1])
        pushVertex(out, grid[i + 1][k])
      }
    }
  }
}

export class OctahedronGeometry extends BufferGeometry {
  constructor(radius = 1, detail = 0) {
    super()
    setKind(this, 'OctahedronGeometry')
    const positions: number[] = []
    const a = new Vector3()
    const b = new Vector3()
    const c = new Vector3()
    for (let index = 0; index < OCTA_INDICES.length; index += 3) {
      readOctaVertex(OCTA_INDICES[index], a)
      readOctaVertex(OCTA_INDICES[index + 1], b)
      readOctaVertex(OCTA_INDICES[index + 2], c)
      subdivideFace(a, b, c, detail, positions)
    }
    const vertex = new Vector3()
    for (let index = 0; index < positions.length; index += 3) {
      vertex.set(positions[index], positions[index + 1], positions[index + 2]).normalize().multiplyScalar(radius)
      positions[index] = vertex.x
      positions[index + 1] = vertex.y
      positions[index + 2] = vertex.z
    }
    this.setAttribute('position', new Float32BufferAttribute(positions, 3))
    this.computeVertexNormals()
  }
}

export class TorusGeometry extends BufferGeometry {
  constructor(radius = 1, tube = 0.4, radialSegments = 12, tubularSegments = 48) {
    super()
    setKind(this, 'TorusGeometry')
    radialSegments = Math.floor(radialSegments)
    tubularSegments = Math.floor(tubularSegments)
    const indices: number[] = []
    const vertices: number[] = []
    const normals: number[] = []
    const center = new Vector3()
    const vertex = new Vector3()
    const normal = new Vector3()
    for (let j = 0; j <= radialSegments; j += 1) {
      const v = (j / radialSegments) * Math.PI * 2
      for (let i = 0; i <= tubularSegments; i += 1) {
        const u = (i / tubularSegments) * Math.PI * 2
        vertex.x = (radius + tube * Math.cos(v)) * Math.cos(u)
        vertex.y = (radius + tube * Math.cos(v)) * Math.sin(u)
        vertex.z = tube * Math.sin(v)
        vertices.push(vertex.x, vertex.y, vertex.z)
        center.x = radius * Math.cos(u)
        center.y = radius * Math.sin(u)
        center.z = 0
        normal.subVectors(vertex, center).normalize()
        normals.push(normal.x, normal.y, normal.z)
      }
    }
    for (let j = 1; j <= radialSegments; j += 1) {
      for (let i = 1; i <= tubularSegments; i += 1) {
        const a = (tubularSegments + 1) * j + i - 1
        const b = (tubularSegments + 1) * (j - 1) + i - 1
        const c = (tubularSegments + 1) * (j - 1) + i
        const d = (tubularSegments + 1) * j + i
        indices.push(a, b, d, b, c, d)
      }
    }
    this.setIndex(indices)
    this.setAttribute('position', new Float32BufferAttribute(vertices, 3))
    this.setAttribute('normal', new Float32BufferAttribute(normals, 3))
  }
}

export class SphereGeometry extends BufferGeometry {
  constructor(radius = 1, widthSegments = 32, heightSegments = 16) {
    super()
    setKind(this, 'SphereGeometry')
    widthSegments = Math.max(3, Math.floor(widthSegments))
    heightSegments = Math.max(2, Math.floor(heightSegments))
    const indices: number[] = []
    const vertices: number[] = []
    const normals: number[] = []
    const grid: number[][] = []
    const vertex = new Vector3()
    const normal = new Vector3()
    let index = 0
    for (let iy = 0; iy <= heightSegments; iy += 1) {
      const row: number[] = []
      const v = iy / heightSegments
      const theta = v * Math.PI
      const y = radius * Math.cos(theta)
      const ring = Math.sqrt(radius * radius - y * y)
      for (let ix = 0; ix <= widthSegments; ix += 1) {
        const phi = (ix / widthSegments) * Math.PI * 2
        vertex.x = -ring * Math.cos(phi)
        vertex.y = y
        vertex.z = ring * Math.sin(phi)
        vertices.push(vertex.x, vertex.y, vertex.z)
        normal.copy(vertex).normalize()
        normals.push(normal.x, normal.y, normal.z)
        row.push(index)
        index += 1
      }
      grid.push(row)
    }
    for (let iy = 0; iy < heightSegments; iy += 1) {
      for (let ix = 0; ix < widthSegments; ix += 1) {
        const a = grid[iy][ix + 1]
        const b = grid[iy][ix]
        const c = grid[iy + 1][ix]
        const d = grid[iy + 1][ix + 1]
        if (iy !== 0) indices.push(a, b, d)
        if (iy !== heightSegments - 1) indices.push(b, c, d)
      }
    }
    this.setIndex(indices)
    this.setAttribute('position', new Float32BufferAttribute(vertices, 3))
    this.setAttribute('normal', new Float32BufferAttribute(normals, 3))
  }
}
