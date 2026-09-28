import type { TwinData } from '../types'
import { workstationIps } from './ref'

export interface WorkstationHit {
  deskId: string
  floorId: string
  personName: string
  pcIp: string
  phoneIp: string
  title: string
  subtitle: string
}

export function searchWorkstations(
  data: Pick<TwinData, 'desks' | 'people'>,
  query: string,
  limit = 10,
): WorkstationHit[] {
  const needle = query.trim().toLowerCase()
  if (!needle || limit <= 0) return []

  const namesByDesk = new Map<string, string[]>()
  for (const person of data.people) {
    const names = namesByDesk.get(person.deskId)
    if (names) names.push(person.name)
    else namesByDesk.set(person.deskId, [person.name])
  }

  const hits: Array<WorkstationHit & { rank: number }> = []
  for (const desk of data.desks) {
    const names = namesByDesk.get(desk.id) ?? []
    const personName = names.length > 0 ? names.join('、') : '—'
    let ips: { pc: string; phone: string }
    try {
      ips = workstationIps(desk.floorId, desk.id)
    } catch {
      continue
    }
    const ranked = bestRank(
      [
        [desk.id, desk.id],
        [personName, personName],
        [ips.pc, ips.pc],
        [ips.phone, ips.phone],
      ],
      needle,
    )
    if (!ranked) continue
    hits.push({
      deskId: desk.id,
      floorId: desk.floorId,
      personName,
      pcIp: ips.pc,
      phoneIp: ips.phone,
      title: ranked.title,
      subtitle: `${desk.floorId} · ${personName} · ${ips.pc}`,
      rank: ranked.rank,
    })
  }

  hits.sort((left, right) => left.rank - right.rank || left.deskId.localeCompare(right.deskId, 'en'))
  return hits.slice(0, limit).map((hit) => ({
    deskId: hit.deskId,
    floorId: hit.floorId,
    personName: hit.personName,
    pcIp: hit.pcIp,
    phoneIp: hit.phoneIp,
    title: hit.title,
    subtitle: hit.subtitle,
  }))
}

function bestRank(fields: Array<[string, string]>, needle: string): { rank: number; title: string } | null {
  let best: { rank: number; title: string } | null = null
  for (const [field, title] of fields) {
    const rank = rankOf(field, needle)
    if (rank === null) continue
    if (!best || rank < best.rank) best = { rank, title }
  }
  return best
}

function rankOf(field: string, needle: string): number | null {
  const haystack = field.toLowerCase()
  if (!haystack) return null
  if (haystack === needle) return 0
  if (haystack.startsWith(needle)) return 1
  if (haystack.includes(needle)) return 2
  return null
}
