# Интеграция с Backend - Руководство

## Динамические данные

Для автоматической подстановки данных используйте следующие placeholder-маркеры в HTML:

### В тексте (index.html)

Замените следующие значения на шаблонные переменные вашей системы:

```html
<!-- Имя пользователя -->
Иван → {{user_name}}

<!-- Зарплата -->
110 000 ₽/мес. → {{salary}}

<!-- ИПК за год -->
~4,4 ИПК → {{ipk_per_year}}

<!-- Накопленный ИПК -->
169 ИПК → {{total_ipk}}

<!-- Фиксированная выплата (текущая) -->
9 584 ₽ → {{fixed_payment_current}}

<!-- Фиксированная выплата (будущая) -->
37 423 ₽ → {{fixed_payment_future}}

<!-- Стоимость ИПК (текущая) -->
156 рублей 76 копеек → {{ipk_cost_current}}

<!-- Стоимость ИПК (будущая) -->
612,12 ₽ → {{ipk_cost_future}}

<!-- Прогноз Госпенсии -->
141 033 ₽/мес. → {{pension_forecast}}

<!-- С учетом инфляции -->
36 117 ₽ → {{pension_inflation_adjusted}}

<!-- Желаемая пенсия -->
100 000 ₽ → {{pension_target}}

<!-- Дополнительный доход -->
63 883 ₽/мес. → {{additional_income_needed}}

<!-- Срок (лет) -->
20 лет → {{years_to_pension_1}}
25 лет → {{years_to_pension_2}}

<!-- Инфляция -->
5,6% → {{inflation_rate}}
```

## Пример шаблонизации (Python/Jinja2)

```python
from jinja2 import Template

# Загрузить HTML
with open('export/index.html', 'r', encoding='utf-8') as f:
    template_content = f.read()

# Создать шаблон
template = Template(template_content)

# Данные пользователя
user_data = {
    'user_name': 'Мария',
    'salary': '150 000',
    'ipk_per_year': '5.2',
    'total_ipk': '195',
    'fixed_payment_current': '9 584',
    'fixed_payment_future': '42 300',
    'ipk_cost_current': '156,76',
    'ipk_cost_future': '650,00',
    'pension_forecast': '169 050',
    'pension_inflation_adjusted': '43 260',
    'pension_target': '120 000',
    'additional_income_needed': '76 740',
    'years_to_pension_1': '18',
    'years_to_pension_2': '23',
    'inflation_rate': '5.8'
}

# Замените значения в HTML перед рендерингом
html_output = template_content
for key, value in user_data.items():
    # Простая замена строк (для production используйте более надежный метод)
    html_output = html_output.replace(f'{{{{{key}}}}}', str(value))

# Сохранить результат
with open('output.html', 'w', encoding='utf-8') as f:
    f.write(html_output)
```

## Пример шаблонизации (Node.js/Handlebars)

```javascript
const fs = require('fs');
const Handlebars = require('handlebars');

// Загрузить HTML
const htmlTemplate = fs.readFileSync('export/index.html', 'utf8');

// Заменить статические значения на Handlebars переменные
let template = htmlTemplate
  .replace(/Иван/g, '{{user_name}}')
  .replace(/110 000 ₽\/мес\./g, '{{salary}}')
  .replace(/~4,4 ИПК/g, '{{ipk_per_year}}')
  .replace(/169 ИПК/g, '{{total_ipk}}')
  // ... остальные замены

// Скомпилировать шаблон
const compiledTemplate = Handlebars.compile(template);

// Данные пользователя
const userData = {
  user_name: 'Мария',
  salary: '150 000 ₽/мес.',
  ipk_per_year: '~5.2 ИПК',
  total_ipk: '195 ИПК',
  // ... остальные данные
};

// Сгенерировать HTML
const output = compiledTemplate(userData);

// Сохранить
fs.writeFileSync('output.html', output, 'utf8');
```

## Генерация PDF

### Puppeteer (Node.js)

```javascript
const puppeteer = require('puppeteer');
const fs = require('fs');

async function generatePDF(htmlPath, outputPath) {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox']
  });
  
  const page = await browser.newPage();
  
  // Загрузить HTML
  const htmlContent = fs.readFileSync(htmlPath, 'utf8');
  await page.setContent(htmlContent, {
    waitUntil: 'networkidle0'
  });
  
  // Сгенерировать PDF
  await page.pdf({
    path: outputPath,
    width: '595px',
    height: '842px',
    printBackground: true,
    preferCSSPageSize: true,
    margin: {
      top: 0,
      right: 0,
      bottom: 0,
      left: 0
    }
  });
  
  await browser.close();
  console.log(`PDF saved to ${outputPath}`);
}

generatePDF('output.html', 'pension-forecast.pdf');
```

### WeasyPrint (Python)

```python
from weasyprint import HTML, CSS

def generate_pdf(html_path, css_path, output_path):
    # Загрузить HTML и CSS
    html = HTML(filename=html_path)
    css = CSS(filename=css_path)
    
    # Сгенерировать PDF
    html.write_pdf(
        output_path,
        stylesheets=[css]
    )
    
    print(f'PDF saved to {output_path}')

generate_pdf('export/index.html', 'export/styles.css', 'pension-forecast.pdf')
```

## Изображения пользователя

### Замена avatar.png

```python
import shutil

def set_user_avatar(user_avatar_path):
    """
    Копирует аватар пользователя в assets/
    
    Args:
        user_avatar_path: Путь к загруженному аватару пользователя
    """
    # Ресайз до 60×68px если необходимо
    from PIL import Image
    
    img = Image.open(user_avatar_path)
    img = img.resize((60, 68), Image.LANCZOS)
    img.save('export/assets/avatar.png')
```

### Динамическая генерация диаграммы

Если высоты столбцов в графике должны быть динамическими:

```javascript
// В CSS или inline стилях
function updateChartHeights(desiredPension, forecastPension, additionalIncome) {
  const maxHeight = 100; // максимальная высота в px
  const max = Math.max(desiredPension, forecastPension, additionalIncome);
  
  const heights = {
    desired: Math.round((desiredPension / max) * maxHeight),
    forecast: Math.round((forecastPension / max) * maxHeight),
    additional: Math.round((additionalIncome / max) * maxHeight)
  };
  
  // Обновить CSS
  document.querySelector('.bar-fill-black').style.height = `${heights.desired}px`;
  document.querySelector('.bar-fill-purple').style.height = `${heights.forecast}px`;
  document.querySelector('.bar-fill-gray').style.height = `${heights.additional}px`;
  
  return heights;
}
```

## Валидация данных

Перед генерацией PDF проверяйте:

```python
def validate_pension_data(data):
    """Валидация данных перед генерацией PDF"""
    
    required_fields = [
        'user_name', 'salary', 'ipk_per_year', 'total_ipk',
        'pension_forecast', 'pension_target', 'additional_income_needed'
    ]
    
    for field in required_fields:
        if field not in data or not data[field]:
            raise ValueError(f'Missing required field: {field}')
    
    # Проверка числовых значений
    numeric_fields = ['salary', 'pension_forecast', 'pension_target']
    for field in numeric_fields:
        try:
            # Удалить форматирование и преобразовать в число
            value = data[field].replace(' ', '').replace('₽', '').replace(',', '.')
            float(value)
        except (ValueError, AttributeError):
            raise ValueError(f'Invalid numeric value for {field}: {data[field]}')
    
    return True
```

## Тестирование

```bash
# Открыть в браузере для проверки
open export/index.html  # macOS
xdg-open export/index.html  # Linux
start export/index.html  # Windows

# Или запустить локальный сервер
cd export
python3 -m http.server 8000
# Открыть http://localhost:8000
```

## Troubleshooting

### Проблема: Шрифты отображаются некорректно в PDF

**Решение:** Используйте DejaVu Sans или встройте шрифты в CSS:

```css
@font-face {
    font-family: 'Proxima Nova';
    src: url('assets/fonts/ProximaNova-Regular.woff2') format('woff2');
    font-weight: normal;
}
```

### Проблема: Изображения не загружаются в PDF

**Решение:** Используйте абсолютные пути или data URLs:

```javascript
// Конвертировать изображения в base64
const fs = require('fs');

function imageToDataURL(imagePath) {
  const imageBuffer = fs.readFileSync(imagePath);
  const base64Image = imageBuffer.toString('base64');
  const ext = imagePath.split('.').pop();
  return `data:image/${ext};base64,${base64Image}`;
}

// Заменить src в HTML
const avatarDataURL = imageToDataURL('export/assets/avatar.png');
html = html.replace('assets/avatar.png', avatarDataURL);
```

### Проблема: График выходит за границы

**Решение:** Проверьте что контейнер chart-block имеет фиксированные размеры:

```css
.chart-block {
    width: 535px;
    height: 137px;
    overflow: hidden;
}
```

---

**Последнее обновление:** 2026-04-01
