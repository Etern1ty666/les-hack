# Proposal

## Why

Четыре потока (движок, данные, карта, HUD) должны стартовать одновременно и не мешать друг другу. Для этого нужен общий каркас: проект, единые доменные типы, глобальный стор, дизайн-токены, базовые UI-примитивы и заглушки модулей с фикстурными данными. Это **волна 0**: один человек делает её примерно за час, остальные ждут её мержа.

## What Changes

- Каркас Vite + React 19 + TypeScript (strict), скрипты `dev / build / preview / typecheck / test / lint`.
- Зависимости всех потоков ставятся сразу, чтобы потом не конфликтовать в `package.json`.
- Контракты (дословно из design.md):
  - `src/domain/types.ts`, `src/domain/constants.ts`, `src/domain/districts.ts`, `src/domain/format.ts`;
  - `src/state/store.ts`, `src/state/selectors.ts`, `src/state/bootstrap.ts`.
- Заглушки модулей с правильными сигнатурами:
  - `src/engine/index.ts` (упрощённая логика) и `src/engine/defaultNorms.ts` (полная таблица демо-нормативов);
  - `src/data/index.ts` (фикстура примерно на 300 лесосек в 6 регионах);
  - `src/map/index.tsx`, `src/hud/index.tsx`, `src/workspace/index.tsx` (плейсхолдеры).
- Дизайн-токены и глобальные стили по `docs/visual-direction.md`, шрифты с кириллицей.
- UI-примитивы в `src/ui/`: Panel, Button, Chip, DecisionBadge, Stat, AnimatedNumber, Kbd, Tabs, Toggle, Slider, Meter, Tooltip.
- Оболочка приложения:
  - фазы `boot → loading → intro → ready`;
  - экран загрузки с прогрессом;
  - титульная карточка интро с кнопкой «Начать»;
  - экран ошибки;
  - постоянный бейдж «Демо-данные».
- Деплой на GitHub Pages через GitHub Actions при пуше в `main`.

## Capabilities

### New Capabilities
- `app-shell`: жизненный цикл приложения (загрузка → интро → работа), раскладка слоёв экрана, тема, бейдж демо-данных, обработка ошибок загрузки.
- `app-delivery`: сборка и публикация прототипа по публичному URL.

### Modified Capabilities
<!-- нет -->

## Impact

- Создаёт всю структуру репозитория. После мержа другие потоки работают каждый в своей папке (см. владение в `openspec/config.yaml`).
- Контракты из design.md становятся обязательными для всех потоков.
- Зависимости: react, react-dom, maplibre-gl, react-map-gl, deck.gl (`@deck.gl/core`, `layers`, `geo-layers`, `mesh-layers`, `mapbox`, `extensions`), `@luma.gl/engine`, h3-js, zustand, motion, lucide-react, `@fontsource/*`, papaparse; dev: vitest, typescript, eslint, `@types/geojson`, mapshaper.
