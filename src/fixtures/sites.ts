// Фикстура: 300 лесосек в 6 субъектах (seed 42). Распределение решений под заглушку движка ≈ 45/25/25/5 %.
// Живёт до мержа потока dataset — тот заменит её полным набором по России.
import { SITE_CONDITIONS, SPECIES } from '@/domain/constants'
import { pointInGeometry, rectanglePolygon } from '@/domain/geo'
import { mulberry32, pick, pickWeighted, randInt, randNormal, randRange, type Rng } from '@/domain/random'
import type {
  CuttingSite,
  FellingType,
  HeightClass,
  LonLat,
  RegionMeta,
  SiteConditionCode,
  SpeciesCode,
  UndergrowthRecord,
} from '@/domain/types'
import { DEFAULT_NORMS } from '@/engine/defaultNorms'
import { FIXTURE_REGION_SHAPES } from './regionShapes'

interface FixtureRegion {
  meta: RegionMeta
  districtAt: (p: LonLat) => string
  forestries: string[]
}

const region = (
  id: string,
  nameRu: string,
  shortRu: string,
  centroid: LonLat,
  districtIds: string[],
  districtAt: (p: LonLat) => string,
  forestries: string[],
  isPilot = false,
): FixtureRegion => ({ meta: { id, nameRu, shortRu, centroid, districtIds, isPilot }, districtAt, forestries })

export const FIXTURE_REGIONS: FixtureRegion[] = [
  region('RU-NIZ', 'Нижегородская область', 'Нижегородская', [44.6, 56.9], ['south_taiga_eu', 'mixed_eu'],
    ([, lat]) => (lat >= 56.6 ? 'south_taiga_eu' : 'mixed_eu'),
    ['Борское', 'Семёновское', 'Краснобаковское', 'Варнавинское', 'Ветлужское', 'Уренское'], true),
  region('RU-ARK', 'Архангельская область', 'Архангельская', [42.5, 62.0], ['north_taiga_eu', 'middle_taiga_eu'],
    ([, lat]) => (lat >= 63.5 ? 'north_taiga_eu' : 'middle_taiga_eu'),
    ['Вельское', 'Коношское', 'Няндомское', 'Каргопольское', 'Плесецкое', 'Устьянское']),
  region('RU-KIR', 'Кировская область', 'Кировская', [49.8, 58.5], ['middle_taiga_eu', 'south_taiga_eu'],
    ([, lat]) => (lat >= 59 ? 'middle_taiga_eu' : 'south_taiga_eu'),
    ['Мурашинское', 'Омутнинское', 'Белохолуницкое', 'Котельничское', 'Подосиновское', 'Лузское']),
  region('RU-IRK', 'Иркутская область', 'Иркутская', [102.5, 56.5], ['csib_plateau_taiga', 'baikal_mountain'],
    ([lon, lat]) => (lon >= 103 && lat < 54 ? 'baikal_mountain' : 'csib_plateau_taiga'),
    ['Братское', 'Усть-Илимское', 'Усть-Кутское', 'Нижнеилимское', 'Тайшетское', 'Чунское']),
  region('RU-KYA', 'Красноярский край', 'Красноярский', [95.5, 58.0], ['altai_sayan_mountain_taiga', 'csib_subtaiga_steppe', 'csib_plateau_taiga'],
    ([, lat]) => (lat < 54.3 ? 'altai_sayan_mountain_taiga' : lat < 56.5 ? 'csib_subtaiga_steppe' : 'csib_plateau_taiga'),
    ['Богучанское', 'Кежемское', 'Мотыгинское', 'Енисейское', 'Казачинское', 'Тасеевское']),
  region('RU-KHA', 'Хабаровский край', 'Хабаровский', [136.0, 49.5], ['far_east_taiga', 'amur_primorye_mixed'],
    ([, lat]) => (lat >= 49.5 ? 'far_east_taiga' : 'amur_primorye_mixed'),
    ['Ванинское', 'Советско-Гаванское', 'Комсомольское', 'Хорское', 'Бикинское', 'Солнечное']),
]

const SUB_FORESTRY_POOL = ['Заречное', 'Боровое', 'Лесное', 'Сосновское', 'Ельниковское', 'Берёзовское', 'Красноборское', 'Кедровое', 'Таёжное', 'Озёрное']

const TLU_WEIGHTS: [SiteConditionCode, number][] = [
  ['A2', 12], ['B2', 30], ['B3', 15], ['B4', 3], ['C2', 25], ['C3', 12], ['C4', 3],
]

const FELLING_WEIGHTS: [FellingType, number][] = [
  ['clear', 78], ['sanitary_clear', 10], ['selective', 8], ['sanitary_selective', 4],
]

const FOREST_TYPE: Partial<Record<SiteConditionCode, string>> = {
  A2: 'Сосняк брусничный',
  B2: 'Сосняк черничный',
  B3: 'Ельник долгомошный',
  B4: 'Ельник сфагновый',
  C2: 'Ельник кисличный',
  C3: 'Ельник травяной',
  C4: 'Ельник приручейный',
}

const HEIGHTS: HeightClass[] = ['small', 'medium', 'large']
const STUB_REQUIRED = 2000

function samplePoint(rng: Rng, fr: FixtureRegion): LonLat {
  const shape = FIXTURE_REGION_SHAPES.features.find((f) => f.properties.id === fr.meta.id)!
  const [cx, cy] = fr.meta.centroid
  for (let i = 0; i < 200; i++) {
    const p: LonLat = [cx + randRange(rng, -1.5, 1.5) / Math.cos((cy * Math.PI) / 180) * 0.6, cy + randRange(rng, -1.5, 1.5)]
    if (pointInGeometry(p, shape.geometry)) return [Number(p[0].toFixed(5)), Number(p[1].toFixed(5))]
  }
  return fr.meta.centroid
}

function composition(targets: SpeciesCode[]): string {
  const [a, b] = targets
  const main = SPECIES[a ?? 'pine'].short
  return b ? `6${main}3${SPECIES[b].short}1Б` : `8${main}2Б`
}

function undergrowthFor(rng: Rng, targets: SpeciesCode[], ratio: number): UndergrowthRecord[] {
  const total = ratio * STUB_REQUIRED
  const species = targets.slice(0, randInt(rng, 1, Math.min(2, targets.length)))
  const shares = species.length === 2 ? [0.65, 0.35] : [1]
  return species.map((s, i) => {
    const heightClass = pick(rng, HEIGHTS)
    const viableShare = Number(randRange(rng, 0.65, 0.95).toFixed(2))
    const coef = DEFAULT_NORMS.heightCoefficients[heightClass]
    const countPerHa = Math.max(50, Math.round((total * shares[i]!) / (viableShare * coef) / 50) * 50)
    return { species: s, heightClass, countPerHa, viableShare }
  })
}

function buildSite(rng: Rng, fr: FixtureRegion, index: number): CuttingSite {
  const centroid = samplePoint(rng, fr)
  const districtId = fr.districtAt(centroid)
  const siteCondition = pickWeighted(rng, TLU_WEIGHTS)
  const targets =
    DEFAULT_NORMS.targetOverridesByDistrict[districtId]?.[siteCondition] ?? DEFAULT_NORMS.targetSpeciesByCondition[siteCondition]
  const areaHa = Number(Math.min(50, Math.max(0.5, Math.exp(Math.log(8) + 0.6 * randNormal(rng)))).toFixed(1))
  const fellingYear = randInt(rng, 2021, 2025)
  const month = String(randInt(rng, 5, 10)).padStart(2, '0')
  const day = String(randInt(rng, 1, 28)).padStart(2, '0')

  // Корзина решения под заглушку движка: 5 % нет данных, 45 % естественное, 25 % комбинированное, 25 % искусственное
  const u = rng()
  const surveyed = u >= 0.05
  const ratio = u < 0.5 ? randRange(rng, 1.1, 2.0) : u < 0.75 ? randRange(rng, 0.55, 0.95) : randRange(rng, 0.05, 0.45)
  const occurrence = !surveyed || rng() < 0.07
    ? null
    : Number((u < 0.5 ? randRange(rng, 0.65, 0.95) : u < 0.75 ? randRange(rng, 0.4, 0.8) : randRange(rng, 0.1, 0.5)).toFixed(2))

  return {
    id: `${fr.meta.id.slice(3)}-${String(index).padStart(6, '0')}`,
    regionId: fr.meta.id,
    forestry: pick(rng, fr.forestries),
    subForestry: `${pick(rng, SUB_FORESTRY_POOL)} участковое`,
    quarter: randInt(rng, 1, 250),
    plot: randInt(rng, 1, 60),
    areaHa,
    centroid,
    polygon: rectanglePolygon(centroid, areaHa, randRange(rng, 1, 3), randRange(rng, 0, Math.PI)),
    districtId,
    siteCondition,
    forestType: FOREST_TYPE[siteCondition] ?? `Насаждение (${SITE_CONDITIONS[siteCondition].labelRu})`,
    preFellingComposition: composition(targets),
    fellingType: pickWeighted(rng, FELLING_WEIGHTS),
    fellingYear,
    inspectionDate: rng() < 0.05 ? null : `${fellingYear}-${month}-${day}`,
    undergrowthSurveyed: surveyed,
    undergrowth: surveyed ? undergrowthFor(rng, targets, ratio) : [],
    occurrence,
    surveyPlots: [],
    dataSource: 'synthetic',
  }
}

export function buildFixtureSites(seed = 42): CuttingSite[] {
  const rng = mulberry32(seed)
  const sites: CuttingSite[] = []
  for (const fr of FIXTURE_REGIONS) {
    for (let i = 1; i <= 50; i++) sites.push(buildSite(rng, fr, i))
  }
  return sites
}
