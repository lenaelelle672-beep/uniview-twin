import type { AlarmFloorRange } from '../store/filterSlice'
import { DEVICE_STATUSES, type DeviceStatus } from '../types'
import { isFloorId } from '../data/floors'
import { effectiveStatuses } from './alarmRows'

const STATUS_SET = new Set<string>(DEVICE_STATUSES)

export interface ReportLocation {
  range: AlarmFloorRange | null
  statusFilter: DeviceStatus[]
  quality: string | null
  dataUrl: string | null
}

export function buildReportSearch(input: {
  range: AlarmFloorRange | null
  statusFilter: readonly DeviceStatus[]
  quality: string | null
  dataUrl: string | null
}): string {
  const params = new URLSearchParams()
  if (input.quality) params.set('q', input.quality)
  if (input.dataUrl) params.set('data', input.dataUrl)
  if (input.range) {
    params.set('alarmFrom', input.range.start)
    params.set('alarmTo', input.range.end)
  }
  const statuses = effectiveStatuses(input.statusFilter)
  const alarmOnly = statuses.length === 1 && statuses[0] === 'alarm'
  if (!alarmOnly) params.set('alarmStatus', statuses.join(','))
  const query = params.toString().replace(/%2F/g, '/')
  return query ? `?${query}` : ''
}

export function parseReportFilter(search: string): ReportLocation {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  const from = params.get('alarmFrom')
  const to = params.get('alarmTo')
  const range = from && to && isFloorId(from) && isFloorId(to) ? { start: from, end: to } : null
  const raw = params.get('alarmStatus')
  let statusFilter: DeviceStatus[] = ['alarm']
  if (raw != null && raw.trim() !== '') {
    const parsed = raw.split(',').filter((item): item is DeviceStatus => STATUS_SET.has(item))
    if (parsed.length > 0) statusFilter = parsed
  }
  const quality = params.get('q')
  const dataUrl = params.get('data')
  return {
    range,
    statusFilter,
    quality: quality && quality.length > 0 ? quality : null,
    dataUrl: dataUrl && dataUrl.length > 0 ? dataUrl : null,
  }
}

export function mainSearchFromReport(search: string): string {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  const next = new URLSearchParams()
  const quality = params.get('q')
  const dataUrl = params.get('data')
  if (quality) next.set('q', quality)
  if (dataUrl) next.set('data', dataUrl)
  const query = next.toString().replace(/%2F/g, '/')
  return query ? `?${query}` : ''
}
