# Finam Telegram AI — пакет для переноса (Education CJM)

Готовый набор контекстов и картинок обучающего Telegram-бота Finam (Immers).

> **Важно:** на Immers Finam = **project_id 2** (`pk_7f1ccfe5b2598134a575320d`).  
> Immers **project_id 6 = ROSTECH**, не этот пакет.  
> Пользователь мог сказать «проект 6» по ошибке / по другой нумерации — ориентируйтесь на имя **Finam** и содержимое папки.

## С чего начать другому ИИ

Открой и выполни **[PROMPT.md](./PROMPT.md)** — там полный бриф для программиста/агента.  
Карта переходов: **[FLOW.md](./FLOW.md)**.

## Содержимое

| Путь | Назначение |
|------|------------|
| `commands/<slug>/classifier.txt` | Контекст 1-го ИИ (роутер стадий) |
| `commands/<slug>/response.txt` | Контекст 2-го ИИ (генератор ответа) |
| `commands/<slug>/meta.json` | Метаданные команды + media meta |
| `commands/<slug>/media/*` | Локальные файлы медиа (если есть) |
| `media_files/` | Те же медиа плоским списком |
| `INDEX.json` / `MEDIA.json` | Машинные индексы |
| `bots.json` / `project.json` | Бот и проект источника (без секретов) |

## Каталог команд (19)

| command | media | classifier | response |
|---------|------:|------------|----------|
| `/start` | — | `commands/start/classifier.txt` | `commands/start/response.txt` |
| `/family_office_1` | webp | `…/family_office_1/…` | `…` |
| `/family_office_2` | webp | | |
| `/family_office_3` | webp | | |
| `/family_office_4` | webp | | |
| `/family_office_5` | webp | | |
| `/platform_1` | webp | | |
| `/platform_2` | webp | | |
| `/platform_3` | webp | | |
| `/platform_4` | webp | | |
| `/platform_5` | webp | | |
| `/platform_6` | — | | |
| `/finam_1` | — | | |
| `/finam_2` | — | | |
| `/finam_3` | — | | |
| `/sber_1` | pdf | | |
| `/sber_test` | — | | |
| `/sber_test_success` | — | | |
| `/sber_test_failed` | — | | |

Медиа также продублированы в `media_files/` и описаны в `MEDIA.json` (с исходными R2 URL на случай повторной загрузки).

## Источник

Выгрузка из Immers MySQL `constructor_commands` + скачивание R2 `pub-9adf61576a644710a2a19541d1713e9e.r2.dev`.  
Код рантайма в репо PFP: `src/services/constructorAiService.js`, `constructorBotService`, upload — `POST .../commands/:id/media`.
