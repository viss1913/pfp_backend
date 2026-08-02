# Finam Report v2 — HTML templates only

Только вёрстка отчёта Finam Report v2 (HTML/CSS/assets). Без backend JS.

## Структура

- `src/reports/finam_v2/page-*-v2.html` — страницы
- `tokens.css`, `page-wow-shared.css` — стили
- `assets/` — картинки
- `preview-merged.html` — склейка для локального просмотра
- `FINAM_REPORT_V2_ORDER.txt` — порядок страниц

## Локальный просмотр

```bash
cd src/reports/finam_v2
python -m http.server 8766
# открыть http://127.0.0.1:8766/preview-merged.html
```
