/**
 * 生产分包里的 three 只留测量和 Bounds 动画要用的类。
 * 场景对象仍是入口包那一份；这里的盒子只读 matrixWorld / geometry。
 */
export { Box3 } from 'three/src/math/Box3.js'
export { Vector3 } from 'three/src/math/Vector3.js'
export { Sphere } from 'three/src/math/Sphere.js'
export { Quaternion } from 'three/src/math/Quaternion.js'
export { Matrix4 } from 'three/src/math/Matrix4.js'
export { Object3D } from 'three/src/core/Object3D.js'
export { BufferGeometry } from 'three/src/core/BufferGeometry.js'
export { Float32BufferAttribute } from 'three/src/core/BufferAttribute.js'
