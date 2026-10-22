# Tasks

## 1. Каркас проекта

- [ ] 1.1 Создать проект Vite (шаблон react-ts) в корне репозитория, не трогая `openspec/`, `docs/`, `.claude/`, `.cursor/`, `.agents/`. Проверка: `npm run dev` открывает стартовую страницу.
- [ ] 1.2 Установить зависимости из design.md D2 и зафиксировать фактические версии в README (раздел «Стек»). Проверка: `npm ls maplibre-gl @deck.gl/core react` без ошибок peer-зависимостей.
- [ ] 1.3 Настроить `tsconfig` (strict, `noUncheckedIndexedAccess`, alias `@/*`), скрипты `typecheck` (`tsc --noEmit`), `test` (vitest), `lint`. Проверка: все три команды проходят на пустом проекте.
- [ ] 1.4 Создать структуру каталогов из D1 с файлами-заглушками и `.gitignore` (`node_modules`, `dist`, `scripts/.cache`). Проверка: дерево совпадает с D1.

## 2. Контракты домена

- [ ] 2.1 Перенести `src/domain/types.ts` дословно из D3. Проверка: `npm run typecheck`.
- [ ] 2.2 Реализовать `src/domain/constants.ts` (D4) и `src/domain/districts.ts` (D5). Проверка: тест — у каждого `SpeciesCode`, `DecisionKind`, `SiteConditionCode` есть запись, у каждого района есть зона.
- [ ] 2.3 Реализовать `src/domain/format.ts` (D6) с тестами на все функции. Проверка: `npm test` зелёный.

## 3. Заглушки модулей и фикстура

- [ ] 3.1 `src/engine/defaultNorms.ts` — полная таблица из D8. Проверка: тест — для каждого района из D5 есть норма по всем трём группам; для каждого ТЛУ есть целевые породы.
- [ ] 3.2 `src/engine/index.ts` — заглушка с сигнатурами D7. Проверка: тест — 4 типовые лесосеки дают 4 разных `kind`.
- [ ] 3.3 Фикстура `src/fixtures/` и `src/data/index.ts` (D9) с искусственной задержкой 300 мс и вызовами `onProgress`. Проверка: тест — 300 лесосек, 6 регионов, все полигоны замкнуты, результат детерминирован при повторном вызове.

## 4. Стор и загрузка

- [ ] 4.1 `src/state/store.ts` по D10 со всеми экшенами. Проверка: unit-тесты — `selectSite` с `fly` создаёт `cameraRequest` с новым `id`; `setNorms` пересчитывает `decisions` и `lastDiff`; `pushFeed` ограничивает ленту 50 записями.
- [ ] 4.2 `src/state/selectors.ts` по D11 с мемоизацией. Проверка: тест — фильтр по `kinds` уменьшает `selectKpis().sites`; повторный вызов с теми же входами возвращает ту же ссылку.
- [ ] 4.3 `src/state/bootstrap.ts` по D12. Проверка: тест с моком `loadDataset` — фазы `loading → intro`; при исключении — `error` с текстом.

## 5. Визуальная база

- [ ] 5.1 `src/styles/tokens.css` и `global.css` по `docs/visual-direction.md` и D14; шрифты @fontsource (cyrillic + latin). Проверка: на странице `?ui=1` кириллица отображается шрифтами Unbounded, Exo 2 и JetBrains Mono (DevTools → Computed → font-family).
- [ ] 5.2 UI-примитивы D15 и витрина `?ui=1`. Проверка: на витрине видны все примитивы во всех вариантах; уголки-скобки у Panel; DecisionBadge в четырёх цветах.

## 6. Оболочка

- [ ] 6.1 `App.tsx` со слоями: `MapScene` (плейсхолдер — тёмный фон со звёздами), `Hud`, `Workspace`, `ShellOverlays` (Vignette, DemoBadge). Проверка: при смене `view` в сторе плейсхолдер карты не перемонтируется (лог в `useEffect` срабатывает один раз).
- [ ] 6.2 `LoadingScreen` (фаза loading, шаги и прогресс), `IntroCard` (фаза intro: логотип «ПОДРОСТ», подзаголовок «Система поддержки решений о лесовосстановлении», кнопка «Начать», подсказка «Enter»), `ErrorScreen` (кнопка «Повторить»). Проверка: сценарии из `specs/app-shell/spec.md` воспроизводятся вручную; тест на переход intro → ready по Enter.
- [ ] 6.3 `DemoBadge` в правом нижнем углу над атрибуцией, с тултипом о синтетических данных. Проверка: бейдж виден на всех видах.
- [ ] 6.4 Поддержка `prefers-reduced-motion` в AnimatedNumber и переходах оболочки. Проверка: при эмуляции в DevTools (Rendering → prefers-reduced-motion) числа появляются сразу.

## 7. Документация и деплой

- [ ] 7.1 Workflow `.github/workflows/deploy.yml` по D16, `base` в `vite.config.ts`. Проверка: локально `BASE_PATH=/les-hack/ npm run build && npx vite preview --base /les-hack/` — страница и фикстура грузятся без 404.
- [ ] 7.2 Дополнить README: команды, фактические версии, как запускать витрину `?ui=1`. Проверка: новый участник поднимает проект по README за 5 минут.

## Workflow follow-up

- После мержа в `main` написать в чат команды: «Волна 0 готова, стартуем engine / dataset / map / hud».
- В настройках репозитория включить Pages → Source: GitHub Actions.
- Архивировать change командой `/opsx:archive setup-app-foundation`, когда все потоки волны 1 смержены.
