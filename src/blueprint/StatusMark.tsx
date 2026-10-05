import type { DeviceStatus } from '../types'
import { STATUS_HEX, STATUS_SHAPE } from '../scene/stage/status'

/** 状态符号。size 是半宽，圆心在 (cx, cy)，蓝图平面和图例共用。 */
export function StatusMark({
  status,
  cx,
  cy,
  size,
  selected = false,
}: {
  status: DeviceStatus
  cx: number
  cy: number
  size: number
  selected?: boolean
}) {
  const color = STATUS_HEX[status]
  const shape = STATUS_SHAPE[status]
  const ring = selected ? (
    <circle cx={cx} cy={cy} r={size * 1.85} fill="none" stroke="#0c2340" strokeWidth={Math.max(size * 0.28, 0.08)} />
  ) : null

  if (shape === 'circle') {
    return (
      <g>
        {ring}
        <circle cx={cx} cy={cy} r={size} fill={color} />
      </g>
    )
  }

  if (shape === 'square') {
    return (
      <g>
        {ring}
        <rect x={cx - size} y={cy - size} width={size * 2} height={size * 2} fill={color} />
      </g>
    )
  }

  if (shape === 'triangle') {
    const height = size * 1.75
    const half = size * 1.45
    const points = `${cx},${cy - height} ${cx - half},${cy + height * 0.7} ${cx + half},${cy + height * 0.7}`
    return (
      <g>
        {ring}
        <polygon points={points} fill={color} />
      </g>
    )
  }

  const arm = size * 0.9
  return (
    <g>
      {ring}
      <path
        d={`M ${cx - arm} ${cy - arm} L ${cx + arm} ${cy + arm} M ${cx + arm} ${cy - arm} L ${cx - arm} ${cy + arm}`}
        stroke={color}
        strokeWidth={size * 0.45}
        strokeLinecap="round"
        fill="none"
      />
    </g>
  )
}
