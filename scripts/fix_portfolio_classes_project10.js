/**
 * Чиним пустые classes у портфелей проекта 10: пенсия = class 1, финрезерв = class 7.
 * Запуск: node scripts/fix_portfolio_classes_project10.js
 */
require('dotenv').config({ override: true });
const knex = require('../src/config/database');

const PROJECT_ID = 10;

async function main() {
    try {
        const portfolios = await knex('portfolios')
            .where({ project_id: PROJECT_ID, is_active: true })
            .select('id', 'name', 'classes');

        const byName = (name) => {
            const n = (name || '').toLowerCase();
            return (p) => (p.name || '').toLowerCase().includes(n);
        };

        let updated = 0;
        // Пенсия -> class 1 (PENSION / GOS_PENSION в системе обычно 1)
        const pension = portfolios.find(p => byName('пенсия')(p) || byName('pension')(p));
        if (pension) {
            const classes = [1];
            await knex('portfolios').where({ id: pension.id }).update({
                classes: JSON.stringify(classes),
                updated_at: knex.fn.now()
            });
            console.log(`Portfolio #${pension.id} "${pension.name}" → classes: [1] (Пенсия)`);
            updated++;
        }

        // Фин резерв -> class 7
        const finReserve = portfolios.find(p => byName('фин резерв')(p) || byName('резерв')(p) || byName('fin')(p));
        if (finReserve && finReserve.id !== pension?.id) {
            const classes = [7];
            await knex('portfolios').where({ id: finReserve.id }).update({
                classes: JSON.stringify(classes),
                updated_at: knex.fn.now()
            });
            console.log(`Portfolio #${finReserve.id} "${finReserve.name}" → classes: [7] (Финрезерв)`);
            updated++;
        }

        if (updated === 0) {
            console.log('Портфели "пенсия" / "Фин резерв" не найдены по имени. Проверь project_id и названия.');
        } else {
            console.log(`\nОбновлено портфелей: ${updated}. Запусти расчёт снова.`);
        }
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

main();
