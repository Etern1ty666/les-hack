# ПОДРОСТ — командный центр лесовосстановления

Прототип для хакатона Рослесхоза, **Трек №4, задача 3**: «Поддержка принятия решений о необходимости проведения мероприятий по лесовосстановлению».

По данным о подросте (таксационное описание лесосеки и заключительный осмотр) система решает:
- нужно ли лесовосстановление и каким способом: **естественное / комбинированное / искусственное**;
- почему: трассировка правил со ссылками на НПА;
- что делать: состав культур, густота, посадочный материал, обработка почвы, уходы, объём сеянцев, стоимость.

Интерфейс — 3D-глобус в стиле стратегии с видом сверху. Вся Россия покрыта лесосеками, зоны подсвечены по решению, HUD как в RTS.

> **Главное демо — оперативный центр на реальной карте** (папка [`ops/`](ops/)): https://etern1ty666.github.io/les-hack/
> Любая точка России → за ~1–2 с собирается низкополигональная диорама района 12×8 км из реальных данных: рельеф (AWS Terrain Tiles), леса, реки, дороги и постройки (OpenStreetMap), лесистость и вырубки 2001–2024 по годам (Hansen GFC). Свежие рубки становятся лесосеками: бригады едут по реальным дорогам, ИИ даёт рекомендацию, оператор утверждает решение. Любая точка: `?lon=45.15&lat=57.42`.
> Запуск: `npm ci --prefix ops && npm run dev --prefix ops`.
>
> Игра «Лесничий» (стиль This Is the Police): https://etern1ty666.github.io/les-hack/game/ · первая версия (глобус): https://etern1ty666.github.io/les-hack/v0/

## Запуск

```bash
npm ci
```

```bash
npm run dev
```

| Команда | Что делает |
|---|---|
| `npm run dev` | дев-сервер Vite (http://localhost:5173) |
| `npm run typecheck` | проверка типов (`tsc -b`) |
| `npm test` | тесты vitest (`npm test -- --run` — один прогон) |
| `npm run lint` | oxlint (линтер из шаблона create-vite) |
| `npm run build` | прод-сборка в `dist/` |

Витрина UI-примитивов — `?ui=1` (например, http://localhost:5173/?ui=1).

## Документы

| Файл | О чём |
|---|---|
| [docs/team-brief.md](docs/team-brief.md) | **Начните здесь:** бриф для команды — кто что берёт, как стартовать, грабли |
| [docs/task.md](docs/task.md) | Постановка задачи и как мы её понимаем |
| [docs/domain-glossary.md](docs/domain-glossary.md) | Глоссарий: подрост, ТЛУ, встречаемость, нормативы… |
| [docs/visual-direction.md](docs/visual-direction.md) | Визуальный стиль: палитра, шрифты, раскладка, анимации |
| [docs/demo-script.md](docs/demo-script.md) | Сценарий демо для жюри: что обязано работать |
| [AGENTS.md](AGENTS.md) | Правила для ИИ-ассистентов (Claude Code, Cursor, Codex) |
| [openspec/](openspec/) | Спецификации и планы реализации |

## Что такое «спека» и OpenSpec

**Спецификация (spec)** — описание того, **что** должна делать система, а не как она устроена в коде. Она состоит из требований («система SHALL…») и сценариев проверки («WHEN … THEN …»). ИИ-ассистент реализует фичу по спеке. Человек проверяет результат по сценариям.

[OpenSpec](https://github.com/Fission-AI/OpenSpec) — фреймворк для такой разработки. Каждая фича — это **change** (папка в `openspec/changes/<имя>/`):

- `proposal.md` — зачем и что меняем;
- `specs/<capability>/spec.md` — требования и сценарии;
- `design.md` — как делаем: архитектура, контракты, решения;
- `tasks.md` — пошаговый план с чекбоксами. Это и есть «план перед реализацией».

После мержа change архивируется. Его спеки переезжают в `openspec/specs/` и становятся «источником правды» о системе.

## Как работать (для команды)

### 1. Установить один раз

```bash
npm install -g @fission-ai/openspec@1.14.3
```

```bash
git clone https://github.com/Etern1ty666/les-hack.git
```

Команды OpenSpec для ИИ-ассистентов уже лежат в репозитории (`.claude/`, `.cursor/`, `.agents/`). После клонирования перезапустите IDE или ассистента.

### 2. Взять свой change и запустить реализацию

| Ассистент | Команда |
|---|---|
| Claude Code | `/opsx:apply <change>` |
| Cursor | `/opsx-apply <change>` |
| Codex | `$openspec-apply-change <change>` |
| Другие | попросить: «Реализуй OpenSpec change `<change>`: прочитай AGENTS.md, затем выполни `openspec instructions apply --change <change>` и иди по tasks.md» |

Ассистент читает proposal, specs, design и tasks, выполняет задачи по порядку и отмечает чекбоксы. Если что-то неясно, он остановится и спросит.

### 3. Порядок и параллельность

| Волна | Change | Что делает | Папки | Зависит от | Кто |
|---|---|---|---|---|---|
| **0** | `setup-app-foundation` | Каркас, контракты, стор, токены, UI-примитивы, фикстура, деплой | конфиги, `src/domain`, `src/state`, `src/ui`, `src/shell` | — | |
| **1** | `add-reforestation-decision-engine` | Движок решений + технологическая карта + прогноз | `src/engine` | волна 0 | |
| **1** | `add-forest-dataset` | 60 000 лесосек по 44 субъектам | `scripts`, `public/data`, `src/data` | волна 0 | |
| **1** | `add-strategic-map` | 3D-глобус, гексы, режимы, RTS-камера, миникарта | `src/map` | волна 0 | |
| **1** | `add-command-hud` | Полоса ресурсов, фильтры, карточка, «Что если?», журнал | `src/hud` | волна 0 | |
| **2** | `add-analytics-workspace` | Аналитика, редактор нормативов, импорт и экспорт, печатная форма | `src/workspace` | волна 1 (engine, hud) | |
| **2** | `add-cutting-site-3d` | 3D-лесосека: подрост, площадки, план посадки | `src/map/site3d` | волна 1 (map, dataset) | |

- **Волна 0** — делает один человек (≈ 1 час), остальные пока читают свои change и docs.
- **Волна 1** — 4 человека параллельно, каждый в своей папке. Контракты общие, поэтому конфликтов нет.
- **Волна 2** — после мержа нужных потоков волны 1.

Впишите себя в колонку «Кто».

### 4. Git

- Ветка: `feat/<change-name>`. PR в `main` с GIF или скриншотом, если задача визуальная.
- Перед PR: `npm run typecheck && npm test`.
- Чужие папки не трогать. Если нужно изменить контракт (`src/domain/types.ts`, стор), сделайте отдельный маленький PR и напишите в чат.
- После мержа: `/opsx:archive <change>` (или `openspec archive <change>`).

Проверить, что спеки корректны:

```bash
openspec validate --all --strict
```

## Стек

Vite + React 19 + TypeScript, MapLibre GL (globe) + deck.gl 9.4 + H3, zustand, motion, vitest. Деплой — GitHub Pages. Бэкенда нет, ключей и секретов нет.

Фактические версии (волна 0, октябрь 2026): node 24 (CI — 22), vite 8.3, react 19.3, typescript 6.0 (из шаблона create-vite), maplibre-gl 5.24 (6.x несовместим с deck.gl 9.4 — см. спайк в `openspec/changes/add-strategic-map/design.md`), react-map-gl 8.1, deck.gl 9.4.0, luma.gl 9.4.2, h3-js 4.5, zustand 5.0, motion 14.6, vitest 5.0, oxlint 1.88.

Структура `src/`: `domain` (контракты, справочники, форматирование), `state` (стор, селекторы, загрузка), `engine` (движок; сейчас заглушка), `data` (загрузка данных; сейчас фикстура), `fixtures`, `shell` (оболочка), `ui` (примитивы), `styles` (токены), `map` / `hud` / `workspace` (плейсхолдеры потоков волн 1–2).

## Источники данных

- Подложка: Sentinel-2 cloudless 2024 © EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2024), CC BY-NC-SA 4.0.
- Подписи и шрифты: © OpenMapTiles © OpenStreetMap contributors (OpenFreeMap).
- Рельеф: Terrain Tiles (Mapzen / AWS Open Data).
- Границы субъектов: Natural Earth (public domain).
- Слой потери леса (опционально): Hansen/UMD/Google/USGS/NASA, Global Forest Change v1.12, CC BY 4.0.

**Лесосеки синтетические** (демо-данные), нормативы демонстрационные. Перед защитой их нужно сверить с НПА (см. [docs/task.md](docs/task.md)).
