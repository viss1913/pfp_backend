const { buildRepleneshmentPageHtml } = require('./buildFinamReportHtml');

// Давай сгенерим 30 строк, чтобы увидеть переполнение
const rows = [];
for (let i = 0; i < 35; i++) {
    rows.push({
        date: `2030-${String(i % 12 + 1).padStart(2, '0')}-01`,
        replenishment: 130000 + i * 100,
        tax_deduction: i % 12 === 3 ? 140000 : 0,
        cofinancing: i % 10 === 0 ? 36000 : 0,
        total_capital: 13000000 + i * 300000
    });
}

const mockReport = {
    goals_detailed: [
        {
            goal_type: 'OTHER',
            goal_name: 'Тест лимита',
            details: { monthly_schedule: rows },
            summary: { initial_capital: 13000000 }
        }
    ]
};

// Временно подменим константу в коде через хитрость или просто сгенерим с текущей
const html = buildRepleneshmentPageHtml(mockReport);
const fs = require('fs');
const path = require('path');
fs.writeFileSync(path.join(__dirname, '_test_overflow.html'), html, 'utf-8');
console.log('Generated _test_overflow.html');
