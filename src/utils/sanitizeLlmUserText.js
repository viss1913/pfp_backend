/**
 * Убирает служебные префиксы reasoning-моделей (Gemma: «thought», … и т.п.)
 * из текста, который уходит пользователю в Telegram / чат.
 */
function sanitizeLlmUserText(text) {
    if (text == null || typeof text !== 'string') return '';
    let s = text;

    // Блок  в начале ответа
    s = s.replace(/^[\s\S]*?<\/think>\s*/i, '');

    // Отдельная строка «thought» / «thinking» перед основным текстом
    s = s.replace(/^(?:thought|thinking)\s*:?\s*\n+/i, '');

    // «thought Привет…» в одной строке
    s = s.replace(/^(?:thought|thinking)\s*:?\s+(?=[А-ЯЁA-Z«"'])/iu, '');

    return s.trimStart();
}

module.exports = { sanitizeLlmUserText };
