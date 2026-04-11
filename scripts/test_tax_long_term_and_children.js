/* eslint-disable no-console */
const TaxService = require('../src/algorithms/TaxService');

async function run() {
    const year = new Date().getFullYear();
    const annualIncome = 1800000;

    const cases = [
        {
            name: 'PDS полностью съедает лимит',
            input: { annualIncome, year, pdsContribution: 600000, iisContribution: 100000, usedDeductionBase: 0 }
        },
        {
            name: 'ПДС частично + ИИС добирает остаток',
            input: { annualIncome, year, pdsContribution: 240000, iisContribution: 300000, usedDeductionBase: 0 }
        },
        {
            name: 'ИИС без ПДС',
            input: { annualIncome, year, pdsContribution: 0, iisContribution: 350000, usedDeductionBase: 0 }
        }
    ];

    console.log('=== Long-term savings (PDS + IIS) ===');
    for (const t of cases) {
        const res = await TaxService.calculateLongTermSavingsRefund(t.input);
        console.log(t.name, res);
    }

    console.log('=== Children deduction ===');
    const children = [
        { birth_date: '2017-02-11' },
        { birth_date: '2010-09-15' },
        { birth_date: '2004-01-01', is_full_time_student: true },
        { birth_date: '2012-03-17', is_disabled: true }
    ];
    const childRes = await TaxService.calculateChildrenRefundDelta({
        annualIncome,
        year,
        children
    });
    console.log('Children result', childRes);
}

run()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
