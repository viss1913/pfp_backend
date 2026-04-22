#!/bin/bash

echo "=== Валидация PDF верстки ==="
echo ""

# Проверка наличия файлов
echo "1. Проверка структуры файлов..."
if [ ! -f "index.html" ]; then
    echo "❌ Отсутствует index.html"
    exit 1
fi

if [ ! -f "styles.css" ]; then
    echo "❌ Отсутствует styles.css"
    exit 1
fi

if [ ! -d "assets" ]; then
    echo "⚠️  Отсутствует папка assets/"
fi

echo "✅ Структура файлов корректна"
echo ""

# Проверка размеров в HTML
echo "2. Проверка размеров контейнера..."
if grep -q "595px" index.html && grep -q "842px" index.html; then
    echo "✅ Размеры A4 найдены в HTML"
else
    echo "⚠️  Размеры A4 не найдены в HTML"
fi

# Проверка размеров в CSS
if grep -q "width: 595px" styles.css && grep -q "height: 842px" styles.css; then
    echo "✅ Размеры A4 найдены в CSS"
else
    echo "⚠️  Размеры A4 не найдены в CSS"
fi
echo ""

# Проверка кодировки
echo "3. Проверка кодировки..."
if grep -q "charset=UTF-8" index.html; then
    echo "✅ UTF-8 кодировка установлена"
else
    echo "⚠️  Отсутствует UTF-8 кодировка"
fi
echo ""

# Проверка наличия основных блоков
echo "4. Проверка основных блоков..."
blocks=(
    "header-block"
    "section-title"
    "formula-block"
    "content-block"
    "chart-block"
    "logo-block"
)

for block in "${blocks[@]}"; do
    if grep -q "class=\"$block\"" index.html; then
        echo "✅ Блок .$block найден"
    else
        echo "❌ Блок .$block отсутствует"
    fi
done
echo ""

# Проверка placeholder значений
echo "5. Проверка placeholder значений..."
placeholders=(
    "Иван"
    "110 000 ₽"
    "169 ИПК"
    "141 033 ₽"
    "100 000 ₽"
)

for placeholder in "${placeholders[@]}"; do
    if grep -q "$placeholder" index.html; then
        echo "✅ Найден: $placeholder"
    else
        echo "⚠️  Не найден: $placeholder"
    fi
done
echo ""

# Статистика
echo "=== Статистика ==="
echo "Строк в index.html: $(wc -l < index.html)"
echo "Строк в styles.css: $(wc -l < styles.css)"
echo "Размер index.html: $(du -h index.html | cut -f1)"
echo "Размер styles.css: $(du -h styles.css | cut -f1)"
echo ""

echo "✅ Валидация завершена!"
