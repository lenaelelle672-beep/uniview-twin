import { Mesh } from 'three'

/**
 * three-mesh-bvh 初始化时会读 BatchedMesh.prototype.raycast。
 * 场景里没有 BatchedMesh。若从 three 入口再导出这个类，首屏 index 会多一截 export。
 * 这个空子类只给那一行用，射线仍走共享的 Mesh。
 */
export class BatchedMesh extends Mesh {}
