import type { BoxShader } from './collect'

/**
 * drei 10.7.9 的 useBoxProjectedEnv 仍按 r185 之前的函数名打补丁。
 * three 0.186 改成了 transformNormalByInverseViewMatrix / transformDirectionByInverseViewMatrix，
 * 那两处替换落空，parallaxCorrectNormal 不会被调用。
 * 钩子还会把 worldpos_vertex 整段换成不带 instanceMatrix 的写法，工位是实例网格，阴影和盒子都会偏。
 * 这里在钩子的 onBeforeCompile 之后补上这三处，不重写钩子。
 */

const HOOK_WORLD = 'vec4 worldPosition = modelMatrix * vec4( transformed, 1.0 );'

const INSTANCED_WORLD = `vec4 worldPosition = vec4( transformed, 1.0 );
  #ifdef USE_BATCHING
    worldPosition = batchingMatrix * worldPosition;
  #endif
  #ifdef USE_INSTANCING
    worldPosition = instanceMatrix * worldPosition;
  #endif
  worldPosition = modelMatrix * worldPosition;`

const IRRADIANCE_NEW = 'vec3 worldNormal = transformNormalByInverseViewMatrix( normal, viewMatrix );'

const RADIANCE_NEW = 'reflectVec = transformDirectionByInverseViewMatrix( reflectVec, viewMatrix );'

const IRRADIANCE_CALL = `worldNormal = parallaxCorrectNormal( worldNormal, envMapSize, envMapPosition );`

const RADIANCE_CALL = `reflectVec = parallaxCorrectNormal( reflectVec, envMapSize, envMapPosition );`

function insertCall(source: string, line: string, call: string): string {
  if (source.includes(call)) return source
  if (!source.includes(line)) return source
  return source.replace(line, `${line}\n${call}`)
}

/** 钩子跑完之后调用。已经补过的着色器再进来不会叠第二次。 */
export function finishBoxProjection(shader: BoxShader): void {
  if (shader.defines?.BOX_PROJECTED_ENV_MAP !== true) return
  if (shader.vertexShader.includes(HOOK_WORLD) && !shader.vertexShader.includes('instanceMatrix')) {
    shader.vertexShader = shader.vertexShader.replace(HOOK_WORLD, INSTANCED_WORLD)
  }
  shader.fragmentShader = insertCall(shader.fragmentShader, IRRADIANCE_NEW, IRRADIANCE_CALL)
  shader.fragmentShader = insertCall(shader.fragmentShader, RADIANCE_NEW, RADIANCE_CALL)
}
