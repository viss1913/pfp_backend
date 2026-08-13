# Промпт для ИИ-программиста: развернуть Finam Telegram Academy CJM

Скопируй блок ниже целиком в чат другому ИИ-агенту вместе с папкой `finam_education/`.

---

## Задача

Развернуть в своём окружении PFP (или совместимом конструкторе) обучающий Telegram-сценарий **Finam Family Office Academy**: набор команд CJM с **двумя контекстами на каждую команду** (`classifier` + `response`) и медиафайлами (картинки/PDF), которые отправляются при входе на стадию.

Источник правды — содержимое этой папки `finam_education/`. Не выдумывай тексты контекстов: бери только из файлов.

## Контекст системы (как устроено у нас)

Двухшаговый ИИ на каждое сообщение пользователя:

1. **Классификатор** (`classifier.txt`) — по истории и текущей стадии возвращает **только** ключ следующей команды (`/start`, `/family_office_2`, …).
2. **Ответчик** (`response.txt`) — генерирует текст ответа на выбранной стадии.

Дополнительно на боте:

- `base_brain_context` — кто бот;
- `communication_style` — как говорит.

Слои промпта ответчика: base_brain → style → response команды → user_context → история.

Медиа команды (`media[]`) уходят в Telegram **при смене стадии** (photo / document).

В PFP это таблицы `constructor_commands` (поля `command`, `classifier`, `response`, `section`, `media`, `is_template`, `project_id`) и `constructor_bots`. API (если есть наш backend):

- `GET/POST /api/pfp/constructor/commands`
- `PUT /api/pfp/constructor/commands/{id}` — обновить `classifier` / `response`
- `POST /api/pfp/constructor/commands/{id}/media` — multipart `file` (webp/png/jpg/pdf…)
- Заголовок проекта: `x-project-key` (у исходного Immers Finam: см. `project.json`)

Спека: `docs/api/agent_lk.yaml` (тег «Конструктор ИИ»). Модель данных: `AI constructor/AGENT_SYSTEM_SPECIFICATION.md`.

## Важно про project id

На Immers исходный tenant называется **Finam**, `project_id = 2` (`pk_7f1ccfe5b2598134a575320d`).  
**Не путать с project_id 6** — там ROSTECH (другой продукт).  
В своём окружении создай/используй **свой** project_id; число `2` из экспорта — только метаданные источника.

## Что лежит в папке

```
finam_education/
  PROMPT.md          ← этот файл
  README.md          ← каталог команд
  FLOW.md            ← карта переходов и известные дыры CJM
  INDEX.json         ← машинный индекс
  MEDIA.json         ← список медиа + исходные R2 URL
  project.json       ← метаданные исходного проекта
  bots.json          ← base_brain_context + communication_style (без токена)
  commands/
    <slug>/
      classifier.txt   # 1-й ИИ
      response.txt     # 2-й ИИ
      meta.json        # id, section, media meta
      media/           # локальные файлы (если есть)
        <slug>.webp | <slug>.pdf
  media_files/         # те же файлы плоским списком
```

**19 команд.** У каждой всегда два текстовых контекста. Медиа есть у:  
`family_office_1…5`, `platform_1…5`, `sber_1` (PDF). Остальные — без картинок.

## Порядок работ

1. Прочитай `FLOW.md` и `README.md`.
2. Создай/выбери project + Telegram-бота в конструкторе.
3. Пропиши на боте из `bots.json`:
   - `base_brain_context`
   - `communication_style`
4. Для **каждой** папки в `commands/` создай шаблонную команду (`is_template: true`):
   - `command` = `/` + имя папки (например `family_office_1` → `/family_office_1`)
   - `classifier` = содержимое `classifier.txt` **как есть**
   - `response` = содержимое `response.txt` **как есть**
   - `section` = из `meta.json` (у `/start` — «Обучение»)
5. Для команд с `media/`: загрузи файл через API media upload (или UI конструктора). Сохраняй порядок `sort` из `MEDIA.json` / `meta.json`.
6. Привяжи webhook Telegram к боту, проверь `/start`.
7. Пройди сценарий по `FLOW.md` и зафиксируй, что чинишь (см. дыры ниже) — **не молча ломай исходные тексты**, если задача = 1:1 копия; если задача = рабочий CJM — почини переходы явно.

## Известные дыры исходного Immers-сценария (на момент экспорта)

1. `/start` classifier ведёт сразу в `/finam_1`, минуя блок Family Office + Platform (хотя эти команды и картинки есть).
2. `/finam_3` classifier требует `/finam_4`, но команды `/finam_4` в БД **нет** — обрыв.
3. Блок `/sber_*` не связан classifier’ами с `/finam_*`.

Желаемая «полная академия» (если чините flow):

`/start` → `/family_office_1`…`/family_office_5` → `/platform_1`…`/platform_6` → `/finam_1`… → `/sber_1` → `/sber_test` → success/failed

## Критерии готовности

- [ ] Все 19 команд созданы с полными `classifier` + `response` из файлов
- [ ] 10 webp + 1 PDF загружены на нужные стадии
- [ ] Бот отвечает на `/start` и меняет стадии по classifier
- [ ] При переходе на стадии с медиа в Telegram уходит картинка/PDF
- [ ] Решение по дырам flow задокументировано (оставили as-is или починили)

## Чего не делать

- Не подставлять чужие project_id / telegram token из продакшена.
- Не сокращать и не «улучшать» тексты контекстов без явной задачи.
- Не путать этот пакет с PDF-отчётом Finam (`src/reports/finam*`) — это другой контур.
- Не смешивать с Rostech site-chat / B2C `chat_AI`.

## Быстрый чеклист API (PFP)

```http
# список шаблонов
GET /api/pfp/constructor/commands?is_template=true
x-project-key: <your_pk>

# создать команду (тело уточни по OpenAPI ConstructorCommandCreate)
POST /api/pfp/constructor/commands
{ "command": "/family_office_1", "classifier": "...", "response": "...", "is_template": true, "section": null }

# залить картинку
POST /api/pfp/constructor/commands/{id}/media
Content-Type: multipart/form-data; file=<family_office_1.webp>
```

Начни с чтения `FLOW.md`, затем импортируй команды пачками: start → family_office_* → platform_* → finam_* → sber_*.
