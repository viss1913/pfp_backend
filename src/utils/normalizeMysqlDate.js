/**
 * Значение для колонок MySQL типа DATE: только YYYY-MM-DD.
 * Не использует loose-парсинг Date('…') — иначе '+019980-08' даёт невалидный ISO для MySQL.
 *
 * Фронт ЛК иногда шлёт год из 5 цифр: "19980-08-24" вместо "1980-08-24" (лишняя «9»).
 *
 * @param {string|Date|null|undefined} value
 * @returns {string|null|undefined} YYYY-MM-DD, null если очистить, undefined если вход был undefined
 */
function normalizeMysqlDate(value) {
    if (value === undefined) return undefined;
    if (value === null || value === '') return null;
    if (value instanceof Date) {
        if (Number.isNaN(value.getTime())) return null;
        return formatDateParts(
            value.getUTCFullYear(),
            value.getUTCMonth() + 1,
            value.getUTCDate()
        );
    }

    const s = String(value).trim().replace(/^\+/, '');
    if (!s) return null;

    const m = s.match(/^(\d{4,5})-(\d{2})-(\d{2})/);
    if (!m) return null;

    const y = coerceBirthYear(Number(m[1]));
    const mo = Number(m[2]);
    const d = Number(m[3]);
    return formatDateParts(y, mo, d);
}

/**
 * Год из ЛК: 19980 → 1980 (убираем лишнюю «9» в позиции 199|9|80).
 * @param {number} year
 * @returns {number}
 */
function coerceBirthYear(year) {
    if (!Number.isFinite(year)) return year;
    const digits = String(Math.trunc(year));
    if (digits.length === 5 && digits.startsWith('19') && digits[2] === '9') {
        return Number(`${digits[0]}${digits[1]}${digits[3]}${digits[4]}`);
    }
    return year;
}

/**
 * @param {number} y
 * @param {number} mo
 * @param {number} d
 * @returns {string|null}
 */
function formatDateParts(y, mo, d) {
    if (!Number.isInteger(y) || !Number.isInteger(mo) || !Number.isInteger(d)) return null;
    if (y < 1900 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;

    const probe = new Date(Date.UTC(y, mo - 1, d, 12, 0, 0));
    if (
        probe.getUTCFullYear() !== y ||
        probe.getUTCMonth() !== mo - 1 ||
        probe.getUTCDate() !== d
    ) {
        return null;
    }

    return `${String(y).padStart(4, '0')}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * Если в объекте есть ключ birth_date — заменить на нормализованное значение (копия объекта).
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

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isInvalidBirthDateInput(value) {
    if (value === undefined || value === null) return false;
    const s = String(value).trim();
    if (!s) return false;
    return normalizeMysqlDate(value) === null;
}

module.exports = { normalizeMysqlDate, withNormalizedBirthDate, isInvalidBirthDateInput, coerceBirthYear };
