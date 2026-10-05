import { describe, expect, it } from 'vitest'
import { curtainMaterial, eaveMaterial, finMaterial, grilleMaterial, jointMaterial } from '../../scene/materials'
import { REFLECTIVE_ENV_MATERIALS } from './LocalEnvironment'

describe('反射材质名单', () => {
  it('五个自带材质按中文名登记，且 name 与键一致', () => {
    expect(REFLECTIVE_ENV_MATERIALS['幕墙']).toBe(curtainMaterial)
    expect(REFLECTIVE_ENV_MATERIALS['接缝']).toBe(jointMaterial)
    expect(REFLECTIVE_ENV_MATERIALS['格栅']).toBe(grilleMaterial)
    expect(REFLECTIVE_ENV_MATERIALS['檐口']).toBe(eaveMaterial)
    expect(REFLECTIVE_ENV_MATERIALS['铝翅']).toBe(finMaterial)
    for (const [name, material] of Object.entries(REFLECTIVE_ENV_MATERIALS)) {
      expect(material.name).toBe(name)
    }
  })
})
