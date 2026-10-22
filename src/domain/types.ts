// КОНТРАКТ. Менять только через openspec change (см. setup-app-foundation/design.md D3).
import type * as GeoJSON from 'geojson'

export type LonLat = [lon: number, lat: number]

export type SpeciesCode =
  | 'pine' | 'spruce' | 'fir' | 'larch' | 'cedar'
  | 'oak' | 'ash'
  | 'linden' | 'birch' | 'aspen' | 'alder'

export type SpeciesGroup = 'conifer' | 'hardwood' | 'softwood'

export type HeightClass = 'small' | 'medium' | 'large' // ≤0,5 м | 0,6–1,5 м | >1,5 м

export type SiteConditionCode =
  | 'A1' | 'A2' | 'A3' | 'A4'
  | 'B1' | 'B2' | 'B3' | 'B4'
  | 'C1' | 'C2' | 'C3' | 'C4'
  | 'D2' | 'D3' | 'D4'

export type FellingType = 'clear' | 'selective' | 'sanitary_clear' | 'sanitary_selective'

export type ForestZoneId =
  | 'pretundra' | 'taiga' | 'mixed' | 'forest_steppe' | 'south_siberian_mountain'

export interface ForestDistrict {
  id: string
  nameRu: string
  zone: ForestZoneId
}

export interface UndergrowthRecord {
  species: SpeciesCode
  heightClass: HeightClass
  countPerHa: number   // всего, шт/га, >= 0
  viableShare: number  // доля жизнеспособного, 0..1
}

export interface SurveyPlot {
  id: string
  offsetM: [dx: number, dy: number] // смещение от центроида, м (x — восток, y — север)
  viableTargetCount: number          // жизнеспособных экземпляров целевых пород на площадке
  dominantSpecies: SpeciesCode | null
}

export interface CuttingSite {
  id: string                        // 'NIZ-000123' | 'IMP-0001'
  regionId: string                  // ISO 3166-2, напр. 'RU-NIZ'
  forestry: string                  // лесничество
  subForestry: string               // участковое лесничество
  quarter: number                   // квартал
  plot: number                      // выдел
  areaHa: number
  centroid: LonLat
  polygon: LonLat[]                 // замкнутое кольцо: первая точка = последняя
  districtId: string                // ForestDistrict.id
  siteCondition: SiteConditionCode  // ТЛУ
  forestType: string                // 'Сосняк черничный'
  preFellingComposition: string     // '6С3Е1Б'
  fellingType: FellingType
  fellingYear: number
  inspectionDate: string | null     // ISO-дата заключительного осмотра
  undergrowthSurveyed: boolean      // false — учёт подроста не проводился
  undergrowth: UndergrowthRecord[]
  occurrence: number | null         // встречаемость 0..1; null — не измерялась
  surveyPlots: SurveyPlot[]         // в синтетике пусто: генерируются лениво, см. data/getSurveyPlots
  dataSource: 'synthetic' | 'imported'
}

export type DecisionKind = 'natural' | 'combined' | 'artificial' | 'insufficient_data'

export type MeasureCode =
  | 'preserve_undergrowth' | 'soil_mineralization' | 'fencing'
  | 'gap_planting' | 'planting' | 'sowing' | 'agrotech_care' | 'thinning_softwood'

export type PlantingStock = 'bare_root' | 'containerized' | 'sapling' | 'seeds'
export type SoilPreparation = 'none' | 'strips' | 'furrows' | 'mounds' | 'patches'
export type Season = 'spring' | 'autumn' | 'spring_or_autumn'

export interface NormativeRef {
  doc: string        // 'Правила лесовосстановления (Приказ Минприроды России № 1024)'
  clause?: string
  verified: boolean  // false — демо-значение, сверить с НПА
}

export interface ExplanationStep {
  ruleId: string     // 'R3_SUFFICIENCY'
  title: string
  outcome: 'pass' | 'fail' | 'warn' | 'info'
  detail: string     // с числами: 'Приведённое 1 840 шт/га < норматива 2 500 шт/га'
  ref?: NormativeRef
}

export interface Recommendation {
  measures: MeasureCode[]
  composition: { species: SpeciesCode; sharePct: number }[] // сумма 100 или пусто
  densityPerHa: number | null
  plantingStock: PlantingStock | null
  soilPreparation: SoilPreparation
  season: Season | null
  careYears: number
  areaToPlantHa: number
  seedlingsTotal: number
  estimatedCostRub: number
  expectedTransferYears: number | null
  notes: string[]
}

export interface DecisionMetrics {
  targetSpecies: SpeciesCode[]
  normalizedViableCount: number  // шт/га, крупный эквивалент, только целевые породы
  requiredCount: number          // норматив, шт/га
  sufficiencyRatio: number       // normalized / required
  occurrence: number | null
  undesiredShare: number         // доля нецелевых мягколиственных в жизнеспособном подросте, 0..1
}

export interface SuccessFactor {
  label: string         // 'Встречаемость 72 %'
  contribution: number  // вклад в логит, знак = направление
}

export interface DecisionResult {
  siteId: string
  kind: DecisionKind
  needsActiveMeasures: boolean
  confidence: number          // 0..1
  successProbability: number  // 0..1
  successFactors: SuccessFactor[]
  metrics: DecisionMetrics
  explanation: ExplanationStep[]
  recommendation: Recommendation
  normsVersion: string
}

export interface DistrictNorm {
  districtId: string
  requiredPerHa: Record<SpeciesGroup, number>
  source: NormativeRef
}

export interface NormsConfig {
  version: string
  heightCoefficients: Record<HeightClass, number>
  minOccurrence: number
  combinedLowerRatio: number
  maxUndesiredShare: number
  districts: Record<string, DistrictNorm>
  targetSpeciesByCondition: Record<SiteConditionCode, SpeciesCode[]>
  targetOverridesByDistrict: Record<string, Partial<Record<SiteConditionCode, SpeciesCode[]>>>
  plantingDensity: Partial<Record<SpeciesCode, { bare_root: number; containerized: number }>>
  unitCostsRub: {
    soilPrepPerHa: number
    plantingPerHaBareRoot: number
    plantingPerHaContainerized: number
    seedlingBareRoot: number
    seedlingContainerized: number
    carePerHaPerYear: number
    mineralizationPerHa: number
  }
  sources: Record<string, NormativeRef> // ключ — имя параметра: 'minOccurrence', 'heightCoefficients'…
}

export interface EvaluateOptions {
  referenceDate?: string // ISO; по умолчанию — сегодня. В тестах передавать явно.
}

export interface DecisionDiff {
  changed: number
  transitions: Partial<Record<`${DecisionKind}->${DecisionKind}`, number>>
}

export interface RegionMeta {
  id: string        // 'RU-NIZ'
  nameRu: string    // 'Нижегородская область'
  shortRu: string   // 'Нижегородская'
  centroid: LonLat
  districtIds: string[]
  isPilot: boolean
}

export type RegionShapes = GeoJSON.FeatureCollection<
  GeoJSON.Polygon | GeoJSON.MultiPolygon,
  { id: string; nameRu: string }
>

export interface Dataset {
  version: string
  seed: number
  generatedAt: string
  regions: RegionMeta[]
  regionShapes: RegionShapes
  districts: ForestDistrict[]
  sites: CuttingSite[]
}

export type MapMode = 'decision' | 'sufficiency' | 'species' | 'inspection_age' | 'confidence'

export interface CameraRequest {
  id: number         // монотонно растёт; карта реагирует на смену id
  center: LonLat
  zoom: number
  pitch?: number
  bearing?: number
  durationMs?: number
}

export type FeedEventType = 'inspection' | 'alert' | 'norms_changed' | 'import' | 'system'

export interface FeedEvent {
  id: string
  ts: number
  type: FeedEventType
  title: string
  subtitle?: string
  siteId?: string
  regionId?: string
  decision?: DecisionKind
  location?: LonLat  // если задано — карта рисует пинг
}
