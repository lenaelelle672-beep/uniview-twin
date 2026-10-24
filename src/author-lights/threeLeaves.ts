/**
 * 入口包的 three 命名空间里已经有这些类，但没有把它们再 export 出去。
 * 面光分包从 three/src 把缺的几份打进来，避免为了新导出名去改 early index。
 * UniformsLib 不在这里：渲染器读的是入口包里的那一份，init 必须写到同一对象上。
 */
export { RectAreaLight } from 'three/src/lights/RectAreaLight.js'
export { Line } from 'three/src/objects/Line.js'
export { LineBasicMaterial } from 'three/src/materials/LineBasicMaterial.js'
export { DataUtils } from 'three/src/extras/DataUtils.js'
export { UVMapping } from 'three/src/constants.js'
