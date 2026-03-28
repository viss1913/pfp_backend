/**
 * Проверка monthly_schedule: налоговый вычет ПДС в апреле, софинансирование в августе,
 * суммы попадают в total_capital того же месяца.
 *
 * Запуск: npm run test:monthly-schedule-pds
 */

const BaseCalculator = require('../src/algorithms/calculators/BaseCalculator');

const FIXED_TAX_REFUND = 1111;
const FIXED_COFIN = 2222;

class StubPdsCalculator extends BaseCalculator {
    async handlePdsEvents(month, year, startYear, yearlyContributions, avgMonthlyIncome, context) {
        // Как в BaseCalculator: апрель — вычет за прошлый год; август — софин за прошлый год
        if (month === 4 && year > startYear) {
            return { cofin: 0, refund: FIXED_TAX_REFUND };
        }
        if (month === 8 && year > startYear) {
            return { cofin: FIXED_COFIN, refund: 0 };
        }
        return { cofin: 0, refund: 0 };
    }
}

function parseRowDate(dateStr) {
    const [y, m] = dateStr.split('-').map((x) => parseInt(x, 10));
    return { year: y, month: m };
}

function assert(cond, msg) {
    if (!cond) {
        console.error('FAIL:', msg);
        process.exit(1);
    }
}

async function main() {
    const calc = new StubPdsCalculator();
    const ctx = {
        usedCofinancingPerYear: {},
        usedTaxBasePerYear: {},
        cachedData: {}
    };

    const res = await calc.runSimulation({
        initialCapital: 10_000,
        monthlyReplenishment: 5_000,
        termMonths: 22,
        monthlyYieldRate: 0,
        indexationRate: 0,
        pdsProductId: 1,
        avgMonthlyIncome: 100_000,
        startDate: new Date(2025, 0, 15),
        collectMonthlySchedule: true
    }, ctx);

    const sched = res.monthlySchedule;
    assert(Array.isArray(sched) && sched.length === 22, `ожидали 22 строки, получили ${sched?.length}`);

    const startYear = 2025;
    let prevCapital = null;
    for (let i = 0; i < sched.length; i++) {
        const row = sched[i];
        const { year: rowYear, month: monthNum } = parseRowDate(row.date);
        const repl = row.replenishment;
        const tax = row.tax_deduction;
        const cof = row.cofinancing;
        const cap = row.total_capital;

        // Как в handlePdsEvents: события только при year > startYear
        if (monthNum === 4 && rowYear > startYear) {
            assert(
                tax === FIXED_TAX_REFUND && cof === 0,
                `апрель ${row.date}: ожидали tax=${FIXED_TAX_REFUND}, cofin=0; got tax=${tax}, cofin=${cof}`
            );
        }
        if (monthNum === 8 && rowYear > startYear) {
            assert(
                cof === FIXED_COFIN && tax === 0,
                `август ${row.date}: ожидали cofin=${FIXED_COFIN}, tax=0; got cofin=${cof}, tax=${tax}`
            );
        }

        if (prevCapital !== null) {
            const expected = Math.round((prevCapital + repl + tax + cof) * 100) / 100;
            assert(
                Math.abs(cap - expected) < 0.02,
                `капитал ${row.date}: ожидали ≈${expected} (пред. ${prevCapital} + пополн ${repl} + вычет ${tax} + софин ${cof}), получили ${cap}`
            );
        }
        prevCapital = cap;
    }

    const aprilRows = sched.filter((r) => {
        const { year, month } = parseRowDate(r.date);
        return month === 4 && year > startYear && r.tax_deduction > 0;
    });
    const augustRows = sched.filter((r) => {
        const { year, month } = parseRowDate(r.date);
        return month === 8 && year > startYear && r.cofinancing > 0;
    });
    assert(aprilRows.length >= 1, 'должен быть минимум один апрельский месяц с ненулевым tax_deduction');
    assert(augustRows.length >= 1, 'должен быть минимум один август с ненулевым cofinancing');

    console.log('OK: monthly_schedule — апрель (вычет), август (софин), капитал сходится помесячно.');
    console.log(`Пример апрельской строки:`, aprilRows[0]);
    console.log(`Пример августовской строки:`, augustRows[0]);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
