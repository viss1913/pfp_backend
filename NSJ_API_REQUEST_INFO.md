# Информация о запросах к NSJ API

## Параметры подключения

**URL:** `https://demo.avinfors.ru/api-life/api/flow/`

**API Key:** `ede88df2c022e810fedc09d4`

**Метод:** `POST`

**Заголовки:**
```
Content-Type: application/json
Authorization: Bearer ede88df2c022e810fedc09d4
Content-Length: <размер тела запроса>
```

## Формат запроса

### Структура JSON запроса:

```json
{
  "operation": "Contract.LifeEndowment.calculate",
  "data": {
    "beginDate": "10.01.2025 00:00:00",
    "insConditions": {
      "program": "test",
      "currency": "RUR",
      "paymentVariant": 0,
      "term": 20
    },
    "policyHolder": {
      "dob": "01.01.1989",
      "age": 35,
      "sex": "male"
    },
    "insuredPerson": {
      "isPolicyHolder": true
    },
    "calcData": {
      "valuationType": "byLimit",
      "limit": 2500000
    }
  }
}
```

## Пример для последнего теста (Мужчина, 35 лет, 2.5 млн, 20 лет)

**URL:** `https://demo.avinfors.ru/api-life/api/flow/`

**Заголовки:**
```
POST /api-life/api/flow/ HTTP/1.1
Host: demo.avinfors.ru
Content-Type: application/json
Authorization: Bearer ede88df2c022e810fedc09d4
Content-Length: <размер>
```

**Тело запроса:**
```json
{
  "operation": "Contract.LifeEndowment.calculate",
  "data": {
    "beginDate": "10.01.2025 00:00:00",
    "insConditions": {
      "program": "test",
      "currency": "RUR",
      "paymentVariant": 0,
      "term": 20
    },
    "policyHolder": {
      "dob": "01.01.1989",
      "age": 35,
      "sex": "male"
    },
    "insuredPerson": {
      "isPolicyHolder": true
    },
    "calcData": {
      "valuationType": "byLimit",
      "limit": 2500000
    }
  }
}
```

## Переменные окружения

В коде используются переменные окружения (если не заданы, используются значения по умолчанию):

- `NSJ_API_URL` - URL API (по умолчанию: `https://demo.avinfors.ru/api-life/api/flow/`)
- `NSJ_API_KEY` - API ключ (по умолчанию: `ede88df2c022e810fedc09d4`)
- `NSJ_DEFAULT_PROGRAM` - Код программы (по умолчанию: `test`)

## Где в коде формируется запрос

Файл: `src/services/nsjApiService.js`

Метод: `callApi(operation, data)` - строка 19
Метод: `calculateLifeInsurance(params)` - строка 100

## Логирование

В коде добавлено логирование запросов и ответов:
- `console.log('NSJ API Request:', ...)` - строка 194
- `console.log('NSJ API Response:', ...)` - строка 199

Эти логи выводятся в консоль сервера на Railway.
















