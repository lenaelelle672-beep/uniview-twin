import { CubeTexture, WebGLRenderTarget } from 'three'

type TargetOptions = NonNullable<ConstructorParameters<typeof WebGLRenderTarget>[2]>

/**
 * drei 的 CubeCamera 会 `new WebGLCubeRenderTarget(resolution)`。
 * 生产分包不能把 three 的整份 WebGLCubeRenderTarget（它还拖着 equirect 着色器）打进 CubeCamera.js。
 * 这里只保留构造函数那一段：换成 6 面的 CubeTexture，并标成立方体渲染目标。
 * 全景图转换那条路径不会被这次一次性探针调用。
 */
export class WebGLCubeRenderTarget extends WebGLRenderTarget {
  readonly isWebGLCubeRenderTarget = true

  constructor(size = 1, options?: TargetOptions) {
    super(size, size, options)
    const image = { width: size, height: size, depth: 1 }
    const images = [image, image, image, image, image, image]
    this.texture = new CubeTexture(images)
    const apply = this as WebGLRenderTarget & { _setTextureOptions?: (next?: TargetOptions) => void }
    apply._setTextureOptions?.(options)
    this.texture.isRenderTargetTexture = true
  }
}
