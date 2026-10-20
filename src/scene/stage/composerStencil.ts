import {
  DepthStencilFormat,
  UnsignedInt248Type,
  type TextureDataType,
  type WebGLRenderTarget,
  type WebGLRenderer,
} from 'three'

/** 合成器把主场景画进没有模板的 FBO。不改 PostFX 源码，进层时只给这两张深度补上模板，回总览还原。 */
const STENCIL_DEPTH_NAMES = new Set(['EffectComposer.InputDepth', 'EffectComposer.StableDepth'])

export type DepthSnap = {
  stencilBuffer: boolean
  depthFormat: number | null
  depthType: TextureDataType | null
}

type GlProps = {
  get: (obj: object) => {
    __webglFramebuffer?: WebGLFramebuffer | null
    __webglTexture?: WebGLTexture | null
    __webglInit?: unknown
    __boundDepthTexture?: unknown
  }
}

export function isComposerStencilTarget(
  target: WebGLRenderTarget | null | undefined,
  input: WebGLRenderTarget | null | undefined,
): target is WebGLRenderTarget {
  if (!target) return false
  if (input && target === input) return true
  const name = target.depthTexture?.name
  return Boolean(name && STENCIL_DEPTH_NAMES.has(name))
}

export function captureDepthSnap(target: WebGLRenderTarget): DepthSnap {
  const depth = target.depthTexture
  return {
    stencilBuffer: target.stencilBuffer,
    depthFormat: depth ? depth.format : null,
    depthType: depth ? depth.type : null,
  }
}

/** 把目标标成带模板。已经是模板深度则返回 false。不 dispose，避免拆掉 N8AO 还握着的深度贴图对象。 */
export function assignStencilSettings(target: WebGLRenderTarget): boolean {
  const depth = target.depthTexture
  const depthReady = !depth || (depth.format === DepthStencilFormat && depth.type === UnsignedInt248Type)
  if (target.stencilBuffer && depthReady) return false
  target.stencilBuffer = true
  if (depth && !depthReady) {
    depth.format = DepthStencilFormat
    depth.type = UnsignedInt248Type
    const image = depth.image as { width?: number; height?: number }
    if (image && typeof image === 'object') {
      image.width = 0
      image.height = 0
    }
    depth.needsUpdate = true
  }
  return true
}

export function assignRestoredSettings(target: WebGLRenderTarget, snap: DepthSnap): boolean {
  const depth = target.depthTexture
  const depthMatches = !depth || snap.depthFormat == null || (depth.format === snap.depthFormat && depth.type === snap.depthType)
  if (target.stencilBuffer === snap.stencilBuffer && depthMatches) return false
  target.stencilBuffer = snap.stencilBuffer
  if (depth && snap.depthFormat != null && snap.depthType != null) {
    depth.format = snap.depthFormat as typeof depth.format
    depth.type = snap.depthType
    const image = depth.image as { width?: number; height?: number }
    if (image && typeof image === 'object') {
      image.width = 0
      image.height = 0
    }
    depth.needsUpdate = true
  }
  return true
}

function rendererProperties(gl: WebGLRenderer): GlProps | null {
  const props = (gl as WebGLRenderer & { properties?: GlProps }).properties
  return props ?? null
}

/** 丢掉旧 FBO，下一帧 setRenderTarget 会按新的 stencilBuffer / 深度格式重建。 */
export function dropRenderTargetGpu(gl: WebGLRenderer, target: WebGLRenderTarget) {
  const properties = rendererProperties(gl)
  if (!properties) return
  const ctx = gl.getContext()
  const rtProps = properties.get(target)
  if (rtProps.__webglFramebuffer) {
    ctx.deleteFramebuffer(rtProps.__webglFramebuffer)
    rtProps.__webglFramebuffer = undefined
  }
  rtProps.__boundDepthTexture = undefined
  const depth = target.depthTexture
  if (!depth) return
  const depthProps = properties.get(depth)
  if (depthProps.__webglTexture) {
    ctx.deleteTexture(depthProps.__webglTexture)
    depthProps.__webglTexture = undefined
  }
  depthProps.__webglInit = undefined
}

export type ComposerStencilArm = {
  note(target: WebGLRenderTarget | null): void
  restore(): void
}

/**
 * 包住 setRenderTarget。进层后第一次绑到合成器输入或稳定深度时补模板。
 * restore 先摘钩子再还原，避免还原过程又被钩子升级。
 */
export function armComposerStencil(gl: WebGLRenderer): ComposerStencilArm {
  const snaps = new Map<WebGLRenderTarget, DepthSnap>()
  let restoring = false
  const original = gl.setRenderTarget.bind(gl)

  const note = (target: WebGLRenderTarget | null) => {
    if (restoring || !isComposerStencilTarget(target, window.__twinComposerInput)) return
    if (!snaps.has(target)) snaps.set(target, captureDepthSnap(target))
    if (!assignStencilSettings(target)) return
    dropRenderTargetGpu(gl, target)
  }

  const wrapped = ((target: WebGLRenderTarget | null, activeCubeFace?: number, activeMipmapLevel?: number) => {
    note(target)
    original(target, activeCubeFace ?? 0, activeMipmapLevel ?? 0)
  }) as WebGLRenderer['setRenderTarget']
  gl.setRenderTarget = wrapped
  note(window.__twinComposerInput ?? null)

  return {
    note,
    restore() {
      if (gl.setRenderTarget === wrapped) gl.setRenderTarget = original
      restoring = true
      for (const [target, snap] of snaps) {
        if (!assignRestoredSettings(target, snap)) continue
        dropRenderTargetGpu(gl, target)
      }
      snaps.clear()
      restoring = false
    },
  }
}
