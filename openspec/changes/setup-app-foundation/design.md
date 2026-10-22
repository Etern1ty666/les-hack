# Design

## Context

Репозиторий пустой: в нём только OpenSpec и docs. Зачем нужна волна 0, см. proposal.md → Why. Здесь — **дословные контракты**. Исполнитель переносит их в код без изменений: на эти типы и сигнатуры одновременно опираются 4 потока.

## Goals / Non-Goals

**Goals:**
- Проект собирается, запускается и деплоится.
- Контракты лежат в коде, все потоки компилируются против них.
- Заглушки дают правдоподобный экран: фикстура примерно на 300 лесосек, упрощённая оценка.
- Визуальная база (токены, шрифты, примитивы) соответствует `docs/visual-direction.md`.

**Non-Goals:**
- Настоящая карта, HUD, движок и генератор данных — это отдельные changes.
- Бэкенд, авторизация, i18n.

## Decisions

### D1. Структура каталогов

```
.
├── index.html
├── package.json
├── vite.config.ts            # base: process.env.BASE_PATH ?? '/'
├── tsconfig.json             # strict, noUncheckedIndexedAccess, paths "@/*" → "src/*"
├── .github/workflows/deploy.yml
├── public/data/              # (поток dataset) regions.geojson, sites.json
├── scripts/                  # (поток dataset) сборка данных
└── src/
    ├── main.tsx
    ├── App.tsx               # компоновка слоёв: <MapScene/> <Hud/> <Workspace/> <ShellOverlays/>
    ├── domain/               # КОНТРАКТ: types.ts, constants.ts, districts.ts, format.ts
    ├── state/                # КОНТРАКТ: store.ts, selectors.ts, bootstrap.ts
    ├── engine/               # index.ts (заглушка → поток engine), defaultNorms.ts
    ├── data/                 # index.ts (фикстура → поток dataset)
    ├── fixtures/             # фикстурные регионы и лесосеки
    ├── map/index.tsx         # плейсхолдер → поток map
    ├── hud/index.tsx         # плейсхолдер → поток hud
    ├── workspace/index.tsx   # плейсхолдер → поток analytics
    ├── shell/                # LoadingScreen, IntroCard, ErrorScreen, DemoBadge, Vignette
    ├── ui/                   # примитивы
    └── styles/               # tokens.css, global.css
```

### D2. Зависимости (мажорные версии на октябрь 2026)

`react@19`, `react-dom@19`, `maplibre-gl@6`, `react-map-gl@8` (импорт из `react-map-gl/maplibre`), `@deck.gl/core|layers|geo-layers|mesh-layers|mapbox|extensions@9.4`, `@luma.gl/engine@9.4`, `h3-js@4`, `zustand@5`, `motion@14`, `lucide-react`, `papaparse@5`, `@fontsource/unbounded`, `@fontsource/exo-2`, `@fontsource/jetbrains-mono`.
Dev-зависимости: `vite@8`, `@vitejs/plugin-react`, `typescript` (из шаблона create-vite), `vitest@5`, `eslint` (конфиг из шаблона), `@types/geojson`, `@types/papaparse`, `mapshaper`.

Шрифты подключаются в `main.tsx` только с подмножествами `cyrillic` и `latin`, например `@fontsource/exo-2/cyrillic-400.css`.

### D3. `src/domain/types.ts` — КОНТРАКТ (перенести дословно)

```ts
export type LonLat = [lon: number, lat: number];

export type SpeciesCode =
  | 'pine' | 'spruce' | 'fir' | 'larch' | 'cedar'
  | 'oak' | 'ash'
  | 'linden' | 'birch' | 'aspen' | 'alder';

export type SpeciesGroup = 'conifer' | 'hardwood' | 'softwood';

export type HeightClass = 'small' | 'medium' | 'large'; // ≤0,5 м | 0,6–1,5 м | >1,5 м

export type SiteConditionCode =
  | 'A1' | 'A2' | 'A3' | 'A4'
  | 'B1' | 'B2' | 'B3' | 'B4'
  | 'C1' | 'C2' | 'C3' | 'C4'
  | 'D2' | 'D3' | 'D4';

export type FellingType = 'clear' | 'selective' | 'sanitary_clear' | 'sanitary_selective';

export type ForestZoneId =
  | 'pretundra' | 'taiga' | 'mixed' | 'forest_steppe' | 'south_siberian_mountain';

export interface ForestDistrict {
  id: string;
  nameRu: string;
  zone: ForestZoneId;
}

export interface UndergrowthRecord {
  species: SpeciesCode;
  heightClass: HeightClass;
  countPerHa: number;   // всего, шт/га, >= 0
  viableShare: number;  // доля жизнеспособного, 0..1
}

export interface SurveyPlot {
  id: string;
  offsetM: [dx: number, dy: number]; // смещение от центроида, м (x — восток, y — север)
  viableTargetCount: number;          // жизнеспособных экземпляров целевых пород на площадке
  dominantSpecies: SpeciesCode | null;
}

export interface CuttingSite {
  id: string;                        // 'NIZ-000123' | 'IMP-0001'
  regionId: string;                  // ISO 3166-2, напр. 'RU-NIZ'
  forestry: string;                  // лесничество
  subForestry: string;               // участковое лесничество
  quarter: number;                   // квартал
  plot: number;                      // выдел
  areaHa: number;
  centroid: LonLat;
  polygon: LonLat[];                 // замкнутое кольцо: первая точка = последняя
  districtId: string;                // ForestDistrict.id
  siteCondition: SiteConditionCode;  // ТЛУ
  forestType: string;                // 'Сосняк черничный'
  preFellingComposition: string;     // '6С3Е1Б'
  fellingType: FellingType;
  fellingYear: number;
  inspectionDate: string | null;     // ISO-дата заключительного осмотра
  undergrowthSurveyed: boolean;      // false — учёт подроста не проводился
  undergrowth: UndergrowthRecord[];
  occurrence: number | null;         // встречаемость 0..1; null — не измерялась
  surveyPlots: SurveyPlot[];         // в синтетике пусто: генерируются лениво, см. data/getSurveyPlots
  dataSource: 'synthetic' | 'imported';
}

export type DecisionKind = 'natural' | 'combined' | 'artificial' | 'insufficient_data';

export type MeasureCode =
  | 'preserve_undergrowth' | 'soil_mineralization' | 'fencing'
  | 'gap_planting' | 'planting' | 'sowing' | 'agrotech_care' | 'thinning_softwood';

export type PlantingStock = 'bare_root' | 'containerized' | 'sapling' | 'seeds';
export type SoilPreparation = 'none' | 'strips' | 'furrows' | 'mounds' | 'patches';
export type Season = 'spring' | 'autumn' | 'spring_or_autumn';

export interface NormativeRef {
  doc: string;        // 'Правила лесовосстановления (Приказ Минприроды России № 1024)'
  clause?: string;
  verified: boolean;  // false — демо-значение, сверить с НПА
}

export interface ExplanationStep {
  ruleId: string;     // 'R3_SUFFICIENCY'
  title: string;
  outcome: 'pass' | 'fail' | 'warn' | 'info';
  detail: string;     // с числами: 'Приведённое 1 840 шт/га < норматива 2 500 шт/га'
  ref?: NormativeRef;
}

export interface Recommendation {
  measures: MeasureCode[];
  composition: { species: SpeciesCode; sharePct: number }[]; // сумма 100 или пусто
  densityPerHa: number | null;
  plantingStock: PlantingStock | null;
  soilPreparation: SoilPreparation;
  season: Season | null;
  careYears: number;
  areaToPlantHa: number;
  seedlingsTotal: number;
  estimatedCostRub: number;
  expectedTransferYears: number | null;
  notes: string[];
}

export interface DecisionMetrics {
  targetSpecies: SpeciesCode[];
  normalizedViableCount: number;  // шт/га, крупный эквивалент, только целевые породы
  requiredCount: number;          // норматив, шт/га
  sufficiencyRatio: number;       // normalized / required
  occurrence: number | null;
  undesiredShare: number;         // доля нецелевых мягколиственных в жизнеспособном подросте, 0..1
}

export interface SuccessFactor {
  label: string;         // 'Встречаемость 72 %'
  contribution: number;  // вклад в логит, знак = направление
}

export interface DecisionResult {
  siteId: string;
  kind: DecisionKind;
  needsActiveMeasures: boolean;
  confidence: number;          // 0..1
  successProbability: number;  // 0..1
  successFactors: SuccessFactor[];
  metrics: DecisionMetrics;
  explanation: ExplanationStep[];
  recommendation: Recommendation;
  normsVersion: string;
}

export interface DistrictNorm {
  districtId: string;
  requiredPerHa: Record<SpeciesGroup, number>;
  source: NormativeRef;
}

export interface NormsConfig {
  version: string;
  heightCoefficients: Record<HeightClass, number>;
  minOccurrence: number;
  combinedLowerRatio: number;
  maxUndesiredShare: number;
  districts: Record<string, DistrictNorm>;
  targetSpeciesByCondition: Record<SiteConditionCode, SpeciesCode[]>;
  targetOverridesByDistrict: Record<string, Partial<Record<SiteConditionCode, SpeciesCode[]>>>;
  plantingDensity: Partial<Record<SpeciesCode, { bare_root: number; containerized: number }>>;
  unitCostsRub: {
    soilPrepPerHa: number;
    plantingPerHaBareRoot: number;
    plantingPerHaContainerized: number;
    seedlingBareRoot: number;
    seedlingContainerized: number;
    carePerHaPerYear: number;
    mineralizationPerHa: number;
  };
  sources: Record<string, NormativeRef>; // ключ — имя параметра: 'minOccurrence', 'heightCoefficients'…
}

export interface EvaluateOptions {
  referenceDate?: string; // ISO; по умолчанию — сегодня. В тестах передавать явно.
}

export interface DecisionDiff {
  changed: number;
  transitions: Partial<Record<`${DecisionKind}->${DecisionKind}`, number>>;
}

export interface RegionMeta {
  id: string;         // 'RU-NIZ'
  nameRu: string;     // 'Нижегородская область'
  shortRu: string;    // 'Нижегородская'
  centroid: LonLat;
  districtIds: string[];
  isPilot: boolean;
}

export type RegionShapes = GeoJSON.FeatureCollection<
  GeoJSON.Polygon | GeoJSON.MultiPolygon,
  { id: string; nameRu: string }
>;

export interface Dataset {
  version: string;
  seed: number;
  generatedAt: string;
  regions: RegionMeta[];
  regionShapes: RegionShapes;
  districts: ForestDistrict[];
  sites: CuttingSite[];
}

export type MapMode = 'decision' | 'sufficiency' | 'species' | 'inspection_age' | 'confidence';

export interface CameraRequest {
  id: number;          // монотонно растёт; карта реагирует на смену id
  center: LonLat;
  zoom: number;
  pitch?: number;
  bearing?: number;
  durationMs?: number;
}

export type FeedEventType = 'inspection' | 'alert' | 'norms_changed' | 'import' | 'system';

export interface FeedEvent {
  id: string;
  ts: number;
  type: FeedEventType;
  title: string;
  subtitle?: string;
  siteId?: string;
  regionId?: string;
  decision?: DecisionKind;
  location?: LonLat;   // если задано — карта рисует пинг
}
```

### D4. `src/domain/constants.ts` — справочники

Экспортировать константы `as const` с типами из D3:

- `SPECIES: Record<SpeciesCode, { nameRu; short; group; color; rgb }>`.
  - Короткие обозначения для формул состава: С, Е, П, Л, К, Д, Я, Лп, Б, Ос, Ол.
  - Цвета — из `docs/visual-direction.md`.
- `DECISIONS: Record<DecisionKind, { labelRu; shortRu; descriptionRu; cssVar; color; rgb }>`.
  - labelRu: «Естественное», «Комбинированное», «Искусственное», «Недостаточно данных».
  - Цвета: `#34D399`, `#FBBF24`, `#FB4D61`, `#8B9CFF`.
- `HEIGHT_CLASSES: Record<HeightClass, { labelRu; rangeRu }>`: «мелкий / до 0,5 м», «средний / 0,6–1,5 м», «крупный / более 1,5 м».
- `FELLING_TYPES: Record<FellingType, { labelRu }>`.
- `SITE_CONDITIONS: Record<SiteConditionCode, { trophotope: 'A'|'B'|'C'|'D'; moisture: 1|2|3|4; labelRu }>`. Пример: `B2` → «Свежая суборь».
- `MEASURES: Record<MeasureCode, { labelRu }>`. Тексты — из `docs/domain-glossary.md`.
- `PLANTING_STOCK: Record<PlantingStock, { labelRu; shortRu }>`: ОКС, ЗКС, саженцы, посев.
- `SOIL_PREP: Record<SoilPreparation, { labelRu }>`: «без обработки», «полосы», «борозды», «микроповышения», «площадки».
- `SEASONS: Record<Season, { labelRu }>`.
- `MAP_MODES: { id: MapMode; labelRu; hotkey: '1'..'5'; legend: ModeLegend }[]` в порядке: decision, sufficiency, species, inspection_age, confidence. Здесь `ModeLegend = { type: 'categorical' | 'continuous'; stops: { value: number | string; color: string; label: string }[] }`. Карта и HUD используют одни и те же шкалы:
  - `decision` — 4 категории `DECISIONS`.
  - `sufficiency` (средневзвешенный по площади `min(ratio, 2)`) — непрерывная: `0 → #FB4D61` «нет подроста», `0.5 → #FBBF24` «50 % нормы», `1 → #34D399` «норма», `2 → #36F1C2` «200 %».
  - `species` (главная целевая порода) — категории `SPECIES`.
  - `inspection_age` (месяцев с осмотра) — непрерывная: `0 → #36F1C2` «свежий», `12 → #3AA6FF` «год», `36 → #8B9CFF` «3+ года»; `null` → `#5F7570` «не осматривалась».
  - `confidence` — непрерывная: `0.15 → #3B3F6B` «низкая», `0.6 → #6C8CFF` «средняя», `0.99 → #36F1C2` «высокая».
  - Хелпер `colorForModeValue(mode, value): [r, g, b]` линейно интерполирует между стопами. Тест: значения на стопах возвращают ровно цвет стопа.

### D5. `src/domain/districts.ts` — лесные районы (демо, сверить с Приказом № 367)

| id | nameRu | zone |
|---|---|---|
| `north_taiga_eu` | Северо-таежный район европейской части РФ | taiga |
| `middle_taiga_eu` | Среднетаежный район европейской части РФ | taiga |
| `south_taiga_eu` | Южно-таежный район европейской части РФ | taiga |
| `mixed_eu` | Район хвойно-широколиственных (смешанных) лесов европейской части РФ | mixed |
| `forest_steppe_eu` | Лесостепной район европейской части РФ | forest_steppe |
| `west_ural_taiga` | Западно-Уральский таежный район | taiga |
| `east_ural_taiga` | Восточно-Уральский таежный район | taiga |
| `wsib_middle_taiga` | Западно-Сибирский среднетаежный равнинный район | taiga |
| `wsib_south_taiga` | Западно-Сибирский южно-таежный равнинный район | taiga |
| `wsib_subtaiga_steppe` | Западно-Сибирский подтаежно-лесостепной район | forest_steppe |
| `csib_plateau_taiga` | Среднесибирский плоскогорный таежный район | taiga |
| `csib_subtaiga_steppe` | Среднесибирский подтаежно-лесостепной район | forest_steppe |
| `altai_sayan_mountain_taiga` | Алтае-Саянский горно-таежный район | south_siberian_mountain |
| `baikal_mountain` | Байкальский горный лесной район | south_siberian_mountain |
| `transbaikal_permafrost_taiga` | Забайкальский мерзлотный таежный район | taiga |
| `esib_permafrost_taiga` | Восточно-Сибирский мерзлотный таежный район | taiga |
| `far_east_taiga` | Дальневосточный таежный район | taiga |
| `amur_primorye_mixed` | Приамурско-Приморский хвойно-широколиственный район | mixed |

Экспорт: `DISTRICTS: ForestDistrict[]` и `DISTRICT_BY_ID: Record<string, ForestDistrict>`.

### D6. `src/domain/format.ts`

- `fmtInt(1234567)` → `'1 234 567'`. Разделитель — неразрывный пробел U+00A0.
- `fmtCompact(612345)` → `'612 тыс.'`, `fmtCompact(412_000_000)` → `'412 млн'`, `fmtCompact(3.8e10)` → `'38 млрд'`.
- `fmtHa(x)`, `fmtPerHa(x)` → `'2 500 шт/га'`, `fmtRub(x)` (компактно: `'≈ 412 тыс. ₽'`), `fmtPct(0.723)` → `'72 %'`.
- `fmtDate('2025-06-14')` → `'14.06.2025'`, `fmtLonLat([44.1, 57.3])` → `'57,30° с. ш. 44,10° в. д.'`.
- `pluralRu(n, ['лесосека', 'лесосеки', 'лесосек'])`.
- `compositionFormula([{species:'pine',sharePct:70},{species:'spruce',sharePct:30}])` → `'7С3Е'`.

Покрыть тестами vitest: границы plural, 0, отрицательные, округления.

### D7. `src/engine/index.ts` — интерфейс движка (заглушка; реализацию заменит поток engine)

```ts
export { DEFAULT_NORMS } from './defaultNorms';
export function evaluateSite(site: CuttingSite, norms: NormsConfig, opts?: EvaluateOptions): DecisionResult;
export function evaluateAll(sites: CuttingSite[], norms: NormsConfig, opts?: EvaluateOptions): Record<string, DecisionResult>;
export function diffDecisions(prev: Record<string, DecisionResult>, next: Record<string, DecisionResult>): DecisionDiff;
```

Логика заглушки: `ratio = Σ(count·viable·coef) / 2000` по всем породам;
- `ratio ≥ 1` → natural;
- `ratio ≥ 0,5` → combined;
- иначе → artificial;
- `!undergrowthSurveyed` → insufficient_data.

Остальные поля заполняются правдоподобными константами. `explanation` — один шаг с пометкой «заглушка».

### D8. `src/engine/defaultNorms.ts` — демо-нормативы (полная таблица, переносится дословно)

```
version: 'demo-2026.1'
heightCoefficients: { small: 0.5, medium: 0.8, large: 1.0 }
minOccurrence: 0.65
combinedLowerRatio: 0.5
maxUndesiredShare: 0.6
```

`requiredPerHa` (шт/га; conifer / hardwood / softwood) по лесным районам:

| район | conifer | hardwood | softwood |
|---|---|---|---|
| north_taiga_eu | 1500 | 1500 | 2000 |
| middle_taiga_eu | 2000 | 2000 | 2500 |
| south_taiga_eu | 2500 | 2000 | 3000 |
| mixed_eu | 3000 | 2000 | 3000 |
| forest_steppe_eu | 3000 | 2500 | 3000 |
| west_ural_taiga | 2000 | 2000 | 2500 |
| east_ural_taiga | 2000 | 2000 | 2500 |
| wsib_middle_taiga | 1500 | 1500 | 2000 |
| wsib_south_taiga | 2000 | 2000 | 2500 |
| wsib_subtaiga_steppe | 2500 | 2000 | 3000 |
| csib_plateau_taiga | 1500 | 1500 | 2000 |
| csib_subtaiga_steppe | 2000 | 2000 | 2500 |
| altai_sayan_mountain_taiga | 1500 | 1500 | 2000 |
| baikal_mountain | 1500 | 1500 | 2000 |
| transbaikal_permafrost_taiga | 1200 | 1200 | 1500 |
| esib_permafrost_taiga | 1200 | 1200 | 1500 |
| far_east_taiga | 1500 | 1500 | 2000 |
| amur_primorye_mixed | 2000 | 1500 | 2500 |

У каждой строки `source: { doc: 'Правила лесовосстановления (Приказ Минприроды России от 29.12.2021 № 1024), приложение: нормативы по лесным районам', verified: false }`.

`targetSpeciesByCondition` (общий случай; первый элемент — главная порода):

| ТЛУ | целевые |
|---|---|
| A1, A2, A3, A4, B1 | pine |
| B2 | pine, spruce |
| B3, B4 | spruce, pine |
| C1 | pine, oak |
| C2 | spruce, pine, oak |
| C3 | spruce, fir |
| C4 | spruce |
| D2 | oak, ash, spruce |
| D3 | spruce, oak, ash |
| D4 | spruce |

`targetOverridesByDistrict`. Правила применяются сверху вниз, более позднее перекрывает более раннее для того же ТЛУ. В итоговом конфиге хранится уже слитый результат по каждому району:
- Все районы, кроме европейских (`*_eu`) и `amur_primorye_mixed`: `C1: [pine]`, `C2: [spruce, pine]`, `D2: [spruce, pine]`, `D3: [spruce, fir]`. Дуба и ясеня в Сибири и на Урале нет.
- `wsib_*`, `csib_*`, `altai_sayan_mountain_taiga`, `baikal_mountain`: `B2: [pine, cedar]`, `B3: [cedar, spruce]`, `C2: [cedar, spruce, fir]`, `C3: [fir, cedar, spruce]`.
- `transbaikal_permafrost_taiga`, `esib_permafrost_taiga`: все ТЛУ → `[larch, pine]`.
- `far_east_taiga`: `B2: [larch, spruce]`, `B3: [spruce, larch]`, `C2: [spruce, fir]`, `C3: [spruce, fir]`.
- `amur_primorye_mixed`: `B2: [cedar, larch]`, `C2: [cedar, spruce, oak]`, `C3: [spruce, fir, cedar]`, `D2: [oak, ash, cedar]`.

`plantingDensity` (шт/га, ОКС / ЗКС):
- pine 3500 / 2500
- spruce 3000 / 2000
- fir 3000 / 2000
- larch 3000 / 2000
- cedar 1500 / 1000
- oak 5000 / 3000
- ash 4000 / 3000

`unitCostsRub` (демо, оценочно):
- soilPrepPerHa 7000
- plantingPerHaBareRoot 15000
- plantingPerHaContainerized 12000
- seedlingBareRoot 6
- seedlingContainerized 22
- carePerHaPerYear 6000
- mineralizationPerHa 5000

`sources`: для `heightCoefficients`, `minOccurrence`, `combinedLowerRatio`, `maxUndesiredShare`, `plantingDensity`, `unitCostsRub` — `verified: false`. У `unitCostsRub` в doc написано «Оценка команды, не норматив».

### D9. `src/data/index.ts` — интерфейс данных (заглушка на фикстуре; реализацию заменит поток dataset)

```ts
export interface LoadProgress { step: string; done: number; total: number }
export function loadDataset(onProgress?: (p: LoadProgress) => void): Promise<Dataset>;
export function getSurveyPlots(site: CuttingSite): SurveyPlot[]; // детерминированно по site.id
```

Фикстура (`src/fixtures/`):
- 6 регионов: RU-NIZ (пилотный), RU-ARK, RU-KIR, RU-IRK, RU-KYA, RU-KHA. Формы — грубые многоугольники на 6–10 вершин вокруг реальных центроидов.
- 300 лесосек, детерминированно (seed 42): 50 на регион, разброс ±1,5° вокруг центроида.
- Полигон лесосеки — повёрнутый прямоугольник нужной площади.
- Подрост — 1–4 записи. Распределение решений примерно 45 / 25 / 25 / 5 %.

### D10. `src/state/store.ts` — глобальный стор (zustand, КОНТРАКТ)

```ts
export type AppPhase = 'boot' | 'loading' | 'intro' | 'ready' | 'error';
export type ViewId = 'map' | 'analytics' | 'norms';

export interface Filters {
  kinds: DecisionKind[];         // по умолчанию все 4
  regionIds: string[];           // [] = все
  species: SpeciesCode[];        // по главной целевой породе; [] = все
  fellingTypes: FellingType[];   // [] = все
  minConfidence: number;         // 0..1, по умолчанию 0
}

export interface LayerToggles {
  hexes: boolean; sites: boolean; regions: boolean; labels: boolean;
  hillshade: boolean; forestLoss: boolean; atmosphere: boolean; edgeScroll: boolean;
}  // по умолчанию всё true, кроме forestLoss и edgeScroll

export interface CameraState {
  center: LonLat; zoom: number; pitch: number; bearing: number;
  bounds: [LonLat, LonLat] | null;   // [юго-запад, северо-восток]
}

export interface WhatIfState { siteId: string; draft: CuttingSite; result: DecisionResult }

export interface UiState {
  leftPanelCollapsed: boolean; feedCollapsed: boolean;
  hotkeysHelpOpen: boolean; hudHidden: boolean;
}

export interface AppState {
  phase: AppPhase;
  loadingProgress: { step: string; done: number; total: number };
  error: string | null;
  dataset: Dataset | null;
  sitesById: Record<string, CuttingSite>;
  norms: NormsConfig;
  decisions: Record<string, DecisionResult>;
  lastDiff: DecisionDiff | null;
  view: ViewId;
  mapMode: MapMode;
  filters: Filters;
  layers: LayerToggles;
  selectedSiteId: string | null;
  selectedRegionId: string | null;
  hoveredSiteId: string | null;
  camera: CameraState;
  cameraRequest: CameraRequest | null;
  whatIf: WhatIfState | null;
  feed: FeedEvent[];              // новые сверху, не более 50
  ui: UiState;

  setPhase(phase: AppPhase): void;
  setLoadingProgress(p: AppState['loadingProgress']): void;
  setError(message: string | null): void;
  setDataset(ds: Dataset, decisions: Record<string, DecisionResult>): void;
  setNorms(norms: NormsConfig): void;          // evaluateAll → decisions, lastDiff = diffDecisions(prev, next)
  addSites(sites: CuttingSite[]): void;        // импорт: добавить и оценить только новые
  setView(view: ViewId): void;
  setMapMode(mode: MapMode): void;
  setFilters(patch: Partial<Filters>): void;
  resetFilters(): void;
  toggleLayer(key: keyof LayerToggles): void;
  selectSite(id: string | null, opts?: { fly?: boolean }): void;     // fly → requestCamera(zoom 13.5, pitch 55)
  selectRegion(id: string | null, opts?: { fly?: boolean }): void;   // fly → центроид, zoom 5, pitch 40
  setHoveredSite(id: string | null): void;
  requestCamera(req: Omit<CameraRequest, 'id'>): void;
  setCamera(camera: CameraState): void;        // карта пишет не чаще 10 раз в секунду
  startWhatIf(siteId: string): void;
  updateWhatIf(draft: CuttingSite): void;      // пересчёт evaluateSite(draft)
  endWhatIf(): void;
  pushFeed(e: Omit<FeedEvent, 'id' | 'ts'>): void;
  setUi(patch: Partial<UiState>): void;
}

export const useAppStore: UseBoundStore<StoreApi<AppState>>;
```

Правила:
- `selectSite(id)` сбрасывает `whatIf`, если тот относится к другой лесосеке.
- `selectSite(null)` не трогает `selectedRegionId`.
- Состояние стора — только сериализуемые значения: массивы и объекты, без Set и Map.

### D11. `src/state/selectors.ts` — общие производные данные (мемоизированы по ссылкам входов)

```ts
export function selectVisibleSiteIds(s: AppState): string[];   // учитывает filters
export interface Kpis {
  sites: number; areaHa: number;
  byKind: Record<DecisionKind, { count: number; areaHa: number }>;
  seedlingsTotal: number; costRub: number;
}
export function selectKpis(s: AppState): Kpis;                  // по видимым лесосекам
export interface RegionStat {
  regionId: string; sites: number; areaHa: number;
  byKindArea: Record<DecisionKind, number>;
  artificialAreaShare: number; seedlingsTotal: number; costRub: number;
}
export function selectRegionStats(s: AppState): RegionStat[];  // по видимым лесосекам
export function selectEffectiveDecision(s: AppState, siteId: string): DecisionResult | undefined; // учитывает whatIf
```

### D12. `src/state/bootstrap.ts`

`bootstrap()`:
1. `phase = 'loading'`.
2. `loadDataset(onProgress)`.
3. Шаг «Анализ лесосек» → `evaluateAll(dataset.sites, DEFAULT_NORMS)`. Для больших наборов — порциями по 5000 через `await` микропаузы, чтобы прогресс-бар обновлялся.
4. `setDataset`.
5. `phase = 'intro'`.

Ошибка на любом шаге → `setError(message)` и `phase = 'error'`.

### D13. Распределение горячих клавиш (во избежание конфликтов между потоками)

| Клавиши | Владелец | Действие |
|---|---|---|
| W A S D, стрелки | map | панорама (Shift — быстрее) |
| Q / E | map | поворот камеры |
| R / F | map | наклон камеры |
| + / − | map | зум |
| H, Home | map | обзор России |
| G | map | обзор глобуса |
| Space | map | к выбранному объекту |
| 1–5 | hud | режимы карты |
| Tab / Shift+Tab | hud | следующий / предыдущий критический объект |
| Esc | hud | закрыть карточку / снять выбор / выйти из «Что если» |
| [ | hud | свернуть левую панель |
| J | hud | свернуть журнал |
| ? , F1 | hud | справка по клавишам |
| \` (backquote) | hud | скрыть HUD (кинорежим) |
| Enter | shell | «Начать» на интро |

Все обработчики игнорируют события, если фокус в `input`, `textarea`, `select` или `[contenteditable]`.

### D14. Дизайн-токены и раскладка (`src/styles/tokens.css`)

Цвета, шрифты, радиусы — из `docs/visual-direction.md`. Размеры зон:

```
--topbar-h: 64px; --left-w: 296px; --right-w: 400px; --bottom-h: 168px;
--minimap-w: 260px; --gap: 12px; --radius: 4px;
--font-display: 'Unbounded'; --font-ui: 'Exo 2'; --font-mono: 'JetBrains Mono';
```

### D15. UI-примитивы (`src/ui/`)

Каждый — отдельный файл, без внешних UI-библиотек, стилизация через CSS-модули или обычный CSS с префиксом `ui-`:
- `Panel` — фон, blur, рамка, уголки-скобки; пропсы `title`, `actions`, `dense`.
- `Button` — варианты `primary | ghost | danger`, размеры `sm | md`.
- `IconButton`, `Chip` (toggle-режим), `DecisionBadge` (kind, size: `sm | lg`).
- `Stat` (label, value, unit, delta) и `AnimatedNumber` (count-up 900 мс, уважает reduced-motion).
- `Kbd`, `Tabs`, `Toggle`, `Slider` (с подписью значения), `Meter` (значение, пороги, цвет), `Tooltip`.

Демо-страница примитивов доступна по `?ui=1` (`src/ui/Showcase.tsx`): на ней удобно проверять визуал.

### D16. Деплой

`.github/workflows/deploy.yml`:
- триггер — `push` в `main` и `workflow_dispatch`;
- шаги: `actions/checkout@v4`, `actions/setup-node@v4` (node 22, cache npm), `npm ci`, `npm run typecheck`, `npm test -- --run`, `BASE_PATH=/<repo>/ npm run build`;
- публикация: `actions/upload-pages-artifact@v3` + `actions/deploy-pages@v4`.

Права: `pages: write`, `id-token: write`. В `vite.config.ts`: `base: process.env.BASE_PATH ?? '/'`. Данные грузятся через `import.meta.env.BASE_URL + 'data/...'`.

## Risks / Trade-offs

- [Мажорные версии свежие: maplibre 6, vite 8, TS 7] → если шаблон create-vite или peer-зависимости конфликтуют, откатиться на ближайшую совместимую минорную версию. Записать фактические версии в README.
- [Контракт окажется неудобным для потока] → поток делает маленький PR с изменением контракта и предупреждает остальных в чате команды. Сам контракт молча не менять.
- [Фикстура слишком маленькая для проверки производительности] → поток map может временно умножать фикстуру (клонировать со сдвигом) до 60 000 точек.

## Open Questions

- Название продукта «ПОДРОСТ» рабочее, менять можно в одном месте (`src/shell/brand.ts`).
