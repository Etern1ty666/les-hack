// Справочники и общие шкалы цветов. Цвета — из docs/visual-direction.md.
import type {
  DecisionKind,
  FellingType,
  HeightClass,
  MapMode,
  MeasureCode,
  PlantingStock,
  Season,
  SiteConditionCode,
  SoilPreparation,
  SpeciesCode,
  SpeciesGroup,
} from './types'

export type Rgb = [r: number, g: number, b: number]

export function hexToRgb(hex: string): Rgb {
  const n = Number.parseInt(hex.replace('#', ''), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

interface SpeciesInfo {
  nameRu: string
  short: string // обозначение в формуле состава
  group: SpeciesGroup
  color: string
  rgb: Rgb
}

const species = (nameRu: string, short: string, group: SpeciesGroup, color: string): SpeciesInfo => ({
  nameRu,
  short,
  group,
  color,
  rgb: hexToRgb(color),
})

export const SPECIES: Record<SpeciesCode, SpeciesInfo> = {
  pine: species('Сосна', 'С', 'conifer', '#4E9A5B'),
  spruce: species('Ель', 'Е', 'conifer', '#2F6B57'),
  fir: species('Пихта', 'П', 'conifer', '#3C7F6E'),
  larch: species('Лиственница', 'Л', 'conifer', '#9BBF4A'),
  cedar: species('Кедр', 'К', 'conifer', '#2B5B3F'),
  oak: species('Дуб', 'Д', 'hardwood', '#8A9A3B'),
  ash: species('Ясень', 'Я', 'hardwood', '#7FA36A'),
  linden: species('Липа', 'Лп', 'softwood', '#A7C77A'),
  birch: species('Берёза', 'Б', 'softwood', '#D9E7A0'),
  aspen: species('Осина', 'Ос', 'softwood', '#C2D47E'),
  alder: species('Ольха', 'Ол', 'softwood', '#93AE7C'),
}

export const SPECIES_CODES = Object.keys(SPECIES) as SpeciesCode[]

export const SPECIES_GROUPS: Record<SpeciesGroup, { labelRu: string }> = {
  conifer: { labelRu: 'Хвойные' },
  hardwood: { labelRu: 'Твердолиственные' },
  softwood: { labelRu: 'Мягколиственные' },
}

interface DecisionInfo {
  labelRu: string
  shortRu: string
  descriptionRu: string
  cssVar: string
  color: string
  rgb: Rgb
}

const decision = (labelRu: string, shortRu: string, descriptionRu: string, cssVar: string, color: string): DecisionInfo => ({
  labelRu,
  shortRu,
  descriptionRu,
  cssVar,
  color,
  rgb: hexToRgb(color),
})

export const DECISIONS: Record<DecisionKind, DecisionInfo> = {
  natural: decision(
    'Естественное',
    'Естеств.',
    'Жизнеспособного подроста целевых пород достаточно, и он распределён равномерно',
    '--natural',
    '#34D399',
  ),
  combined: decision(
    'Комбинированное',
    'Комбинир.',
    'Подроста не хватает до норматива: сохраняем его и досаживаем в «окна»',
    '--combined',
    '#FBBF24',
  ),
  artificial: decision(
    'Искусственное',
    'Искусств.',
    'Подроста мало или он неподходящий: посадка на всей площади',
    '--artificial',
    '#FB4D61',
  ),
  insufficient_data: decision(
    'Недостаточно данных',
    'Нет данных',
    'Подрост не обследован: нужен натурный осмотр',
    '--nodata',
    '#8B9CFF',
  ),
}

export const DECISION_KINDS = Object.keys(DECISIONS) as DecisionKind[]

export const HEIGHT_CLASSES: Record<HeightClass, { labelRu: string; rangeRu: string }> = {
  small: { labelRu: 'мелкий', rangeRu: 'до 0,5 м' },
  medium: { labelRu: 'средний', rangeRu: '0,6–1,5 м' },
  large: { labelRu: 'крупный', rangeRu: 'более 1,5 м' },
}

export const FELLING_TYPES: Record<FellingType, { labelRu: string }> = {
  clear: { labelRu: 'Сплошная' },
  selective: { labelRu: 'Выборочная' },
  sanitary_clear: { labelRu: 'Сплошная санитарная' },
  sanitary_selective: { labelRu: 'Выборочная санитарная' },
}

type Trophotope = 'A' | 'B' | 'C' | 'D'
type Moisture = 1 | 2 | 3 | 4

const TROPHOTOPE_RU: Record<Trophotope, string> = { A: 'бор', B: 'суборь', C: 'сугрудок', D: 'груд' }
const MOISTURE_RU: Record<Moisture, string> = { 1: 'Сухой', 2: 'Свежий', 3: 'Влажный', 4: 'Сырой' }

function siteCondition(code: SiteConditionCode) {
  const trophotope = code[0] as Trophotope
  const moisture = Number(code[1]) as Moisture
  // «Свежая суборь», «Влажный сугрудок»: род прилагательного по существительному
  const noun = TROPHOTOPE_RU[trophotope]
  const adj = MOISTURE_RU[moisture]
  const label = trophotope === 'B' ? `${adj.slice(0, -2)}ая ${noun}` : `${adj} ${noun}`
  return { trophotope, moisture, labelRu: label }
}

const SITE_CONDITION_CODES: SiteConditionCode[] = [
  'A1', 'A2', 'A3', 'A4', 'B1', 'B2', 'B3', 'B4', 'C1', 'C2', 'C3', 'C4', 'D2', 'D3', 'D4',
]

export const SITE_CONDITIONS = Object.fromEntries(
  SITE_CONDITION_CODES.map((c) => [c, siteCondition(c)]),
) as Record<SiteConditionCode, { trophotope: Trophotope; moisture: Moisture; labelRu: string }>

export const MEASURES: Record<MeasureCode, { labelRu: string }> = {
  preserve_undergrowth: { labelRu: 'Сохранение подроста' },
  soil_mineralization: { labelRu: 'Минерализация почвы' },
  fencing: { labelRu: 'Огораживание' },
  gap_planting: { labelRu: 'Посадка в «окна»' },
  planting: { labelRu: 'Посадка лесных культур' },
  sowing: { labelRu: 'Посев семян' },
  agrotech_care: { labelRu: 'Агротехнические уходы' },
  thinning_softwood: { labelRu: 'Осветление (удаление мягколиственных)' },
}

export const PLANTING_STOCK: Record<PlantingStock, { labelRu: string; shortRu: string }> = {
  bare_root: { labelRu: 'Сеянцы с открытой корневой системой', shortRu: 'ОКС' },
  containerized: { labelRu: 'Сеянцы с закрытой корневой системой', shortRu: 'ЗКС' },
  sapling: { labelRu: 'Саженцы', shortRu: 'Саженцы' },
  seeds: { labelRu: 'Посев семян', shortRu: 'Посев' },
}

export const SOIL_PREP: Record<SoilPreparation, { labelRu: string }> = {
  none: { labelRu: 'Без обработки' },
  strips: { labelRu: 'Полосы' },
  furrows: { labelRu: 'Борозды' },
  mounds: { labelRu: 'Микроповышения' },
  patches: { labelRu: 'Площадки' },
}

export const SEASONS: Record<Season, { labelRu: string }> = {
  spring: { labelRu: 'Весна' },
  autumn: { labelRu: 'Осень' },
  spring_or_autumn: { labelRu: 'Весна или осень' },
}

// --- Режимы карты и общие шкалы (карта и легенда HUD используют одно и то же) ---

export interface LegendStop {
  value: number | string
  color: string
  label: string
}

export interface ModeLegend {
  type: 'categorical' | 'continuous'
  stops: LegendStop[]
  nullStop?: LegendStop // для значения null (например, осмотр не проводился)
}

export interface MapModeInfo {
  id: MapMode
  labelRu: string
  hotkey: '1' | '2' | '3' | '4' | '5'
  legend: ModeLegend
}

export const MAP_MODES: MapModeInfo[] = [
  {
    id: 'decision',
    labelRu: 'Решение',
    hotkey: '1',
    legend: {
      type: 'categorical',
      stops: DECISION_KINDS.map((k) => ({ value: k, color: DECISIONS[k].color, label: DECISIONS[k].labelRu })),
    },
  },
  {
    id: 'sufficiency',
    labelRu: 'Достаточность подроста',
    hotkey: '2',
    legend: {
      type: 'continuous',
      stops: [
        { value: 0, color: '#FB4D61', label: 'нет подроста' },
        { value: 0.5, color: '#FBBF24', label: '50 % нормы' },
        { value: 1, color: '#34D399', label: 'норма' },
        { value: 2, color: '#36F1C2', label: '200 %' },
      ],
    },
  },
  {
    id: 'species',
    labelRu: 'Главная порода',
    hotkey: '3',
    legend: {
      type: 'categorical',
      stops: SPECIES_CODES.map((s) => ({ value: s, color: SPECIES[s].color, label: SPECIES[s].nameRu })),
    },
  },
  {
    id: 'inspection_age',
    labelRu: 'Давность осмотра',
    hotkey: '4',
    legend: {
      type: 'continuous',
      stops: [
        { value: 0, color: '#36F1C2', label: 'свежий' },
        { value: 12, color: '#3AA6FF', label: 'год' },
        { value: 36, color: '#8B9CFF', label: '3+ года' },
      ],
      nullStop: { value: 'null', color: '#5F7570', label: 'не осматривалась' },
    },
  },
  {
    id: 'confidence',
    labelRu: 'Достоверность',
    hotkey: '5',
    legend: {
      type: 'continuous',
      stops: [
        { value: 0.15, color: '#3B3F6B', label: 'низкая' },
        { value: 0.6, color: '#6C8CFF', label: 'средняя' },
        { value: 0.99, color: '#36F1C2', label: 'высокая' },
      ],
    },
  },
]

export const MAP_MODE_BY_ID = Object.fromEntries(MAP_MODES.map((m) => [m.id, m])) as Record<MapMode, MapModeInfo>

const FALLBACK_RGB = hexToRgb('#5F7570')

/** Цвет значения в шкале режима: категориальные — по совпадению, непрерывные — линейная интерполяция. */
export function colorForModeValue(mode: MapMode, value: number | string | null): Rgb {
  const legend = MAP_MODE_BY_ID[mode].legend
  if (value === null) return legend.nullStop ? hexToRgb(legend.nullStop.color) : FALLBACK_RGB
  if (legend.type === 'categorical') {
    const stop = legend.stops.find((s) => s.value === value)
    return stop ? hexToRgb(stop.color) : FALLBACK_RGB
  }
  const v = Number(value)
  const stops = legend.stops
  const first = stops[0]!
  const last = stops[stops.length - 1]!
  if (v <= Number(first.value)) return hexToRgb(first.color)
  if (v >= Number(last.value)) return hexToRgb(last.color)
  for (let i = 1; i < stops.length; i++) {
    const a = stops[i - 1]!
    const b = stops[i]!
    const av = Number(a.value)
    const bv = Number(b.value)
    if (v <= bv) {
      const t = (v - av) / (bv - av)
      const ca = hexToRgb(a.color)
      const cb = hexToRgb(b.color)
      return [
        Math.round(ca[0] + (cb[0] - ca[0]) * t),
        Math.round(ca[1] + (cb[1] - ca[1]) * t),
        Math.round(ca[2] + (cb[2] - ca[2]) * t),
      ]
    }
  }
  return hexToRgb(last.color)
}
