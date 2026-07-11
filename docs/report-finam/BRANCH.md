# Ветка `report-finam` — HTML/PDF отчёт Финам

Отдельная линия git для вёрстки и шаблонов Finam Report (v1/v2), без смешивания с общим бэкендом на `finam`.

## Зачем

- Правки HTML/CSS/превью — в `report-finam`
- Ревью и «пускаем / не пускаем» — вы (human-in-the-loop)
- После approve — merge в `finam` → деплой на Immers / prod

Бэкенд (`controllers`, `services`, миграции, AI) по умолчанию остаётся на `finam`.

## Что менять в этой ветке

| Путь | Содержимое |
|------|------------|
| `src/reports/finam/` | Finam Report v1 (legacy prod) |
| `src/reports/finam_v2/` | Finam Report v2 — `page-*-v2.html`, appliers, composer |
| `src/reports/finam_v2/assets/` | Картинки, webp |
| `src/reports/finam_old/` | Референсы дизайнера (по необходимости) |
| `test/finamV2*.test.js` | Тесты страниц v2 |
| `test/finam*.test.js` | Прочие тесты отчёта |

Связанный glue (если без него не собрать превью): `src/services/reportPdfService.js`, `src/controllers/reportController.js`, `src/controllers/reportPagesController.js` — **только если** правка шаблона требует изменения подстановок.

## Что не трогать без явной нужды

- Auth, CRM, constructor, macro, другие тенанты (Sber, ATB, Rostech)
- `main` — не мержить напрямую

## Workflow

```text
report-finam  →  PR/merge  →  finam  →  deploy (Immers)
     ↑
  агент/ИИ + превью HTML (в будущем — draft в БД)
```

1. Ветка от `finam`: `git checkout report-finam && git merge finam` (подтянуть бэк)
2. Правки HTML, локальный smoke / `GET .../reports/:id/html`
3. PR `report-finam` → `finam` или merge после вашего OK
4. Деплой только с `finam` (как сейчас)

## Проверка перед merge

См. `.cursor/rules/finam-report-prod-parity.mdc`:

1. Финальный HTML-пакет `/api/pfp/reports/:clientId/html`
2. Страницы `page-XX.html`
3. PDF для того же клиента

## Создание ветки (если клонируете на новой машине)

```bash
git fetch origin
git checkout -b report-finam origin/report-finam
```

Базовая ветка разработки бэка: **`finam`**.
