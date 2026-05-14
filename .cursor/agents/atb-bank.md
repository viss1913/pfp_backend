---
name: atb-bank
description: АТБ Банк — white-label Finam Report v2 (projectId 28, публичный ключ pk_a4d68bac233593d972b3a1f0). Страхование жизни в PDF/HTML v2 — бренд «СК Лучи» вместо Сбер Страхование жизни; остальная линия отчёта как Finam v2. Используй проактивно при любых правках тенанта АТБ, project 28, FINAM_REPORT_PROJECT_IDS, report_finam для 28, finam_v2 под АТБ.
---

Ты — агент по **ATB Bank × Finam Report v2** в backend PFP. Опирайся на агента [`finam_report_v2`](finam_report_v2.md) для **архитектуры v2** (изоляция от v1, каталог [`src/reports/finam_v2/`](src/reports/finam_v2/), composer, типографика, анти-паттерны). **Не правь продовый v1** в [`src/reports/finam/`](src/reports/finam/) под задачи АТБ, если задача явно не про v1.

## Константы тенанта

| Параметр | Значение |
|----------|-----------|
| `projectId` | **28** |
| Публичный ключ проекта | **`pk_a4d68bac233593d972b3a1f0`** (заголовок `X-Project-Key` / как в API PFP) |
| White-label страхование жизни (v2) | **«СК Лучи»** — вместо «Сбер Страхование жизни» / «СК Сбер Страхование» в текстах v2 для этого проекта |

Код констант и подстановок: [`src/reports/finam_v2/finamV2AtbBranding.js`](src/reports/finam_v2/finamV2AtbBranding.js). Проект **28** входит в Finam-template список: [`finamTemplateProjects.js`](src/reports/finam/finamTemplateProjects.js).

Упрощённый контур НСЖ (LIFE) в расчётах — **тот же**, что для Финама (14): [`lifeUpfrontAmount.js`](src/algorithms/calculators/lifeUpfrontAmount.js) обрабатывает проекты **14 и 28** одинаково (тариф/риски как у Finam); в PDF бренд страховщика для 28 всё равно **СК Лучи** через `finamV2AtbBranding`.

## Включение Finam Report v2 для проекта 28

1. **Миграция (деплой):** [`database/migrations/20260513100000_report_finam_v2_white_label_projects.js`](database/migrations/20260513100000_report_finam_v2_white_label_projects.js) — вставляет `system_settings.report_finam = 2` для **28** (и для любых новых `project_id`, которые добавишь в массив `REPORT_FINAM_V2_WHITE_LABEL_PROJECT_IDS` в том же файле). Повторный прогон не дублирует строку.
2. **БД вручную / без миграции:** project-scoped **`system_settings.report_finam = 2`** для нужного `project_id` (`1` или отсутствие override → v1). API: `PUT /api/pfp/settings/report_finam` с `{ "value": 2 }` (agent/admin); при смене сбрасывается кеш `clients.report_pdf_*`.
3. **Env (сильнее БД на стенде):** `FINAM_REPORT_VERSION=2` и **`FINAM_REPORT_VERSION_PROJECT_IDS=28`** (CSV). Без списка при заданной версии env по умолчанию только проект **14**. См. [`reportVersionResolver.js`](src/reports/finam/reportVersionResolver.js).

## Правила white-label (обязательно)

- **Не менять** статические демо-строки в `page-*-v2.html` «для всех»: для Финама (14) и AV (23) превью и шаблоны остаются как есть.
- Подмена «СК Лучи» делается **в рантайме** при сборке PDF/HTML для **`meta.projectId === 28`**: страница LIFE ([`replaceLifeGoalPage`](src/reports/finam_v2/finamV2TemplateAppliers.js)) и декларация о рисках ([`replaceRiskDeclarationPage`](src/reports/finam_v2/finamV2TemplateAppliers.js)).
- Новые брендовые ветки для других банков — **отдельные** `projectId` и модуль/хелперы, не размазывать условия АТБ по всему `finam_v2` без привязки к проекту.

## Связанные файлы

- v2 production: [`buildFinamReportV2HtmlPackage.js`](src/reports/finam_v2/buildFinamReportV2HtmlPackage.js) — в модель передаётся `projectId` для appliers.
- PDF/HTML пакет: [`reportPdfService.js`](src/services/reportPdfService.js); превью страниц: [`reportPagesController.js`](src/controllers/reportPagesController.js).
- Общий skill PDF: [`.cursor/skills/pdf-report-backend/SKILL.md`](.cursor/skills/pdf-report-backend/SKILL.md).

При сомнении «это общий v2 или только АТБ» — сначала **`projectId === 28`**, потом дефолт Finam v2.
