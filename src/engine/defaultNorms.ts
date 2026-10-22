// Демонстрационные нормативы (setup-app-foundation design D8). Все значения — verified: false,
// перед защитой сверить с приложениями к Правилам лесовосстановления и поправить здесь, не трогая код.
import { DISTRICTS } from '@/domain/districts'
import type {
  DistrictNorm,
  NormativeRef,
  NormsConfig,
  SiteConditionCode,
  SpeciesCode,
  SpeciesGroup,
} from '@/domain/types'

const RULES_REF: NormativeRef = {
  doc: 'Правила лесовосстановления (Приказ Минприроды России от 29.12.2021 № 1024)',
  verified: false,
}

const DISTRICT_NORMS_REF: NormativeRef = {
  doc: 'Правила лесовосстановления (Приказ Минприроды России от 29.12.2021 № 1024), приложение: нормативы по лесным районам',
  verified: false,
}

// conifer / hardwood / softwood, шт/га
const REQUIRED: Record<string, [number, number, number]> = {
  north_taiga_eu: [1500, 1500, 2000],
  middle_taiga_eu: [2000, 2000, 2500],
  south_taiga_eu: [2500, 2000, 3000],
  mixed_eu: [3000, 2000, 3000],
  forest_steppe_eu: [3000, 2500, 3000],
  west_ural_taiga: [2000, 2000, 2500],
  east_ural_taiga: [2000, 2000, 2500],
  wsib_middle_taiga: [1500, 1500, 2000],
  wsib_south_taiga: [2000, 2000, 2500],
  wsib_subtaiga_steppe: [2500, 2000, 3000],
  csib_plateau_taiga: [1500, 1500, 2000],
  csib_subtaiga_steppe: [2000, 2000, 2500],
  altai_sayan_mountain_taiga: [1500, 1500, 2000],
  baikal_mountain: [1500, 1500, 2000],
  transbaikal_permafrost_taiga: [1200, 1200, 1500],
  esib_permafrost_taiga: [1200, 1200, 1500],
  far_east_taiga: [1500, 1500, 2000],
  amur_primorye_mixed: [2000, 1500, 2500],
}

const districts: Record<string, DistrictNorm> = Object.fromEntries(
  Object.entries(REQUIRED).map(([districtId, [conifer, hardwood, softwood]]) => {
    const requiredPerHa: Record<SpeciesGroup, number> = { conifer, hardwood, softwood }
    return [districtId, { districtId, requiredPerHa, source: DISTRICT_NORMS_REF }]
  }),
)

const targetSpeciesByCondition: Record<SiteConditionCode, SpeciesCode[]> = {
  A1: ['pine'],
  A2: ['pine'],
  A3: ['pine'],
  A4: ['pine'],
  B1: ['pine'],
  B2: ['pine', 'spruce'],
  B3: ['spruce', 'pine'],
  B4: ['spruce', 'pine'],
  C1: ['pine', 'oak'],
  C2: ['spruce', 'pine', 'oak'],
  C3: ['spruce', 'fir'],
  C4: ['spruce'],
  D2: ['oak', 'ash', 'spruce'],
  D3: ['spruce', 'oak', 'ash'],
  D4: ['spruce'],
}

type Overrides = Partial<Record<SiteConditionCode, SpeciesCode[]>>

// Правила применяются сверху вниз, более позднее перекрывает раннее для того же ТЛУ.
const OVERRIDE_RULES: { applies: (districtId: string) => boolean; overrides: Overrides | 'all' }[] = [
  {
    applies: (id) => !id.endsWith('_eu') && id !== 'amur_primorye_mixed',
    overrides: { C1: ['pine'], C2: ['spruce', 'pine'], D2: ['spruce', 'pine'], D3: ['spruce', 'fir'] },
  },
  {
    applies: (id) =>
      id.startsWith('wsib_') || id.startsWith('csib_') || id === 'altai_sayan_mountain_taiga' || id === 'baikal_mountain',
    overrides: { B2: ['pine', 'cedar'], B3: ['cedar', 'spruce'], C2: ['cedar', 'spruce', 'fir'], C3: ['fir', 'cedar', 'spruce'] },
  },
  {
    applies: (id) => id === 'transbaikal_permafrost_taiga' || id === 'esib_permafrost_taiga',
    overrides: 'all', // все ТЛУ → лиственница, сосна
  },
  {
    applies: (id) => id === 'far_east_taiga',
    overrides: { B2: ['larch', 'spruce'], B3: ['spruce', 'larch'], C2: ['spruce', 'fir'], C3: ['spruce', 'fir'] },
  },
  {
    applies: (id) => id === 'amur_primorye_mixed',
    overrides: { B2: ['cedar', 'larch'], C2: ['cedar', 'spruce', 'oak'], C3: ['spruce', 'fir', 'cedar'], D2: ['oak', 'ash', 'cedar'] },
  },
]

function buildOverrides(): Record<string, Overrides> {
  const result: Record<string, Overrides> = {}
  for (const { id } of DISTRICTS) {
    let merged: Overrides = {}
    for (const rule of OVERRIDE_RULES) {
      if (!rule.applies(id)) continue
      if (rule.overrides === 'all') {
        const all = Object.keys(targetSpeciesByCondition) as SiteConditionCode[]
        merged = Object.fromEntries(all.map((c) => [c, ['larch', 'pine'] as SpeciesCode[]]))
      } else {
        merged = { ...merged, ...rule.overrides }
      }
    }
    if (Object.keys(merged).length > 0) result[id] = merged
  }
  return result
}

export const DEFAULT_NORMS: NormsConfig = {
  version: 'demo-2026.1',
  heightCoefficients: { small: 0.5, medium: 0.8, large: 1.0 },
  minOccurrence: 0.65,
  combinedLowerRatio: 0.5,
  maxUndesiredShare: 0.6,
  districts,
  targetSpeciesByCondition,
  targetOverridesByDistrict: buildOverrides(),
  plantingDensity: {
    pine: { bare_root: 3500, containerized: 2500 },
    spruce: { bare_root: 3000, containerized: 2000 },
    fir: { bare_root: 3000, containerized: 2000 },
    larch: { bare_root: 3000, containerized: 2000 },
    cedar: { bare_root: 1500, containerized: 1000 },
    oak: { bare_root: 5000, containerized: 3000 },
    ash: { bare_root: 4000, containerized: 3000 },
  },
  unitCostsRub: {
    soilPrepPerHa: 7000,
    plantingPerHaBareRoot: 15000,
    plantingPerHaContainerized: 12000,
    seedlingBareRoot: 6,
    seedlingContainerized: 22,
    carePerHaPerYear: 6000,
    mineralizationPerHa: 5000,
  },
  sources: {
    heightCoefficients: RULES_REF,
    minOccurrence: RULES_REF,
    combinedLowerRatio: { doc: 'Порог модели (экспертная оценка команды)', verified: false },
    maxUndesiredShare: { doc: 'Порог модели (экспертная оценка команды)', verified: false },
    plantingDensity: RULES_REF,
    unitCostsRub: { doc: 'Оценка команды, не норматив', verified: false },
  },
}
