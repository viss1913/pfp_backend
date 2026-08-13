# Карта переходов Finam Telegram Academy

Экспорт с Immers, исходный `project_id=2` (Finam). Дата экспорта — см. `INDEX.json` → `exported_at`.

## Модель

На каждом сообщении:

1. Берётся текущая стадия сессии (например `/start`).
2. ИИ-классификатор читает `classifier` этой стадии → отвечает **одной** командой.
3. Сессия переключается на эту команду; при смене стадии шлётся `media` (если есть).
4. ИИ-ответчик читает `response` **новой** стадии и пишет пользователю.

## Фактический flow на Immers (as-is)

```
/start
  └─(есть имя + чем занимается)──► /finam_1
                                      └─► /finam_2
                                            └─► /finam_3
                                                  └─► /finam_4  ❌ команды нет — ОБРЫВ

/family_office_1 … /family_office_5 → /platform_1 … /platform_6 → /finam_1
  ▲
  └── сейчас НЕ достижимы с /start (classifier /start прыгает сразу в /finam_1)

/sber_1 → /sber_test → /sber_test_success | /sber_test_failed
  ▲
  └── отдельный блок; не слинкован с /finam_*
```

## Желаемый полный учебный трек (если чините CJM)

```
/start
  → /family_office_1 (webp)
  → /family_office_2 (webp)
  → /family_office_3 (webp)
  → /family_office_4 (webp)
  → /family_office_5 (webp)
  → /platform_1 (webp)
  → /platform_2 (webp)
  → /platform_3 (webp)
  → /platform_4 (webp)
  → /platform_5 (webp)
  → /platform_6
  → /finam_1
  → /finam_2
  → /finam_3
  → /finam_4   ← нужно создать или переписать classifier /finam_3
  → /sber_1 (PDF)
  → /sber_test
  → /sber_test_success | /sber_test_failed
```

Минимальный патч для «полной академии» без новых текстов:

1. В `commands/start/classifier.txt` заменить целевую команду `/finam_1` → `/family_office_1`.
2. Создать `/finam_4` (classifier+response) **или** в `finam_3/classifier.txt` вести на `/sber_1`.
3. В хвосте finam-блока явно вести на `/sber_1`.

## Блоки и медиа

| Блок | Команды | Медиа |
|------|---------|-------|
| Онбординг | `/start` | нет |
| Family Office | `/family_office_1`…`5` | webp ×5 в `commands/*/media/` |
| Platform | `/platform_1`…`6` | webp ×5 (у `_6` нет) |
| Finam продукт | `/finam_1`…`3` | нет |
| Сбер Жизнь | `/sber_1`, `/sber_test`, `_success`, `_failed` | PDF на `/sber_1` |

## Бот (стиль)

См. `bots.json`:

- name: BankFuture Bot  
- base_brain_context: «Ты — AI-помощник BankFuture PFP…»  
- communication_style: «Дружелюбный и понятный финансовый помощник.»  

Telegram token в экспорт **не** входит.
