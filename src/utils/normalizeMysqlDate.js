/**
 * Значение для колонок MySQL типа DATE: только YYYY-MM-DD.
 * Режет ISO-строки (…T…Z), объекты Date; пустое → null.
 *
 * @param {string|Date|null|undefined} value
 * @returns {string|null|undefined} YYYY-MM-DD, null если очистить, undefined если вход был undefined
 */
function normalizeMysqlDate(value) {
    if (value === undefined) return undefined;
    if (value === null || value === '') return null;
    if (value instanceof Date) {
        if (Number.isNaN(value.getTime())) return null;
        return value.toISOString().slice(0, 10);
    }
    const s = String(value).trim();
    if (!s) return null;
    const ymd = s.match(/^(\d{4}-\d{2}-\d{2})/);
    if (ymd) return ymd[1];
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
}

/**
 * Если в объекте есть ключ birth_date — заменить на нормализованное значение (мутация копии).
 * @param {Record<string, unknown>} data
 * @returns {Record<string, unknown>}
 */
function withNormalizedBirthDate(data) {
    if (!data || typeof data !== 'object') return data;
    if (!Object.prototype.hasOwnProperty.call(data, 'birth_date')) return data;
    const next = { ...data };
    next.birth_date = normalizeMysqlDate(next.birth_date);
    return next;
}

module.exports = { normalizeMysqlDate, withNormalizedBirthDate };
