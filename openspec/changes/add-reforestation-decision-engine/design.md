# Design

## Context

Контракты (`CuttingSite`, `DecisionResult`, `NormsConfig`, сигнатуры `evaluateSite / evaluateAll / diffDecisions`) уже в коде после `setup-app-foundation`, см. его design.md (D3, D7, D8). Движок — чистый TypeScript без зависимостей от UI. Его импортируют стор, HUD, analytics и генератор данных.

## Goals / Non-Goals

**Goals:**
- Прозрачный, детерминированный и быстрый движок правил по спецификациям `reforestation-decision` и `reforestation-recommendation`.
- Каждое число нормы читается из `NormsConfig`, в коде нет магических констант нормативов.
- Прогноз успешности с объяснимыми факторами и заменяемой моделью.
- `src/engine/README.md` — описание правил человеческим языком, пригодное для слайда.

**Non-Goals:**
- Обучение ML-модели на реальных данных: реальных данных нет, оставляем интерфейс.
- UI. Движок только возвращает данные.

## Decisions

### D1. Структура модуля

```
src/engine/
  index.ts            # публичный API (сигнатуры не меняются)
  defaultNorms.ts     # из foundation; можно уточнять значения
  decide.ts           # оркестрация правил → kind, metrics, explanation
  rules/
    fellingType.ts    # R6
    data.ts           # R0
    targets.ts        # R1
    normalize.ts      # R2
    sufficiency.ts    # R3
    occurrence.ts     # R4
    composition.ts    # R5
  recommend.ts        # технологическая карта
  confidence.ts
  success/
    model.ts          # interface SuccessModel { version; predict(features): { p; factors } }
    heuristic.ts      # логистическая модель с коэффициентами ниже
  diff.ts
  explainText.ts      # форматирование текстов шагов (через domain/format)
  README.md
  __tests__/          # golden.test.ts, recommend.test.ts, confidence.test.ts, diff.test.ts, perf.bench.ts
```

### D2. Порядок правил (трассировка в этом порядке)

1. **R6_FELLING_TYPE**. `selective | sanitary_selective` → `natural`, `needsActiveMeasures=false`, `confidence=0.9`, шаг `info` «Выборочная рубка: лесной покров сохранён». **Стоп.**
2. **R0_DATA**. `undergrowthSurveyed=false` → `insufficient_data`, `confidence=0.3`, заметка «Провести учёт подроста на учётных площадках». **Стоп.** Если `occurrence=null` — шаг `warn`; если `inspectionDate=null` — шаг `warn`.
3. **R1_TARGETS**. `targets = targetOverridesByDistrict[districtId]?.[tlu] ?? targetSpeciesByCondition[tlu]`. Шаг `info`: «Целевые породы для B2 (Южно-таежный район…): сосна, ель».
4. **R2_NORMALIZE**. `normalized = Σ count·viable·coef[height]` по записям, где `species ∈ targets`. Шаг `info` с разбивкой по породам: «ель: 2 000 × 0,9 × 0,8 = 1 440».
5. **R3_SUFFICIENCY**. `required = districts[districtId].requiredPerHa[SPECIES[targets[0]].group]`, `ratio = normalized / required`. Исход: `pass` при `ratio ≥ 1`, `warn` при `ratio ≥ combinedLowerRatio`, иначе `fail`. Ссылка — `districts[...].source`.
6. **R4_OCCURRENCE**. `occOk = occurrence !== null ? occurrence ≥ minOccurrence : ratio ≥ 1.5`. Если `occurrence = null` — исход `warn`, в тексте «не измерялась; засчитано по запасу подроста ≥ 150 %».
7. **R5_COMPOSITION**. `undesired = Σ viable(нецелевые softwood) / Σ viable(все)`. Используется `count·viable` без коэффициента высоты; при пустом подросте 0. Если `undesired > maxUndesiredShare` → флаг `speciesShiftRisk`, исход `warn`.
8. **R7_DECISION**:
   - `ratio ≥ 1 && occOk` → `natural`;
   - `ratio ≥ 1 && !occOk` → `combined`;
   - `ratio ≥ combinedLowerRatio` → `combined`, но при `speciesShiftRisk` → `artificial`;
   - иначе → `artificial`.

   `needsActiveMeasures`: для `combined` и `artificial` — `true`. Для `natural` — `true` только если назначены `soil_mineralization` или `thinning_softwood`.

### D3. Технологическая карта (`recommend.ts`)

- **Меры**:
  - `natural`: `[preserve_undergrowth]`; если `1 ≤ ratio < 1.2` → `+ soil_mineralization`; при `speciesShiftRisk` → `+ thinning_softwood`.
  - `combined`: `[preserve_undergrowth, gap_planting, agrotech_care]`.
  - `artificial`: `[planting, agrotech_care]`.
  - При `speciesShiftRisk` для `combined` и `artificial` → `+ thinning_softwood`.
- **Состав**: из `targets` — 1 → [100]; 2 → [70, 30]; ≥ 3 → [60, 30, 10].
- **Материал**: `containerized`, если трофотоп ∈ {C, D}, или влажность ≥ 3, или `districtId ∈ {transbaikal_permafrost_taiga, esib_permafrost_taiga}`. Иначе `bare_root`.
- **Сезон**: ЗКС → `spring_or_autumn`, ОКС → `spring`. Для `natural` → `null`.
- **Густота**: `Σ share × plantingDensity[species][stock]`, округление до 50. Для `natural` → `null`.
- **Обработка почвы**: влажность 1 → `furrows`; 2 → `furrows` (ОКС) / `strips` (ЗКС); 3 → `strips`; 4 → `mounds`. Для `natural` → `none`.
- **Уходы** (`careYears`): A, B → 3; C → 4; D → 5. Для `natural` → 0.
- **Площадь посадки**: см. спецификацию. `seedlingsTotal = round(area × density)`.
- **Стоимость**:
  ```
  area × (soilPrepPerHa + plantingPerHa[stock] + careYears × carePerHaPerYear)
  + seedlingsTotal × seedling[stock]
  + (soil_mineralization ? areaHa × mineralizationPerHa : 0)
  ```
- **Срок перевода**:
  - `artificial`: pine 6, larch 6, spruce 8, fir 8, cedar 10, oak 8, ash 8 (по главной породе);
  - `combined`: на 1 год меньше, но не меньше 3;
  - `natural`: 3, если доля крупного подроста в приведённом количестве ≥ 0,6, иначе 5.
- **Заметки**: человеческие фразы, например «Сохранить куртины подроста при трелёвке» или «Осветление через 2–3 года после посадки».

### D4. Достоверность (`confidence.ts`)

```
c = 0.95
if occurrence == null:                       c -= 0.25
if inspectionDate == null:                   c -= 0.15
else if years(referenceDate - inspectionDate) > 3:  c -= 0.10
m = min(|ratio - 1|, |ratio - combinedLowerRatio|)
if m < 0.1: c -= 0.20  elif m < 0.2: c -= 0.10
if occurrence != null and |occurrence - minOccurrence| < 0.05:  c -= 0.10
clamp(c, 0.15, 0.99)
```

Для R6 и R0 используются фиксированные значения из D2.

### D5. Прогноз успешности (`success/heuristic.ts`)

Признаки:
- `f_ratio = min(ratio, 2)`;
- `f_occ = occurrence ?? 0.5`;
- `f_undesired`;
- `f_large` — доля крупного подроста в приведённом;
- `f_wet` — влажность 4;
- `f_rich` — трофотоп C или D;
- `f_zks` — ЗКС;
- `f_care = careYears / 5`.

| Способ | Логит z |
|---|---|
| natural | −1.0 + 1.6·f_ratio + 1.2·f_occ − 2.0·f_undesired + 0.6·f_large − 0.4·f_wet |
| combined | −0.2 + 0.9·min(f_ratio,1) + 0.8·f_occ + 0.7·f_zks − 1.4·f_undesired − 0.5·f_rich − 0.6·f_wet + 0.5·f_care |
| artificial | 0.4 + 0.3·f_occ + 0.9·f_zks − 1.2·f_undesired − 0.6·f_rich − 0.7·f_wet + 0.6·f_care |

`p = clamp(sigmoid(z), 0.05, 0.98)`. Для `insufficient_data` → `p = 0.5`, один фактор «Нет данных о подросте».

Факторы — слагаемые без свободного члена: `contribution = coef × value`, подпись с фактическим значением, например «Встречаемость 72 %». Отбираются топ-5 по модулю, но не меньше 3.

Модель скрыта за интерфейсом `SuccessModel`. Позже её можно заменить обученной: градиентный бустинг, экспортированный в JSON-деревья, или ONNX. Контракты при этом не меняются. Об этом — абзац в README.

### D6. Производительность

- Никаких `toLocaleString` и `Intl` в горячем цикле: числа форматируются через `domain/format`, он работает на собственной быстрой реализации.
- Если бенчмарк не укладывается в 300 мс, `explanation` и `successFactors` делаются ленивыми. Это перечисляемые геттеры через `Object.defineProperty`, кэшируются при первом чтении. Контракт при этом не меняется.
- Бенчмарк — `vitest bench` на 60 000 лесосек. Генерировать их простым детерминированным генератором прямо в тесте, без зависимости от потока dataset.

### D7. Золотые тесты (`__tests__/golden.test.ts`)

Общие условия, если не сказано иное: `referenceDate = '2026-06-01'`, `areaHa = 10`, `fellingType = clear`, `inspectionDate = '2025-09-15'`, `undergrowthSurveyed = true`, `DEFAULT_NORMS`.

| ID | Вход | Ожидание |
|---|---|---|
| G1 | south_taiga_eu, B2; ель medium 2000×0,9; сосна small 1000×0,8; occ 0,7 | normalized 1840, ratio 0,736, `combined`; состав 7С3Е; ОКС; furrows; густота 3350; площадь 3,0 га; сеянцев 10 050; стоимость 180 300 ₽ |
| G2 | как G1, но ель large 3000×0,9 | normalized 3100, ratio 1,24, `natural`; мер — только `preserve_undergrowth`; срок 3 |
| G3 | как G2, но occ 0,5 | `combined`; площадь посадки 5,0 га |
| G4 | south_taiga_eu, A2; берёза large 8000×0,9; сосна small 300×0,8; occ 0,4 | normalized 120, `artificial`; undesired ≈ 0,968; меры содержат `thinning_softwood`; состав 10С; густота 3500 |
| G5 | `undergrowthSurveyed=false` | `insufficient_data`, confidence ≤ 0,35 |
| G6 | `fellingType = sanitary_selective` | `natural`, `needsActiveMeasures=false`, шаг R6 `info` |
| G7 | как G2, но ель large 3000×1,0 + сосна large 1000×1,0 (ratio 1,6), occ `null` | `natural`, шаг R4 `warn`, confidence ≤ 0,75 |
| G8 | ель large 2500×1,0, occ 0,65 | ratio 1,0, `natural` (пороги включительно) |
| G9 | G2 при `minOccurrence = 0,75` (occ 0,72) | `combined`; `diffDecisions` с исходными нормами → `natural->combined: 1` |
| G10 | csib_plateau_taiga, C2 | targets `[cedar, spruce, fir]` |
| G11 | esib_permafrost_taiga, B2, решение artificial | targets `[larch, pine]`, ЗКС |
| G12 | south_taiga_eu, C3, artificial (подроста нет) | ЗКС, `spring_or_autumn`, strips, уходы 4, срок 8 |

Проверка G1, расчёт стоимости: `3,0 × (7000 + 15000 + 3 × 6000) + 10 050 × 6 = 120 000 + 60 300 = 180 300`.

## Risks / Trade-offs

- [Демо-нормативы расходятся с реальными приложениями к Правилам] → все числа в конфиге с `verified: false`. UI показывает метку «не сверено». Перед защитой исправить конфиг, код не трогать.
- [Пороговая логика выглядит «не ИИ»] → в докладе подаём как гибрид: нормативная экспертная система (обязательна по закону, объяснима) плюс вероятностная модель успешности с объяснением факторов. Интерфейс готов к обучению на реальных данных ФГИС ЛК.
- [60k × 8 строк трассировки тормозят] → ленивые поля (D6).

## Open Questions

- Нужны ли разные нормативы для сплошных санитарных и сплошных рубок? Пока одинаковые. Если отличаются, добавится ключ в `DistrictNorm`.
