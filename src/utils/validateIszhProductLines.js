'use strict';

const { isSurvivalRiskName } = require('../algorithms/calculators/iszhSurvivalYield');

/**
 * @param {Array<Object>|null|undefined} lines
 * @returns {{ ok: boolean, error?: string }}
 */
function validateIszhProductLines(lines) {
    if (lines == null) return { ok: true };
    if (!Array.isArray(lines)) {
        return { ok: false, error: 'ISZH: поле lines должно быть массивом объектов.' };
    }
    let hasSurvival = false;
    for (let i = 0; i < lines.length; i++) {
        const row = lines[i];
        if (!row || typeof row !== 'object') {
            return { ok: false, error: `ISZH: lines[${i}] должен быть объектом.` };
        }
        const risk = row.risk_name != null ? String(row.risk_name).trim() : '';
        if (!risk) {
            return { ok: false, error: `ISZH: в строке ${i + 1} обязательно поле risk_name.` };
        }
        if (isSurvivalRiskName(risk)) {
            hasSurvival = true;
            const y = row.yield_percent;
            const n = Number(y);
            if (!Number.isFinite(n)) {
                return { ok: false, error: `ISZH: для риска «${risk}» в строке ${i + 1} нужна числовая yield_percent.` };
            }
        }
        if (row.payment_ratio != null && row.payment_ratio !== '') {
            const pr = Number(row.payment_ratio);
            if (!Number.isFinite(pr) || pr < 0) {
                return { ok: false, error: `ISZH: payment_ratio в строке ${i + 1} должен быть числом ≥ 0.` };
            }
        }
    }
    if (!hasSurvival) {
        return { ok: false, error: 'ISZH: в матрице lines должна быть хотя бы одна строка риска «Дожитие».' };
    }
    return { ok: true };
}

module.exports = { validateIszhProductLines };
