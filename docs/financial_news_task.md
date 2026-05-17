# Задача: Financial News Intelligence Service

## Цель

Разработать backend-сервис для сбора, фильтрации и ранжирования финансовых и политико-экономических новостей, влияющих на финансовое планирование в России.

Система НЕ должна быть обычным агрегатором новостей.  
Основная задача — выделять только важные события, влияющие на:

- курс рубля
- инфляцию
- ключевую ставку ЦБ
- ипотеку
- банковский сектор
- санкции
- фондовый рынок РФ
- налоги
- цены на нефть

---

# Основные требования

## 1. Источники данных

Подключить RSS/API источники:

### Российские
- РБК
- Интерфакс
- Коммерсантъ
- ТАСС
- Banki.ru
- ЦБ РФ

### Международные
- Reuters Business
- CNBC
- Bloomberg Markets

---

# 2. Архитектура

Сделать abstraction layer для провайдеров новостей.

Пример:

```ts
interface NewsProvider {
  fetchNews(): Promise<Article[]>
}
```

---

# 3. Нормализация данных

Все новости должны приводиться к единому формату.

Пример:

```ts
type Article = {
  id: string
  title: string
  description?: string
  url: string
  source: string
  publishedAt: Date
  category?: string
  tags?: string[]
  score?: number
}
```

---

# 4. Сбор новостей

Реализовать scheduler:

- finance news → каждые 5 минут
- political/economic news → каждые 10–15 минут

---

# 5. Фильтрация новостей

Система должна отсеивать нерелевантные новости.

Игнорировать:
- спорт
- шоу-бизнес
- развлечения
- lifestyle
- general world news без влияния на экономику

---

# 6. Keyword scoring

Добавить систему оценки важности новости по ключевым словам.

## Высокий приоритет

```txt
ключевая ставка
ЦБ
инфляция
санкции
нефть
ОПЕК
ипотека
налоги
девальвация
USD/RUB
Минфин
```

## Средний приоритет

```txt
Сбер
ВТБ
Мосбиржа
дивиденды
облигации
банки
```

---

# 7. Source trust scoring

Добавить веса источников.

Пример:

```txt
Reuters      → 100
РБК           → 90
Интерфакс     → 90
Bloomberg     → 95
Telegram      → 30
```

---

# 8. Ranking formula

Пример:

```ts
score =
  keywordWeight +
  sourceWeight +
  recencyWeight
```

---

# 9. Дедупликация

Не хранить одинаковые новости из разных источников.

Минимум:
- hash(title)

Желательно:
- similarity matching

---

# 10. Категории событий

Добавить event types.

Пример:

```ts
enum EventType {
  RATE_CHANGE,
  INFLATION,
  SANCTIONS,
  TAX_CHANGE,
  OIL,
  BANKING,
  STOCK_MARKET,
  CURRENCY
}
```

---

# 11. API

Реализовать API:

## Получение важных новостей

```http
GET /news/top
```

## Получение по категории

```http
GET /news?category=banking
```

## Получение по тегу

```http
GET /news?tag=inflation
```

---

# 12. Хранение

PostgreSQL.

Минимальные таблицы:

```txt
articles
sources
tags
article_tags
```

---

# 13. Технологии

Рекомендуемый стек:

```txt
Node.js
NestJS
PostgreSQL
Redis
BullMQ
```

---

# 14. MVP

Для первой версии достаточно:

- RSS ingestion
- keyword filtering
- scoring
- deduplication
- REST API
- top important feed

Без AI.

---

# 15. Будущие улучшения

Позже добавить:

- AI summarization
- AI relevance scoring
- sentiment analysis
- market impact prediction
- Telegram digest
- daily summary
- embeddings search
