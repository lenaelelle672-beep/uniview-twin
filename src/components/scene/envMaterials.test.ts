import { describe, expect, it } from 'vitest'
import { curtainMaterial, eaveMaterial, finMaterial, grilleMaterial, jointMaterial } from '../../scene/materials'
import { REFLECTIVE_ENV_MATERIALS } from './LocalEnvironment'

describe('反射材质名单', () => {
  it('五个自带材质按英文键登记', () => {
    expect(REFLECTIVE_ENV_MATERIALS.curtain).toBe(curtainMaterial)
    expect(REFLECTIVE_ENV_MATERIALS.joint).toBe(jointMaterial)
    expect(REFLECTIVE_ENV_MATERIALS.grille).toBe(grilleMaterial)
    expect(REFLECTIVE_ENV_MATERIALS.eave).toBe(eaveMaterial)
    expect(REFLECTIVE_ENV_MATERIALS.fin).toBe(finMaterial)
  })
})
