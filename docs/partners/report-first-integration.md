# report first integration

Ниже отчет по первой интеграционной проверке с Resolut.

Формат максимально простой:
- куда отправляли;
- каким методом;
- что отправили;
- что получили.

---

## Шаг 1. Авторизация

Сделала запрос. Получила ответ. Записала в отчет.

### Адрес обращения

`https://demo.avinfors.ru/pfp/api/pfp/`

### Метод

`POST`

### Что отправили

Headers:
- `Content-Type: application/json`

Body:

```json
{
  "operation": "authorize",
  "data": {
    "login": "agent@agent.ru",
    "password": "1234",
    "type": "ПользовательРезолют"
  }
}
```

### Что получили

```json
{
  "success": true,
  "data": {
    "key": "3ac58561-fe74-43e7-9ba0-d8ce4d22f1f3",
    "user": {
      "code": 4,
      "name": "...",
      "login": "AGENT@AGENT.RU"
    }
  }
}
```

Итог шага:
- авторизация успешна;
- получили `key`, он используется дальше в `Authorization: Bearer <key>`.

---

## Шаг 2. Список продуктов

Сделала запрос. Получила ответ. Записала в отчет.

### Адрес обращения

`https://demo.avinfors.ru/pfp/api/pfp/`

### Метод

`POST`

### Что отправили

Headers:
- `Content-Type: application/json`
- `Authorization: Bearer 3ac58561-fe74-43e7-9ba0-d8ce4d22f1f3`

Body:

```json
{
  "operation": "products",
  "data": {}
}
```

### Что получили

```json
{
  "success": true,
  "data": [
    {
      "product": "lifeAccumulate",
      "program": {
        "code": 1739275356113935,
        "name": "..."
      },
      "pfpCode": "assetShort"
    },
    {
      "product": "lifeAccumulate",
      "program": {
        "code": 1771484474549709,
        "name": "..."
      },
      "pfpCode": "cashback"
    }
  ]
}
```

Итог шага:
- список продуктов получен;
- для расчета нужно использовать `pfpCode` из списка (например `assetShort` или `cashback`).

---

## Шаг 3. Расчет (quote)

Сделала запрос. Получила ответ. Записала в отчет.

### Адрес обращения

`https://demo.avinfors.ru/pfp/api/pfp/`

### Метод

`POST`

### Что отправили

Headers:
- `Content-Type: application/json`
- `Authorization: Bearer 3ac58561-fe74-43e7-9ba0-d8ce4d22f1f3`

Body:

```json
{
  "operation": "quote",
  "data": {
    "code": "assetShort",
    "parameters": {
      "currency": "RUR",
      "pType": 0,
      "term": 5,
      "insuredPerson": {
        "dob": "01.01.1985",
        "sex": "male"
      },
      "calcData": {
        "valuationType": "byLimit",
        "limit": 1000000
      }
    }
  }
}
```

### Что получили

HTTP статус:
- `400`

Body:

```json
{
  "success": false,
  "error": {
    "code": "calcError",
    "name": "..."
  }
}
```

Итог шага:
- запрос уходит корректно;
- код продукта валидный (`assetShort` из products);
- расчет на стороне Resolut возвращает `calcError`.

---

## Короткий вывод

1. Авторизация работает.
2. Список продуктов получается.
3. Расчет (`quote`) пока падает с `calcError` на стороне партнера.
