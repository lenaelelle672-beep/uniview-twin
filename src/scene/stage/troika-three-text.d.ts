import type { ColorRepresentation, Mesh } from 'three'

declare module 'troika-three-text' {
  export class Text extends Mesh {
    text: string
    font: string
    fontSize: number
    color: ColorRepresentation
    outlineWidth: number
    /** troika：绝对世界单位，或相对 fontSize 的百分比字符串，例如 `"10%"`。 */
    outlineBlur?: number | string
    outlineColor: ColorRepresentation
    fillOpacity?: number
    outlineOpacity?: number
    anchorX: string | number
    anchorY: string | number
    characters?: string
    depthOffset?: number
    maxWidth?: number
    overflowWrap?: 'normal' | 'break-word'
    whiteSpace?: 'normal' | 'nowrap'
    sync(callback?: () => void): void
    dispose(): void
    textRenderInfo?: { blockBounds?: number[] } | null
  }

  export class BatchedText extends Text {
    addText(text: Text): void
    removeText(text: Text): void
  }

  export function preloadFont(
    options: { font?: string; characters?: string; sdfGlyphSize?: number },
    callback: (info?: { sdfTexture?: import('three').Texture }) => void,
  ): void

  export function getTextRenderInfo(
    args: { font?: string; text?: string; sdfGlyphSize?: number; lang?: string },
    callback: (info: { sdfTexture?: { image?: { width?: number; height?: number } } }) => void,
  ): void
}
