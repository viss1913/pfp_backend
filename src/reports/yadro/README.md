# YADRO report HTML

PDF-отчёт для проектов **YADRO ПДС** (вёрстка с [VadikDmit/Yadro_report](https://github.com/VadikDmit/Yadro_report)).

## Включение

Как Rostech (`projectId === 22`), без env. Тема `yadro`, если у проекта:

- `slug === 'yadro'`, или
- `name === 'Yadro'`, или
- `public_key === 'pk_2a19a53a1c58b4756817f35b'`

Константы: `yadroTemplateProjects.js`.

## Как собирается

1. `resolveReportThemeKey(projectId)` → `yadro`
2. `reportPdfService.generateClientReportHtmlPackage` → `buildYadroReportHtmlPackage`
3. Обложка `cover.html` + страницы целей + общий хвост `tail-01…tail-12`

### Маппинг goal_type → шаблоны

| goal_type / имя | kind | HTML |
|---|---|---|
| PENSION | pension | pension-01…03 |
| PASSIVE_INCOME, RENT | passive | passive-01…02 |
| INVESTMENT, FIN_RESERVE, LIFE | capital | capital-01…02 |
| OTHER + «квартир…» | flat | flat-01…02 |
| OTHER + «дет…/образован…» | child | child-01…02 |
| прочий OTHER / INHERITANCE | moon | moon-01…02 |

## Файлы

- `html/` — шаблоны и `shell.css` + `html/assets/`
- `yadroTemplateLoader.js` — inline CSS/assets, `{{placeholders}}`
- `yadroDataMapper.js` — данные из `goals_detailed` / schedule
- `buildYadroReportHtml.js` — пакет страниц

Smoke: `node scripts/smoke_yadro_report.js`

## Источник вёрстки

Клон: `tmp/Yadro_report` (можно удалить). Оригинал: github.com/VadikDmit/Yadro_report.
