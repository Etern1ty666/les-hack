# Design

## Context

Контракты стора, типов и `MAP_MODES` с легендами описаны в `setup-app-foundation/design.md` (D3, D4, D10, D13). Визуальные правила — в `docs/visual-direction.md`. Пока не смержен поток dataset, карта работает на фикстуре: для проверки производительности её можно временно размножить до 60 000 точек.

## Goals / Non-Goals

**Goals:** «вау» с первой секунды, плавный зум от орбиты до лесосеки, ≥ 50 FPS, понятная читаемость решений.
**Non-Goals:**
- 3D-деревья и учётные площадки — это change `add-cutting-site-3d`;
- 3D-рельеф (`setTerrain`) — он ломает совмещение со слоями deck.gl. Только отмывка; терраин можно сделать на этапе полировки;
- границы государств и подписи стран не рисуются (см. dataset Non-Goals).

## Decisions

### D1. Структура `src/map/`

```
index.tsx              # MapScene: <Map> (react-map-gl/maplibre) + DeckOverlay + Starfield + Tooltip + Minimap + Attribution
style.ts               # buildBaseStyle(layers): StyleSpecification
deck/DeckOverlay.tsx   # useControl(() => new MapboxOverlay({ interleaved: true }))
layers/
  hexLayer.ts          # H3HexagonLayer
  sitesLayer.ts        # ScatterplotLayer ×2 (ядро + свечение), PolygonLayer на крупном зуме
  selectionLayers.ts   # кольцо (PathLayer + PathStyleExtension), маяк (ColumnLayer)
  pingsLayer.ts        # ScatterplotLayer (stroked)
regions.ts             # нативные слои MapLibre: line + symbol для субъектов
aggregate/
  h3Index.ts           # предрасчёт h3-ячеек всех лесосек для res 2–5 (один раз на датасет)
  aggregate.ts         # агрегаты по видимым лесосекам и режиму → HexDatum[]
colors.ts              # обёртка над colorForModeValue из domain/constants
camera/
  presets.ts           # RUSSIA_VIEW, GLOBE_VIEW
  useRtsControls.ts    # клавиатура и edge-scroll в rAF-цикле
  useCameraRequests.ts # store.cameraRequest → map.flyTo
  useCameraPublisher.ts# map 'move' → store.setCamera (троттлинг 100 мс)
  useIntro.ts          # вращение в intro, перелёт и рост гексов в ready
Minimap.tsx
Tooltip.tsx
Starfield.tsx          # CSS/canvas-слой под картой
extensions.ts          # registerLayerProvider — точка расширения (D11)
useAnimationClock.ts   # rAF-время для пульсаций (ref, без setState)
```

### D2. Источники и базовый стиль (`style.ts`)

```
sources:
  s2:  raster, tiles ['https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/g/{z}/{y}/{x}.jpg'],
       tileSize 256, maxzoom 15
       (порядок {z}/{y}/{x} — WMTS EOX; проверено: /5/9/19.jpg → 200)
  dem: raster-dem, encoding 'terrarium',
       tiles ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'], maxzoom 14
  ofm: vector, url 'https://tiles.openfreemap.org/planet'
  gfc: raster, tiles ['https://storage.googleapis.com/earthenginepartners-hansen/tiles/gfc_v1.12/loss_alpha/{z}/{x}/{y}.png'],
       maxzoom 12
  regions: geojson (dataset.regionShapes), promoteId 'id'
glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf'
projection: { type: 'globe' }
sky: атмосфера — atmosphere-blend 1 до зума 5, затем к 0 на зуме 7
     (сверить имена свойств с документацией maplibre-gl 6.x)
layers:
  background   #03060A
  s2           raster-saturation -0.35, raster-contrast 0.15, raster-brightness-max 0.55
  hillshade    source dem, exaggeration 0.35, shadow #000000, highlight #9FFFE0 (opacity через цвет rgba .15)
  water        ofm 'water' fill #031016, opacity 0.55          (подсушивает моря и озёра)
  gfc          raster, visibility по layers.forestLoss, raster-opacity 0.85
  regions-line line #36F1C2, opacity 0.25, width 1 (выбранный: 2.5, «дыхание» opacity 0.5–0.9)
  regions-label symbol по центроидам, text-field shortRu UPPERCASE, Noto Sans Bold,
               text-letter-spacing 0.4, size 11–16, color #9DB5AE, halo #000; minzoom 2.8, maxzoom 6.5
  place-city   ofm 'place' class=city, name:ru → name, Noto Sans Regular, color #9DB5AE, halo #000; minzoom 3.5
  place-town   class=town, minzoom 7.5
  water-name   ofm 'water_name' (моря, Байкал), italic, color #4F7F86
```

Переключатели `layers.*` меняют `visibility` нативных слоёв через `map.setLayoutProperty`, без пересборки стиля.

### D3. Слои deck.gl и уровни детализации

| Слой | Зум | Детали |
|---|---|---|
| hexes | < 8.5 (затухание 7.5–8.5) | `H3HexagonLayer`, extruded, `coverage 0.86`, высота из D4, `material {ambient .45, diffuse .65, shininess 32}`, `transitions: { getFillColor: 700, elevationScale: 1600 }`, pickable |
| sites-glow | ≥ 7.5 | `ScatterplotLayer`, радиус 6–14 px, альфа 60, аддитивное смешивание (`parameters: { blend: true, blendFunc: [SRC_ALPHA, ONE] }`, сверить с luma.gl 9.4) |
| sites-core | ≥ 7.5 | радиус 2.5–5 px, альфа 230, pickable, обводка 1 px #000 (альфа 120) |
| site-polygons | ≥ 11.5 | `PolygonLayer`, заливка альфа 60, линия 2 px цвета режима, pickable |
| selection-ring | всегда при выборе | `PathLayer` с `PathStyleExtension({dash:true})`, окружность ≈ 22 px в метрах на текущем зуме, вращается (фаза из `useAnimationClock`) |
| selection-beacon | всегда при выборе | `ColumnLayer`, `radiusUnits: 'pixels'` (3 px), высота `clamp(2^(12−zoom)·2 км, 1 км, 400 км)`, альфа 120, цвет решения |
| pings | последние 2.4 с событий с `location` | `ScatterplotLayer`, stroked, радиус 0→40 px, альфа 1→0 (ease-out) |

Разрешение H3: zoom < 3.5 → 2; < 5 → 3; < 6.5 → 4; иначе 5. Смена разрешения — кросс-фейдом через `opacity` двух инстансов слоя за 300 мс.

Пульсирующие слои обновляются в rAF через `deckOverlay.setProps({ layers })`, сам React не ререндерится.

**Все неэкструдированные слои** (точки, контуры, кольцо, маяк-колонна тоже допустимо, пинги) создаются с `parameters: { depthCompare: 'always', depthWriteEnabled: false }`, иначе на глобусе с наклоном их закрывает поверхность (см. Decision log, п. 3). Гексы пересоздаются только при смене данных, фильтров, режима, разрешения или `whatIf`.

### D4. Агрегация и высоты

- `h3Index`: один раз на датасет `Uint32`-пары или строки ячеек для res 2–5 (`latLngToCell`). При импорте новые лесосеки дописываются.
- `aggregate(visibleIds, res, mode, decisions)` → `HexDatum`:
  ```
  { h3, count, areaHa,
    byKindArea: Record<DecisionKind, number>,
    modeValue: number | string,   // для цвета
    regionIds: string[] }
  ```
  - `decision` — kind с максимальной площадью;
  - `sufficiency` — средневзвешенное по площади `min(ratio, 2)`;
  - `species` — главная целевая порода с наибольшей площадью;
  - `inspection_age` — средневзвешенное число месяцев с осмотра (`null` не учитываются; если все `null`, то `null`);
  - `confidence` — средневзвешенная достоверность.
- Высота = `maxH[res] · sqrt(areaHa / maxAreaHa[res])`, где `maxH = {2: 450 км, 3: 170 км, 4: 60 км, 5: 22 км}`. Максимум площади считается по текущей выборке.
- Целевое время пересчёта ≤ 120 мс на 60 000 лесосек. Мемоизация по `(decisions ref, visibleIds ref, res, mode, whatIf ref)`.

### D5. Камера

- Пресеты:
  - `RUSSIA_VIEW = { center: [96, 61], zoom: 2.7, pitch: 35, bearing: 0 }`. При ширине экрана < 1400 px зум уменьшается на 0.3.
  - `GLOBE_VIEW = { center: [70, 40], zoom: 1.15, pitch: 0, bearing: 0 }`.
- Пределы: `minZoom 0.8`, `maxZoom 17`, `maxPitch 75`.
- Клавиатурный rAF-цикл: множество зажатых клавиш хранится в ref; на каждом кадре вызываются `map.panBy([dx, dy], {duration: 0})`, `setBearing`, `setPitch`, `setZoom` с учётом `dt`. Обработчики на `window`; события из полей ввода отсекаются по D13 foundation.
- Перелёты: `map.flyTo({ ..., curve: 1.6, essential: true, duration: req.durationMs ?? 2200 })`. При `prefers-reduced-motion` используется `jumpTo`.
- Публикация камеры: `map.on('move')` → троттлинг 100 мс → `setCamera({ center, zoom, pitch, bearing, bounds })`.

### D6. Интро

- Фаза `intro`: `jumpTo(GLOBE_VIEW)`, в rAF `center.lon += 4°/с`, `elevationScale` гексов = 0.
- Переход в `ready`: остановка вращения → `flyTo(RUSSIA_VIEW, { duration: 4500, curve: 1.8 })`. На 55 % перелёта `elevationScale` → 1 (transition 1600 мс, ease-out-cubic).
- При reduced motion: мгновенный `jumpTo(RUSSIA_VIEW)`, высоты сразу полные.

### D7. Миникарта

- Вторая карта MapLibre, 260×150 px, mercator, `interactive: false`, `fitBounds([[19, 41], [191, 78]])`.
- Стиль: фон `#03060A`, субъекты из `regionShapes` с заливкой цветом преобладающего по площади решения (альфа 0.55) и линией `#36F1C2` (альфа 0.3). Видимая область — полигон из `camera.bounds`, линия 1.5 px `#36F1C2` и заливка с альфой 0.08.
- Клик: `unproject` → `requestCamera({ center, zoom: camera.zoom })`.
- Рамка и уголки-скобки — компонент `Panel` из `src/ui`.

### D8. Тултип

HTML-оверлей, позиционированный по `info.x / info.y` от deck.gl, со смещением 16 px. Стиль Panel dense. Содержимое по спецификации; мини-полоса распределения — 4 сегмента цветов решений по площади. Задержка показа 80 мс; во время перетаскивания карты скрыт.

### D8a. Звёзды

Контейнер карты прозрачный, под ним `Starfield`: canvas около 1 500 точек разной яркости с лёгким мерцанием (≤ 5 % точек анимированы) и радиальной туманностью в цветах `--accent-dim`. При зуме ≥ 5 прозрачность Starfield уходит в 0 (за небом его и так не видно).

### D9. Спайк совместимости (первая задача потока)

Риск: deck.gl 9.4 `MapboxOverlay({ interleaved: true })` + globe в maplibre-gl 6 могут не совпадать.

Спайк — `H3HexagonLayer` и `ScatterplotLayer` на глобусе при зуме 1–9, вращении и наклоне. Исходы:
- **A — совмещение корректно.** Продолжаем по этому дизайну.
- **B — некорректно на глобусе.** Гексы делаем нативным `fill-extrusion` из GeoJSON (`cellToBoundary`), точки — нативным `circle`. deck.gl остаётся для выделения, пингов и зума ≥ 9. Режимы и анимации — через `setPaintProperty` и `feature-state`.
- **C — B не даёт приемлемого вида.** Проекция mercator на всех зумах. Интро — перелёт по плоской карте с большого отдаления, звёзды и атмосферу имитирует CSS-оверлей.

Итог спайка записывается в этот файл (раздел «Decision log») отдельным коммитом до основной работы.

### D10. Атрибуция

Компактная кнопка «ⓘ Источники» в правом нижнем углу над компасом, раскрывающая Panel со списком:
- «Sentinel-2 cloudless 2024 © EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2024), CC BY-NC-SA 4.0»;
- «© OpenMapTiles © OpenStreetMap contributors (OpenFreeMap)»;
- «Terrain Tiles: Mapzen / AWS Open Data»;
- «Natural Earth (public domain)»;
- при включённом слое GFC: «Hansen/UMD/Google/USGS/NASA, Global Forest Change 2000–2024 v1.12, CC BY 4.0».

Стандартный AttributionControl MapLibre скрыт.

### D11. Точка расширения для других потоков (`src/map/extensions.ts`)

```ts
export interface LayerContext {
  zoom: number; time: number;                 // time — сек из useAnimationClock
  map: maplibregl.Map;
  state: AppState;                            // снимок стора
}
export type LayerProvider = (ctx: LayerContext) => Layer[];
export function registerLayerProvider(id: string, provider: LayerProvider): () => void; // возвращает unregister
```

`MapScene` на каждом обновлении слоёв добавляет поверх своих слоёв результаты всех зарегистрированных провайдеров. Так поток `add-cutting-site-3d` добавляет 3D-деревья, не меняя файлы карты. Провайдеры вызываются и в rAF-цикле, поэтому должны быть дешёвыми и мемоизировать тяжёлое.

## Risks / Trade-offs

- [Совместимость deck.gl и globe] → спайк D9 с тремя исходами.
- [Тайлы EOX или OpenFreeMap недоступны на защите] → при ошибке загрузки тайлов подложка деградирует до тёмного фона с отмывкой. Карта и данные работают. Заранее открыть демо, чтобы тайлы попали в кэш браузера.
- [Лицензия EOX CC BY-NC-SA] → некоммерческий хакатон допустим; атрибуция обязательна.
- [Высокие гексы закрывают обзор при большом наклоне] → `maxH` подобраны по зумам, при pitch > 60° высоты дополнительно умножаются на 0.6.

## Decision log

### 2026-10-23 — спайк D9: исход **A** (с двумя обязательными условиями)

Стенд: `?spike=1` — H3-гексы и точки deck.gl; `?spike=points` — только точки. Для сравнения рядом голубые кружки MapLibre в тех же координатах (`src/map/spike/spikeLayers.ts`). Скриншоты — в `docs/spike/`.

1. **maplibre-gl 6.x несовместим с deck.gl 9.4.0 в interleaved-режиме.**
   - В MapLibre 6 `Map` больше не наследует `Camera`: камера переехала в `map._camera`, а `map.transform` исчез.
   - deck.gl в `getViewport` читает `map.transform.height` → `TypeError: Cannot read properties of undefined (reading 'height')` на каждом кадре.
   - Дополнительно воркер MapLibre 6 лежит отдельным файлом и под пре-бандлингом Vite не грузится (`Worker failed to load`).
   - **Решение:** зафиксировать `maplibre-gl ~5.24.0` (последний 5.x, апрель 2026). Вернуться к 6.x, когда deck.gl поддержит его официально.
2. **На maplibre 5.24 + deck.gl 9.4.0 глобус работает.** deck.gl сам переключается на `GlobeView`, когда `projection.type === 'globe'`. Экструдированные `H3HexagonLayer` стоят на глобусе и вращаются вместе с ним: зум 1,5 и 4, наклон 45° — `01`–`03`.
3. **Плоские слои deck.gl на глобусе с наклоном перекрываются глубиной поверхности MapLibre.** На зуме ≥ 6 и наклоне ≥ 45° точки пропадают (`04`), без наклона совпадают точно (`05`).
   - **Обязательное правило:** у всех плоских слоёв (Scatterplot, Path, Polygon без экструзии, Text, кольца выделения, пинги) — `parameters: { depthCompare: 'always', depthWriteEnabled: false }`.
   - С этим правилом совмещение точное на зуме 6 / наклоне 45° и зуме 8,5 / наклоне 55° (`06`, `07`).
   - Экструдированные гексы тест глубины сохраняют (нужен для 3D), а с зума 8,5 по LOD они всё равно скрыты.
4. **Риск для `add-cutting-site-3d`.** `SimpleMeshLayer` (деревья) нужен тест глубины. На зуме ≥ 12 MapLibre-globe уже почти mercator, но это проверить первой задачей того change. Запасной вариант: на зуме ≥ 12 рисовать 3D-вид с `depthCompare: 'always'` и сортировкой по дальности.
5. **Не измерено:** количественный тест «пикинг deck.gl в точке `map.project()` лесосеки» для 9 сочетаний зум × наклон. Скрипт есть в истории спайка; прогнать в видимой вкладке, т. к. в фоне `requestAnimationFrame` не работает. Визуальной проверки достаточно для продолжения.
