# PDF Макет "План по софинансированию пенсии"

Чистый HTML/CSS макет для генерации PDF документа.

## Структура файлов

```
export/
├── index.html       # Основной HTML файл
├── styles.css       # Все стили
├── assets/
│   └── avatar.png   # Фото аватара (60x68 px) - ЗАМЕНИТЬ НА РЕАЛЬНОЕ
└── README.md        # Этот файл
```

## Спецификация

- **Размер страницы**: 595x842 px (A4 портрет)
- **Шрифт**: Proxima Nova (fallback: DejaVu Sans, Inter, sans-serif)
- **Акцентный цвет**: #722257 (фиолетовый)
- **Фон страницы**: #e8e8e8 (светло-серый)
- **Фон карточек**: #f3f3f4 (светлый)

## Как использовать

### 1. Замена статичных данных на переменные

Все текстовые значения в HTML легко заменить на переменные. Например:

**Было:**
```html
<p>Ваш доход - 110 000 ₽/мес.</p>
```

**Стало (PHP):**
```php
<p>Ваш доход - <?= $income ?> ₽/мес.</p>
```

**Стало (JavaScript):**
```html
<p>Ваш доход - ${data.income} ₽/мес.</p>
```

### 2. Генерация PDF

#### Вариант А: Через браузер (Chrome/Edge)
1. Открыть `index.html` в браузере
2. Ctrl+P (Печать)
3. Destination: "Save as PDF"
4. Paper size: A4
5. Margins: None
6. Scale: 100%

#### Вариант Б: Puppeteer (Node.js)
```javascript
const puppeteer = require('puppeteer');

async function generatePDF() {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.setContent(htmlContent);
  await page.pdf({
    path: 'output.pdf',
    format: 'A4',
    printBackground: true
  });
  await browser.close();
}
```

#### Вариант В: wkhtmltopdf
```bash
wkhtmltopdf --page-size A4 index.html output.pdf
```

#### Вариант Г: Python (weasyprint)
```python
from weasyprint import HTML
HTML('index.html').write_pdf('output.pdf')
```

## Список переменных для замены

| Переменная | Текущее значение | Расположение в HTML |
|------------|------------------|---------------------|
| income | 110 000 | Строка "Ваш доход" |
| cofinancing2026 | 36 000 | Карточка софинансирования, строка 1 |
| cofinancingTotal | 342 751 | Карточка софинансирования, строка 2 |
| taxDeduction2026 | 11 900 | Карточка налогов, строка 1 |
| taxDeductionTotal | 698 748 | Карточка налогов, строка 2 |
| goal | Достойная пенсия - 100 000 | Резюме, цель |
| goalDate | 2045 г. | Резюме, дата |
| initialCapital | 50 000 | Резюме, первоначальный капитал |
| monthlyContribution | 4 500 | Резюме, пополнение |
| cofinancingTotalResume | 360 000 | Резюме, всего софинансирование |
| taxDeductionTotalResume | 698 748 | Резюме, всего налоговых вычетов |
| finalCapital | 24 944 611 | Резюме, итоговый капитал |

## Изображения

### avatar.png
- **Размер**: 60x68 px
- **Формат**: PNG или JPG
- **Путь**: `assets/avatar.png`
- **Описание**: Фотография пользователя с градиентным фоном

## Передача разработчику

### Вариант 1: ZIP архив
```bash
cd export
zip -r pension-pdf-layout.zip .
```

### Вариант 2: Git
```bash
git add export/
git commit -m "Add pension PDF layout"
git push
```

### Вариант 3: Копирование файлов
Просто скопируйте папку `export/` разработчику.

## Печать и экспорт

Макет оптимизирован для печати:
- Медиазапрос `@media print` убирает тени и фон
- Размер точно A4 (595x842px)
- Все позиции абсолютные для пиксель-перфект вывода

## Кастомизация

### Изменение цветов
Замените в `styles.css`:
- `#722257` - акцентный цвет (заголовки, разделители)
- `#f3f3f4` - фон карточек
- `#e8e8e8` - фон страницы

### Изменение шрифтов
Добавьте `@font-face` в начало `styles.css` или подключите через Google Fonts.

## Примечания

- Макет адаптирован под печать, НЕ для мобильных устройств
- Используются абсолютные позиции для точного соответствия дизайну
- Все размеры в пикселях для соответствия PDF формату
- SVG логотип встроен напрямую в HTML

---

Создано: 2026-04-01
Размер: A4 портрет (595x842 px)
