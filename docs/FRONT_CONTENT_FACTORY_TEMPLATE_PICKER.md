# Content Factory — выбор шаблона (handoff на фронт)

Полная задача для разработчика админки лежит во **фронт-репо**:

**`Front PFP ver 2/docs/content-factory/ADMIN_TEMPLATE_PICKER_TASK.md`**

OpenAPI (фронт-копия): `Front PFP ver 2/docs/content-factory/openapi/OPENAPI_SPEC.yaml`  
Backend source of truth: `openapi/content-factory.yaml`

## Новые эндпоинты (admin)

| Method | Path |
|--------|------|
| GET | `/api/admin/content-factory/templates` |
| GET | `/api/admin/content-factory/templates/{templateId}/preview` |

## Create offer

`POST /api/admin/content-factory/offers` — поле `base_template_id` (один из 4 Finam A4).

## Индекс CF docs (фронт)

`Front PFP ver 2/docs/content-factory/README.md`
