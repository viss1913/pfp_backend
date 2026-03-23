Картинки фона карточек целей в PDF (сводная страница и дальше по отчёту).

Имя файла = значение goal_type из расчёта/API, как в JSON (латиница, подчёркивания):
  PENSION, FIN_RESERVE, LIFE, INVESTMENT, PASSIVE_INCOME, RENT, OTHER

Расширения по порядку поиска: .png, .jpg, .jpeg, .webp

Если файла для типа нет — берётся DEFAULT.png (обязательно держи в папке).

Источник ассетов (MTS B2C mass, 2026): папка …/src/assets/goals/png
  reserve.webp → FIN_RESERVE.webp
  lifeinsurance.webp → LIFE.webp

Сопоставление имён MTS → goal_type:
  gospensiya → PENSION
  reserve.webp → FIN_RESERVE
  lifeinsurance.webp → LIFE
  sohranit__i_preumnozhit → INVESTMENT
  passivnyy_dohod_v_buduschem → PASSIVE_INCOME
  kvartira → RENT (условно, недвижимость)
  drugoe → OTHER и DEFAULT

Не путать с assets/reports/summary/ — там только лого и сток аватара ИИ для сводной страницы.
