/**
 * 从已经哈希定稿的生产包里认出 React / fiber / three 的导出名。
 * 格网分包要复用入口包里的同一份类，不能再打一份 three，否则
 * `instanceof Color` 对不上，R3F 不会把颜色字符串写进 uniform。
 */

export interface GridThreeNames {
  Color: string
  Vector3: string
  Plane: string
  ShaderMaterial: string
  MathUtils: string
  BackSide: string
  DoubleSide: string
  REVISION: string
  Uniform: string
  UniformsUtils: string
}

export interface GridBindings {
  indexFile: string
  react: string
  jsx: string
  useThree: string
  useFrame: string
  extend: string
  store: string
  three: GridThreeNames
}

const THREE_KEYS = [
  'Color',
  'Vector3',
  'Plane',
  'ShaderMaterial',
  'MathUtils',
  'BackSide',
  'DoubleSide',
  'REVISION',
  'Uniform',
  'UniformsUtils',
] as const

function fail(message: string): never {
  throw new Error(`T059：${message}`)
}

function importMap(source: string, indexFile: string): Map<string, string> {
  const map = new Map<string, string>()
  const pattern = /import\s*\{([^}]+)\}\s*from\s*["']\.\/([^"']+)["']/g
  for (const match of source.matchAll(pattern)) {
    if (match[2] !== indexFile) continue
    for (const part of match[1].split(',')) {
      const piece = part.trim()
      if (!piece) continue
      const [exported, local] = piece.split(/\s+as\s+/)
      map.set((local ?? exported).trim(), exported.trim())
    }
  }
  if (map.size === 0) fail(`没有从 ${indexFile} 导入的绑定`)
  return map
}

function indexFileFrom(source: string): string {
  const match = source.match(/from\s*["']\.\/(index-[^"']+\.js)["']/)
  if (!match) fail('找不到入口包文件名')
  return match[1]
}

function threeNames(indexCode: string, exportedByLocal: Map<string, string>): GridThreeNames {
  const pattern = /__proto__\s*:\s*null,([\s\S]*?)\}\s*,\s*Symbol\.toStringTag/g
  let body: string | null = null
  for (const match of indexCode.matchAll(pattern)) {
    if (match[1].includes('AxesHelper:') && match[1].includes('ShaderMaterial:') && match[1].includes('Color:')) {
      body = match[1]
      break
    }
  }
  if (!body) fail('入口包里没有 three 的命名空间对象')
  const names = {} as GridThreeNames
  for (const key of THREE_KEYS) {
    const found = body.match(new RegExp(`\\b${key}:([A-Za-z_$][\\w$]*)`))
    if (!found) fail(`three 命名空间缺少 ${key}`)
    const exported = exportedByLocal.get(found[1])
    if (!exported) fail(`three.${key} 没有从入口包导出`)
    names[key] = exported
  }
  return names
}

function exportMap(indexCode: string): Map<string, string> {
  const tail = indexCode.slice(indexCode.lastIndexOf('export{'))
  const map = new Map<string, string>()
  for (const match of tail.matchAll(/([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)/g)) {
    map.set(match[1], match[2])
  }
  if (map.size === 0) fail('入口包没有导出表')
  return map
}

export function discoverGridBindings(indexCode: string, dockCode: string, loopCode: string): GridBindings {
  const indexFile = indexFileFrom(dockCode)
  if (indexFileFrom(loopCode) !== indexFile) fail('DemandLoop 和 dock 不是同一个入口包')
  const dockMap = importMap(dockCode, indexFile)
  const loopMap = importMap(loopCode, indexFile)
  const exportedByLocal = exportMap(indexCode)

  const extend = indexCode.match(
    /function ([A-Za-z_$][\w$]*)\(([A-Za-z_$][\w$]*)\)\{if\(([A-Za-z_$][\w$]*)\(\2\)\)\{const ([A-Za-z_$][\w$]*)=`\$\{[A-Za-z_$][\w$]*\+\+\}`;return ([A-Za-z_$][\w$]*)\[\4\]=\2,\4\}else Object\.assign\(\5,\2\)\}/,
  )
  if (!extend) fail('找不到 fiber extend')
  const extendExport = exportedByLocal.get(extend[1])
  if (!extendExport) fail('extend 没有从入口包导出')

  const useThree = loopCode.match(/([A-Za-z_$][\w$]*)\(([A-Za-z_$][\w$]*)=>\2\.invalidate\)/)
  if (!useThree) fail('找不到 useThree')
  const useThreeExport = loopMap.get(useThree[1])
  if (!useThreeExport) fail('useThree 不是从入口包导入的')

  const useFrame = loopCode.match(/([A-Za-z_$][\w$]*)\(\(\{clock:/)
  if (!useFrame) fail('找不到 useFrame')
  const useFrameExport = loopMap.get(useFrame[1])
  if (!useFrameExport) fail('useFrame 不是从入口包导入的')

  let store = ''
  for (const [local, exported] of dockMap) {
    if (dockCode.includes(`${local}.getState`)) {
      store = exported
      break
    }
  }
  if (!store) fail('找不到 store')

  let react = ''
  for (const [local, exported] of dockMap) {
    if (dockCode.includes(`${local}.useState`) && dockCode.includes(`${local}.lazy`)) {
      react = exported
      break
    }
  }
  if (!react) fail('找不到 React')

  let jsx = ''
  for (const [local, exported] of dockMap) {
    if (dockCode.includes(`${local}.jsx`) && dockCode.includes(`${local}.jsxs`)) {
      jsx = exported
      break
    }
  }
  if (!jsx) fail('找不到 jsx runtime')

  return {
    indexFile,
    react,
    jsx,
    useThree: useThreeExport,
    useFrame: useFrameExport,
    extend: extendExport,
    store,
    three: threeNames(indexCode, exportedByLocal),
  }
}
