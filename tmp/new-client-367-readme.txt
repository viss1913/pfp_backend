Новый клиент на проде (projectId=9, agent JWT mts@mtsbank.ru):
  client_id: 367
  Цель: НСЖ (goal_type_id 5, LIFE), расчёт OK.

Пейлоад для повтора: first-run-new-client-payload.json (тот же каталог).

PDF на Railway сейчас падает: в контейнере нет системных либ для bundled Chrome Puppeteer (libglib-2.0 и т.д.).
Нужен образ с chromium + зависимостями или PUPPETEER_EXECUTABLE_PATH на установленный chromium.

Кривые попытки (расчёт не сошёлся из-за настроек проекта 9):
  363 — класс 3 (инвест), нет портфеля
  364 — класс 4 (квартира), OTHER portfolio not found
  365 — класс 2 (пассив), yield line not found
  366 — класс 1 (пенсия), та же ошибка yield
