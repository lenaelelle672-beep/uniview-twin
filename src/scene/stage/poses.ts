/**
 * fitToBox 会把视角吸到最近的轴向。种子放在长边的侧面、略高于楼板，
 * 极角才会落到斜上方，而不是正上方或贴着南墙。
 */
export function obliqueOverviewSeed(
  center: { x: number; y: number; z: number },
  size: { x: number; z: number },
): { position: [number, number, number]; target: [number, number, number] } {
  const span = Math.max(size.x, size.z, 8)
  const alongZ = size.x >= size.z
  return {
    position: [
      center.x + (alongZ ? 0 : span),
      center.y + span * 0.62,
      center.z + (alongZ ? span : 0),
    ],
    target: [center.x, center.y, center.z],
  }
}
