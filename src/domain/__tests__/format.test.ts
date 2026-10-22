import { describe, expect, it } from 'vitest'
import {
  NBSP,
  compositionFormula,
  fmtCompact,
  fmtDate,
  fmtDecimal,
  fmtHa,
  fmtInt,
  fmtLonLat,
  fmtPct,
  fmtPerHa,
  fmtRub,
  pluralRu,
} from '../format'

const s = (x: string) => x.replaceAll(' ', NBSP)

describe('fmtInt', () => {
  it('разделяет тысячи неразрывным пробелом', () => {
    expect(fmtInt(1234567)).toBe(s('1 234 567'))
    expect(fmtInt(999)).toBe('999')
    expect(fmtInt(1000)).toBe(s('1 000'))
  })
  it('ноль, отрицательные и округление', () => {
    expect(fmtInt(0)).toBe('0')
    expect(fmtInt(-2500)).toBe(s('−2 500'))
    expect(fmtInt(1839.6)).toBe(s('1 840'))
    expect(fmtInt(Number.NaN)).toBe('—')
  })
})

describe('fmtDecimal', () => {
  it('запятая и округление', () => {
    expect(fmtDecimal(8.25, 1)).toBe('8,3')
    expect(fmtDecimal(1234.5, 1)).toBe(s('1 234,5'))
    expect(fmtDecimal(-0.04, 1)).toBe('0,0')
  })
})

describe('fmtCompact', () => {
  it('тыс., млн, млрд', () => {
    expect(fmtCompact(612345)).toBe(s('612 тыс.'))
    expect(fmtCompact(412_000_000)).toBe(s('412 млн'))
    expect(fmtCompact(3.8e10)).toBe(s('38 млрд'))
    expect(fmtCompact(1.25e6)).toBe(s('1,3 млн'))
    expect(fmtCompact(2e6)).toBe(s('2 млн'))
    expect(fmtCompact(950)).toBe('950')
  })
})

describe('единицы', () => {
  it('га, шт/га, ₽, %', () => {
    expect(fmtHa(8.34)).toBe(s('8,3 га'))
    expect(fmtHa(2450)).toBe(s('2 450 га'))
    expect(fmtHa(612345)).toBe(s('612 тыс. га'))
    expect(fmtPerHa(2500)).toBe(s('2 500 шт/га'))
    expect(fmtRub(412_000)).toBe(s('≈ 412 тыс. ₽'))
    expect(fmtPct(0.723)).toBe(s('72 %'))
    expect(fmtPct(0.7236, 1)).toBe(s('72,4 %'))
  })
})

describe('даты и координаты', () => {
  it('fmtDate', () => {
    expect(fmtDate('2025-06-14')).toBe('14.06.2025')
    expect(fmtDate(null)).toBe('—')
  })
  it('fmtLonLat', () => {
    // между широтой и долготой — обычный пробел (допускается перенос)
    expect(fmtLonLat([44.1, 57.3])).toBe(`${s('57,30° с. ш.')} ${s('44,10° в. д.')}`)
    expect(fmtLonLat([-70, -33.5])).toBe(`${s('33,50° ю. ш.')} ${s('70,00° з. д.')}`)
  })
})

describe('pluralRu', () => {
  const forms: [string, string, string] = ['лесосека', 'лесосеки', 'лесосек']
  it.each([
    [0, 'лесосек'],
    [1, 'лесосека'],
    [2, 'лесосеки'],
    [4, 'лесосеки'],
    [5, 'лесосек'],
    [11, 'лесосек'],
    [12, 'лесосек'],
    [14, 'лесосек'],
    [21, 'лесосека'],
    [22, 'лесосеки'],
    [111, 'лесосек'],
    [-1, 'лесосека'],
  ])('%i → %s', (n, expected) => {
    expect(pluralRu(n, forms)).toBe(expected)
  })
})

describe('compositionFormula', () => {
  it('7С3Е', () => {
    expect(compositionFormula([{ species: 'pine', sharePct: 70 }, { species: 'spruce', sharePct: 30 }])).toBe('7С3Е')
  })
  it('сумма округлений приводится к 10', () => {
    expect(
      compositionFormula([
        { species: 'spruce', sharePct: 60 },
        { species: 'fir', sharePct: 30 },
        { species: 'cedar', sharePct: 10 },
      ]),
    ).toBe('6Е3П1К')
    expect(compositionFormula([{ species: 'pine', sharePct: 100 }])).toBe('10С')
    expect(compositionFormula([])).toBe('—')
  })
})
