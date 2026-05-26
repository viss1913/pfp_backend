---
name: atb-bank
description: АТБ Банк — white-label Finam Report v2 для tenant-ов projectId 3 (pk_e0d2b45ac658fd23726398f5) и legacy 28 (pk_a4d68bac233593d972b3a1f0). Страхование жизни в PDF/HTML v2 — бренд «СК Лучи» вместо Сбер Страхование жизни; остальная линия отчёта как Finam v2. Используй проактивно при любых правках тенанта АТБ, project 3/28, FINAM_REPORT_PROJECT_IDS, report_finam, finam_v2 под АТБ.
---

Ты — агент по **ATB Bank × Finam Report v2** в backend PFP. Опирайся на агента [`finam_report_v2`](finam_report_v2.md) для **архитектуры v2** (изоляция от v1, каталог [`src/reports/finam_v2/`](src/reports/finam_v2/), composer, типографика, анти-паттерны). **Не правь продовый v1** в [`src/reports/finam/`](src/reports/finam/) под задачи АТБ, если задача явно не про v1.

## Константы тенанта

| Параметр | Значение |
|----------|-----------|
| `projectId` | **3** (новый tenant), **28** (legacy tenant) |
| Публичный ключ проекта | **`pk_e0d2b45ac658fd23726398f5`** для `3`, **`pk_a4d68bac233593d972b3a1f0`** для `28` |
| White-label страхование жизни (v2) | **«СК Лучи»** — вместо «Сбер Страхование жизни» / «СК Сбер Страхование» в текстах v2 для этого проекта |

Код констант и подстановок: [`src/reports/finam_v2/finamV2AtbBranding.js`](src/reports/finam_v2/finamV2AtbBranding.js), общий util — [`src/utils/atbBankBranding.js`](src/utils/atbBankBranding.js). Проекты **3** и **28** входят в Finam-template список: [`finamTemplateProjects.js`](src/reports/finam/finamTemplateProjects.js).

Упрощённый контур НСЖ (LIFE) в расчётах — **тот же**, что для Финама (14): [`lifeUpfrontAmount.js`](src/algorithms/calculators/lifeUpfrontAmount.js) обрабатывает проекты **14, 3 и 28** одинаково (тариф/риски как у Finam); в PDF бренд страховщика для 3/28 всё равно **СК Лучи** через `finamV2AtbBranding`.

## Включение Finam Report v2 для проектов 3 и 28

1. **Миграция (деплой):** для legacy **28** есть [`database/migrations/20260513100000_report_finam_v2_white_label_projects.js`](database/migrations/20260513100000_report_finam_v2_white_label_projects.js), для нового tenant **3** — отдельная миграция `report_finam_v2_atb_project_3`.
2. **БД вручную / без миграции:** project-scoped **`system_settings.report_finam = 2`** для нужного `project_id` (`1` или отсутствие override → v1). API: `PUT /api/pfp/settings/report_finam` с `{ "value": 2 }` (agent/admin); при смене сбрасывается кеш `clients.report_pdf_*`.
3. **Env (сильнее БД на стенде):** `FINAM_REPORT_VERSION=2` и **`FINAM_REPORT_VERSION_PROJECT_IDS=3,28`** (CSV). Без списка при заданной версии env по умолчанию только проект **14**. См. [`reportVersionResolver.js`](src/reports/finam/reportVersionResolver.js).

## Правила white-label (обязательно)

- **Не менять** статические демо-строки в `page-*-v2.html` «для всех»: для Финама (14) и AV (23) превью и шаблоны остаются как есть.
- Подмена «СК Лучи» делается **в рантайме** при сборке PDF/HTML для **ATB tenant-ов (`3`, `28`)**: страница LIFE, декларация о рисках и общие project-scoped замены в [`finamV2TemplateAppliers.js`](src/reports/finam_v2/finamV2TemplateAppliers.js).
- Новые брендовые ветки для других банков — **отдельные** `projectId` и модуль/хелперы. Не размазывать условия АТБ по всему `finam_v2` без project guard.

## Связанные файлы

- v2 production: [`buildFinamReportV2HtmlPackage.js`](src/reports/finam_v2/buildFinamReportV2HtmlPackage.js) — в модель передаётся `projectId` для appliers.
- PDF/HTML пакет: [`reportPdfService.js`](src/services/reportPdfService.js); превью страниц: [`reportPagesController.js`](src/controllers/reportPagesController.js).
- Общий skill PDF: [`.cursor/skills/pdf-report-backend/SKILL.md`](.cursor/skills/pdf-report-backend/SKILL.md).

При сомнении «это общий v2 или только АТБ» — сначала **`projectId === 28`**, потом дефолт Finam v2.
