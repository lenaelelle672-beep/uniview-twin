import type { AlarmFloorRange } from '../store/filterSlice'
import { deskCell, deviceCell, statusCell, type AlarmListRow } from './alarmRows'

export const CSV_COLUMNS = ['楼层', '工位', '设备', '状态', '时间', '说明'] as const

/**
 * 手写 CSV，不引入 papaparse：告警导出只有一张平表。
 * 文件以 U+FEFF 开头，Blob 按 UTF-8 编码后即带 BOM，Excel / WPS 打开中文不乱码。
 */
export function alarmsToCsv(rows: readonly AlarmListRow[]): string {
  const lines = [CSV_COLUMNS.join(',')]
  for (const row of rows) {
    lines.push(
      [row.floorId, deskCell(row), deviceCell(row), statusCell(row), row.time, row.message].map(csvCell).join(','),
    )
  }
  return `\uFEFF${lines.join('\r\n')}\r\n`
}

export function csvDataRowCount(csv: string): number {
  const text = csv.charCodeAt(0) === 0xfeff ? csv.slice(1) : csv
  const lines = text.split('\r\n').filter((line) => line.length > 0)
  return Math.max(0, lines.length - 1)
}

export function csvFilename(range: AlarmFloorRange | null): string {
  if (!range) return 'uniview-alarms.csv'
  return `uniview-alarms-${range.start}-${range.end}.csv`
}

function csvCell(value: string): string {
  if (/[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}
