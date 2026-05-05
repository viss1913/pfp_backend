# Архитектура проекта "Max Bot / PFP Backend"

## Общее описание
Платформа представляет собой backend-инфраструктуру для персонального финансового планирования (PFP) и управления ботами-ассистентами. Разработана на базе **Node.js** с использованием легковесных HTTP-фреймворков и предназначена для расчетов инвестиционных, пенсионных, страховых и иных финансовых целей.

## Схемы системы

Ниже — упрощённые представления: кто с кем говорит снаружи и как устроены слои внутри одного процесса backend.

### Контекст: клиенты, backend, БД, LLM и внешний мир

```mermaid
flowchart LR
  subgraph clients["Клиенты"]
    FE["Frontend / ЛК"]
    partner["Партнёрские аппы"]
    bots["Max и др. боты"]
  end

  subgraph be["Backend PFP Node.js / Express"]
    API["REST + Swagger"]
    MW["Middleware JWT project_id"]
    SVC["Сервисы и оркестраторы"]
  end

  subgraph datalayer["Данные и файлы"]
    DB[("Реляционная БД MySQL Knex")]
    R2["Cloudflare R2 объекты PDF обложки"]
  end

  subgraph ext["Внешние API"]
    LLM["Языковая модель OpenRouter или SiliconFlow"]
    macro["Макро и рынок Росстат MOEX ЦБ и др."]
    mail["Транзакционная почта Resend и др."]
    crm["CRM и партнёрские шлюзы по задаче"]
  end

  clients --> API
  API --> MW
  MW --> SVC
  SVC --> DB
  SVC --> R2
  SVC --> LLM
  SVC --> macro
  SVC --> mail
  SVC --> crm
```

**Как читать.** Пользователь или интеграция бьёт в **HTTP API** backend. Там же проверяется доступ (**JWT**, при необходимости изоляция по **`project_id`**). Дальше идут **сервисы**: они читают и пишут **БД**, кладут тяжёлые файлы в **R2**, по сценарию дергают **провайдера LLM** (чат, конструктор, CRM-подсказки), **макро/рынок**, **почту** и прочие интеграции. Языковая модель **не** сидит внутри репозитория — это отдельный облачный API; backend только формирует запрос и обрабатывает ответ.

### Внутри backend: слои от HTTP до алгоритмов

```mermaid
flowchart TB
  subgraph transport["Транспорт"]
    R["Маршруты Express"]
    C["Controllers"]
    M["Middlewares auth CORS лимиты"]
  end

  subgraph services["Сервисный слой"]
    calc["calculationService и др."]
    client["clientService goals assets"]
    ai["aiService aiAssistantService maxBotService"]
    rep["Отчёты PDF HTML Puppeteer при генерации"]
    other["auth macro email cron конструктор"]
  end

  subgraph algorithms["Ядро без HTTP"]
    calcs["src/algorithms calculators"]
    recalc["recalculators агрегаторы"]
    tax["TaxService"]
  end

  R --> M
  M --> C
  C --> calc
  C --> client
  C --> ai
  C --> rep
  C --> other
  calc --> calcs
  calc --> recalc
  calc --> tax
  client --> calcs
```

**Как читать.** **Контроллеры** — тонкий слой: валидация, коды ответов, вызов сервиса. **Сервисы** держат сценарии и работу с БД. **Алгоритмы** — чистая логика расчётов; их вызывают сервисы, подставляя уже подготовленный контекст (так проще тестировать и не смешивать HTTP с математикой). Генерация отчётов может поднимать **Puppeteer** в том же процессе — на схеме это отражено как часть сервисного контура отчётов.

### Стек технологий (блоками)

Схема как на слайде: **пять колонок слева направо**. Внутри колонки — стек сверху вниз; **стрелок между колонками нет** (это не pipeline запроса, а группы зависимостей из `package.json`).

```mermaid
flowchart LR
  subgraph C1["Рантайм"]
    direction TB
    c1a["Node.js 18+"]
    c1b["JavaScript CommonJS"]
    c1c["npm"]
    c1d["dotenv"]
  end

  subgraph C2["HTTP и контракт"]
    direction TB
    c2a["Express 5"]
    c2b["Swagger UI"]
    c2c["Helmet · CORS"]
    c2d["Multer"]
    c2e["Joi"]
    c2f["JWT · bcrypt"]
    c2g["Winston"]
  end

  subgraph C3["Данные и файлы"]
    direction TB
    c3a["MySQL · mysql2"]
    c3b["Knex миграции"]
    c3c["@aws-sdk S3 API"]
    c3d["Cloudflare R2"]
    c3e["Sharp"]
  end

  subgraph C4["Отчёты и документы"]
    direction TB
    c4a["Puppeteer → PDF"]
    c4b["PDFKit"]
    c4c["docx · mammoth · xlsx"]
  end

  subgraph C5["Внешний мир и фон"]
    direction TB
    c5a["axios"]
    c5b["OpenRouter / SiliconFlow"]
    c5c["Resend"]
    c5d["node-cron"]
    c5e["node-telegram-bot-api"]
  end
```

| Колонка | Технологии |
|---------|------------|
| Рантайм | Node.js ≥18, CommonJS, npm, dotenv |
| HTTP и контракт | Express 5, Swagger UI, Helmet, CORS, Multer, Joi, JWT, bcrypt, Winston |
| Данные и файлы | MySQL, `mysql2`, Knex, `@aws-sdk/client-s3`, R2, Sharp |
| Отчёты и документы | Puppeteer, PDFKit, docx / mammoth / xlsx |
| Внешний мир и фон | axios, LLM (OpenRouter/SiliconFlow), Resend, `node-cron`, Telegram API |

## Основные компоненты системы

### 1. Ядро расчетов (Algorithms)
Вся математика вынесена в изолированный слой `src/algorithms/`. Это гарантирует независимость бизнес-логики от транспортного слоя.
- **Модели калькуляторов (`calculators/`)**: `PensionCalculator`, `LifeInsuranceCalculator`, `InvestmentCalculator`, `RentCalculator` и др.
- **Перерасчеты (`recalculators/`)**: Механизмы актуализации целей при изменении вводных параметров.
- **Агрегаторы (`PortfolioAggregator`)**: Сервис сводки доходностей, налогов и консолидированного формирования портфеля.
- **Налоговая машина (`TaxService`)**: Изолированный сервис для расчетов НДФЛ, налоговых вычетов (ПДС, ИИС) и прогрессивной шкалы налогообложения.

### 2. Сервисный слой (Services)
Отвечает за бизнес-сценарии:
- `clientService` — Управление жизненным циклом клиента (создание, обновление профиля, работа с активами).
- `calculationService` — Оркестратор, вызывающий нужные алгоритмы из папки `algorithms` для расчета "First Run" и построения финансового плана.
- `aiService`, `aiAssistantService`, `maxBotService` — Интеграции с LLM и управление ботами.
- `authService` — Авторизация пользователей, JWT-токены, безопасность.

### 3. Интеграции и Контроллеры
- **REST API (`src/controllers/`)**: Маршрутизация запросов от frontend/аппов.
- **База Данных**: Реляционная БД **MySQL** через `knex.js` (в облаке чаще всего Railway MySQL). Схема включает клиентов (`clients`), цели (`goals`), активы, истории расчетов и профили рисков.
- **External API**: Интеграция с Росстатом (`rosstatService`), почтой (`emailService`), CRM и внешними ботами.

## Безопасность (Security)
1. **Авторизация**: Для подавляющего большинства эндпоинтов используется строгая авторизация с проверкой JWT-барьер-токена (Middleware).
2. **Изоляция данных**: Реализована поддержка "Проектов" (`project_id`). Данные разных банков/агентов физически не пересекаются на уровне запросов к БД.
3. **Защита алгоритмов**: Алгоритмы не контактируют напрямую с БД, вся информация подается им через контекст, что позволяет изолированно их покрывать тестами.

## Развертывание
- Платформа готова к контейнеризации. Сборка Docker-образа (`Dockerfile`) происходит за минуты.
- Нативно поддерживается деплой в облачные PaaS-платформы (например, Railway, конфигурация `railway.json`).
