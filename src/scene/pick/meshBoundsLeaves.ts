/**
 * 生产分包里的 three 叶子。
 * 不从 three 入口再导出，避免 Ray / Matrix4 把 hardGate 顶过 436361。
 * 运行时只读写 .elements / .x，和主包里的网格是同一套数。
 */
export { Box3 } from 'three/src/math/Box3.js'
export { Matrix4 } from 'three/src/math/Matrix4.js'
export { Ray } from 'three/src/math/Ray.js'
export { Sphere } from 'three/src/math/Sphere.js'
export { Vector3 } from 'three/src/math/Vector3.js'
