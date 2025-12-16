# 📋 Как проверить логи на Railway

## ✅ Что мы проверили

Запрос успешно отправлен на бэкенд Railway:
- **URL**: `https://pfpbackend-production.up.railway.app`
- **Эндпоинт**: `/api/client/calculate`
- **Request ID**: `flYdRym4QJWu3bZA0-QtfA` (из последнего запроса)

## 🔍 Где посмотреть логи на Railway

1. Откройте [Railway Dashboard](https://railway.app)
2. Выберите ваш проект
3. Перейдите в раздел **Deployments**
4. Выберите последний деплой
5. Нажмите **View Logs** или **Logs**

Или используйте Railway CLI:
```bash
railway logs
```

## 📝 Что должно быть в логах

### Для цели "Дом" (goal_type_id: 4)

**Ожидаемое поведение**: Расчет выполняется локально на нашем бэкенде.

В логах НЕ должно быть:
- ❌ Логов `=== NSJ CALCULATION START ===`
- ❌ Логов `NSJ API CALL START`
- ❌ Запросов к `https://demo.avinfors.ru/api-life/api/flow/`

Вместо этого должны быть:
- ✅ Поиск портфеля по критериям
- ✅ Расчет финансовых показателей локально
- ✅ Результат: `recommended_replenishment: 124847.71`

### Для цели "Защита Жизни" (goal_type_id: 5)

**Ожидаемое поведение**: Запрос отправляется на API партнера.

В логах ДОЛЖНЫ быть следующие записи:

#### 1. Начало расчета NSJ:
```
=== NSJ CALCULATION START ===
Goal: Защита Жизни Goal ID: 5
Target amount: 3000000 Term months: 180
Client data: {
  "birth_date": "1990-01-01",
  "sex": "male",
  ...
}
```

#### 2. Вызов сервиса:
```
Calling nsjApiService.calculateLifeInsurance with params: {
  "target_amount": 3000000,
  "term_months": 180,
  "client": {...},
  "payment_variant": 0,
  "program": "test"
}
```

#### 3. Детали запроса к API партнера:
```
=== calculateLifeInsurance called ===
Params: {...}
API URL from env: NOT SET (using default)
API Key from env: NOT SET (using default)
NSJ API Request: {
  "beginDate": "12.12.2025 00:00:00",
  "insConditions": {
    "program": "test",
    "currency": "RUR",
    "paymentVariant": 0,
    "term": 15
  },
  ...
}
```

#### 4. HTTP запрос к партнеру:
```
=== NSJ API CALL START ===
API URL: https://demo.avinfors.ru/api-life/api/flow/
API Key: ede88df2c0...
Operation: Contract.LifeEndowment.calculate
Request URL: https://demo.avinfors.ru/api-life/api/flow/
Request hostname: demo.avinfors.ru
Request path: /api-life/api/flow/
Request method: POST
Request body: {"operation":"Contract.LifeEndowment.calculate",...}
Sending HTTP request...
```

#### 5. Ответ от партнера:
```
Response received. Status: 200 OK
Response headers: {...}
Response body received, length: 2188
NSJ API Response: {
  "success": true,
  "data": {
    "term": 15,
    "risks": [...],
    "premium": 245000.76,
    ...
  }
}
```

#### 6. Результат:
```
NSJ Result received: {
  "success": true,
  "term": 15,
  "total_premium": 245000.76,
  "risks": [...],
  ...
}
```

## 🎯 Проверка правильности работы

### ✅ Правильно, если:

1. **Для "Дом"**:
   - Нет логов NSJ API
   - Есть только локальный расчет портфеля

2. **Для "Защита Жизни"**:
   - Есть все логи выше (от `=== NSJ CALCULATION START ===` до `NSJ Result received`)
   - HTTP запрос отправлен на `demo.avinfors.ru`
   - Получен успешный ответ (200 OK)
   - Результат содержит данные о рисках и премии

### ❌ Неправильно, если:

1. Для "Дом" есть логи NSJ API (не должно быть!)
2. Для "Защита Жизни" нет логов NSJ API (должны быть!)
3. Ошибки при запросе к API партнера
4. Нет ответа от API партнера

## 📊 Последний успешный запрос

**Request ID**: `flYdRym4QJWu3bZA0-QtfA`  
**Время**: 12 Dec 2025 13:13:16 GMT  
**Статус**: 200 OK  
**Время ответа**: 2816ms

**Результаты**:
- ✅ Цель 1 (Дом): Рассчитана локально
- ✅ Цель 2 (Защита Жизни): Рассчитана через API партнера

## 🔗 Полезные команды

```bash
# Посмотреть логи через CLI
railway logs

# Посмотреть логи с фильтром по NSJ
railway logs | grep -i "NSJ"

# Посмотреть логи с фильтром по Request ID
railway logs | grep "flYdRym4QJWu3bZA0-QtfA"
```














