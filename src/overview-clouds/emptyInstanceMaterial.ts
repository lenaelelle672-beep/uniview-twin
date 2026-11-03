type MatrixWriter = {
  toArray: (array: ArrayLike<number>, offset: number) => void
}

type InstanceHost = {
  material: unknown
  instanceMatrix: { array: ArrayLike<number> }
}

type SetMatrixAt = ((this: InstanceHost, index: number, matrix: MatrixWriter) => void) & {
  emptyMaterialSafe?: boolean
}

type Proto = {
  setMatrixAt: SetMatrixAt
}

const SAFE = new WeakSet<SetMatrixAt>()

function protoWithSetMatrixAt(object: object): Proto | null {
  let current: object | null = object
  while (current) {
    const desc = Object.getOwnPropertyDescriptor(current, 'setMatrixAt')
    if (desc && typeof desc.value === 'function') return current as Proto
    current = Object.getPrototypeOf(current)
  }
  return null
}

/**
 * drei Cloud 用 `new InstancedMesh(null, null, limit)` 造网格。
 * 构造函数立刻 setMatrixAt，而重复件补丁会读 material.name。
 * 空材质按 three 原样写入；有名字的树和灯仍走原来的动态缓冲。
 * 从场景里已有的实例网格摸到同一个原型，不另起一份 three。
 */
export function tolerateEmptyInstanceMaterial(root: {
  traverse: (fn: (object: object) => void) => void
}): boolean {
  const found: { proto: Proto | null } = { proto: null }
  root.traverse((object) => {
    if (found.proto) return
    found.proto = protoWithSetMatrixAt(object)
  })
  const proto = found.proto
  if (!proto) return false
  const write = proto.setMatrixAt
  if (SAFE.has(write)) return true
  const next: SetMatrixAt = function (this: InstanceHost, index: number, matrix: MatrixWriter) {
    if (this.material == null) {
      matrix.toArray(this.instanceMatrix.array, index * 16)
      return
    }
    return write.call(this, index, matrix)
  }
  next.emptyMaterialSafe = true
  SAFE.add(next)
  proto.setMatrixAt = next
  return true
}
