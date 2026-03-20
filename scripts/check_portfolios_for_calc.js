/**
 * Диагностика портфелей: почему калькулятор не находит портфель для пенсии/резерва.
 * Запуск: node scripts/check_portfolios_for_calc.js [projectId]
 * Без projectId — покажет все активные портфели.
 */
require('dotenv').config({ override: true });
const knex = require('../src/config/database');

const PROJECT_ID = process.argv[2] ? parseInt(process.argv[2], 10) : null;
// Критерии как в расчёте: пенсия — класс 1, сумма после смарт-аллока (пример 200k), срок до пенсии ~240 мес
const PENSION_AMOUNT = 200000;
const PENSION_TERM = 240;
// Финрезерв — класс 7, initial_capital 100k, term 12
const FINRESERVE_AMOUNT = 100000;
const FINRESERVE_TERM = 12;

function parseClasses(classes) {
    if (classes == null || classes === '') return [];
    if (Array.isArray(classes)) return classes.map(c => Number(c));
    if (typeof classes === 'string') {
        try {
            const p = JSON.parse(classes);
            return Array.isArray(p) ? p.map(c => Number(c)) : [Number(p)];
        } catch (_) {
            return classes.split(',').map(c => Number(c.trim())).filter(n => !isNaN(n));
        }
    }
    return [];
}

async function main() {
    try {
        let query = knex('portfolios').select('id', 'name', 'project_id', 'amount_from', 'amount_to', 'term_from_months', 'term_to_months', 'classes', 'is_active')
            .where('is_active', true);
        if (PROJECT_ID !== null && !isNaN(PROJECT_ID)) {
            query = query.where((b) => b.where('project_id', PROJECT_ID).orWhereNull('project_id'));
        }
        const portfolios = await query.orderBy('project_id', 'desc');

        console.log('--- Порты для расчёта (project_id =', PROJECT_ID ?? 'any', ') ---\n');

        let pensionFound = false;
        let finReserveFound = false;

        for (const p of portfolios) {
            const classes = parseClasses(p.classes);
            const amountFrom = Number(p.amount_from);
            const amountTo = Number(p.amount_to);
            const termFrom = Number(p.term_from_months);
            const termTo = Number(p.term_to_months);

            const pensionMatch = classes.includes(1) && PENSION_AMOUNT >= amountFrom && PENSION_AMOUNT <= amountTo && PENSION_TERM >= termFrom && PENSION_TERM <= termTo;
            const finMatch = classes.includes(7) && FINRESERVE_AMOUNT >= amountFrom && FINRESERVE_AMOUNT <= amountTo && FINRESERVE_TERM >= termFrom && FINRESERVE_TERM <= termTo;

            if (pensionMatch) pensionFound = true;
            if (finMatch) finReserveFound = true;

            console.log(`Portfolio #${p.id} "${p.name}" (project_id: ${p.project_id ?? 'NULL'})`);
            console.log(`  amount: ${amountFrom} - ${amountTo},  term: ${termFrom} - ${termTo} мес,  classes: ${JSON.stringify(classes)}`);
            console.log(`  Пенсия (class 1, amount ${PENSION_AMOUNT}, term ${PENSION_TERM}): ${pensionMatch ? 'OK' : 'NO'}`);
            if (!pensionMatch && classes.includes(1)) {
                if (PENSION_AMOUNT < amountFrom || PENSION_AMOUNT > amountTo) console.log(`    → сумма ${PENSION_AMOUNT} не в [${amountFrom}, ${amountTo}]`);
                if (PENSION_TERM < termFrom || PENSION_TERM > termTo) console.log(`    → срок ${PENSION_TERM} не в [${termFrom}, ${termTo}]`);
            }
            console.log(`  Финрезерв (class 7, amount ${FINRESERVE_AMOUNT}, term ${FINRESERVE_TERM}): ${finMatch ? 'OK' : 'NO'}`);
            if (!finMatch && classes.includes(7)) {
                if (FINRESERVE_AMOUNT < amountFrom || FINRESERVE_AMOUNT > amountTo) console.log(`    → сумма ${FINRESERVE_AMOUNT} не в [${amountFrom}, ${amountTo}]`);
                if (FINRESERVE_TERM < termFrom || FINRESERVE_TERM > termTo) console.log(`    → срок ${FINRESERVE_TERM} не в [${termFrom}, ${termTo}]`);
            }
            console.log('');
        }

        if (portfolios.length === 0) {
            console.log('Нет активных портфелей.');
        } else {
            console.log('--- Итог ---');
            console.log('Пенсия (class 1):', pensionFound ? 'есть подходящий портфель' : 'НЕТ подходящего (нужен term до 240 мес и сумма в диапазоне)');
            console.log('Финрезерв (class 7):', finReserveFound ? 'есть подходящий портфель' : 'НЕТ подходящего (нужны amount 100000, term 12 в диапазоне)');
        }
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

main();
