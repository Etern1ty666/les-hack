import { describe, expect, it } from 'vitest'
import {
  DECISIONS,
  MAP_MODES,
  SITE_CONDITIONS,
  SPECIES,
  colorForModeValue,
  hexToRgb,
} from '../constants'
import { DISTRICTS, DISTRICT_BY_ID } from '../districts'
import type { DecisionKind, SiteConditionCode, SpeciesCode } from '../types'

const ALL_SPECIES: SpeciesCode[] = ['pine', 'spruce', 'fir', 'larch', 'cedar', 'oak', 'ash', 'linden', 'birch', 'aspen', 'alder']
const ALL_KINDS: DecisionKind[] = ['natural', 'combined', 'artificial', 'insufficient_data']
const ALL_TLU: SiteConditionCode[] = ['A1', 'A2', 'A3', 'A4', 'B1', 'B2', 'B3', 'B4', 'C1', 'C2', 'C3', 'C4', 'D2', 'D3', 'D4']

describe('справочники', () => {
  it('у каждой породы есть запись', () => {
    for (const s of ALL_SPECIES) expect(SPECIES[s]?.nameRu).toBeTruthy()
  })

  it('у каждого решения есть запись и цвет', () => {
    for (const k of ALL_KINDS) expect(DECISIONS[k]?.rgb).toHaveLength(3)
  })

  it('у каждого ТЛУ есть запись', () => {
    for (const c of ALL_TLU) expect(SITE_CONDITIONS[c]?.labelRu).toBeTruthy()
    expect(SITE_CONDITIONS.B2.labelRu).toBe('Свежая суборь')
    expect(SITE_CONDITIONS.C3.labelRu).toBe('Влажный сугрудок')
  })

  it('у каждого лесного района есть зона, id уникальны', () => {
    expect(DISTRICTS).toHaveLength(18)
    for (const d of DISTRICTS) expect(d.zone).toBeTruthy()
    expect(Object.keys(DISTRICT_BY_ID)).toHaveLength(DISTRICTS.length)
  })

  it('режимы карты: 5 штук с клавишами 1–5', () => {
    expect(MAP_MODES.map((m) => m.hotkey)).toEqual(['1', '2', '3', '4', '5'])
  })
})

describe('colorForModeValue', () => {
  it('на стопах возвращает ровно цвет стопа', () => {
    for (const mode of MAP_MODES) {
      for (const stop of mode.legend.stops) {
        expect(colorForModeValue(mode.id, stop.value)).toEqual(hexToRgb(stop.color))
      }
    }
  })

  it('интерполирует между стопами и зажимает края', () => {
    const mid = colorForModeValue('sufficiency', 0.75)
    expect(mid).not.toEqual(hexToRgb('#FBBF24'))
    expect(mid).not.toEqual(hexToRgb('#34D399'))
    expect(colorForModeValue('sufficiency', -1)).toEqual(hexToRgb('#FB4D61'))
    expect(colorForModeValue('sufficiency', 99)).toEqual(hexToRgb('#36F1C2'))
  })

  it('null даёт цвет nullStop', () => {
    expect(colorForModeValue('inspection_age', null)).toEqual(hexToRgb('#5F7570'))
  })
})
