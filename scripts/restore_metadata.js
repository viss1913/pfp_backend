const knex = require('../src/config/database');

async function restoreMetadata() {
    try {
        console.log('Restoring portfolio_classes...');

        // Data from 01_initial_data.js and 20251222120117_add_fin_reserve_goal_type.js
        const classes = [
            { id: 1, code: 'PENSION', name: 'Пенсия' },
            { id: 2, code: 'PASSIVE_INCOME', name: 'Пассивный доход' },
            { id: 3, code: 'INVESTMENT', name: 'Инвестиции' },
            { id: 4, code: 'OTHER', name: 'Прочее' },
            { id: 5, code: 'LIFE', name: 'Жизнь' },
            { id: 6, code: 'GOS_PENSION', name: 'Госпенсия' },
            { id: 7, code: 'FIN_RESERVE', name: 'Финрезерв' }
        ];

        for (const item of classes) {
            await knex('portfolio_classes')
                .insert(item)
                .onConflict('id')
                .merge();
        }

        console.log('Success! portfolio_classes restored.');

        // Also check product_types just in case
        const productTypes = [
            { id: 1, code: 'PDS', name: 'Программа долгосрочных сбережений' },
            { id: 2, code: 'IIS', name: 'Индивидуальный инвестиционный счёт' },
            { id: 3, code: 'ISZH', name: 'Инвестиционное страхование жизни' },
            { id: 4, code: 'NSZH', name: 'Накопительное страхование жизни' },
            { id: 5, code: 'DEPOSIT', name: 'Банковский вклад' },
            { id: 6, code: 'BOND', name: 'Облигации' },
            { id: 7, code: 'STOCK', name: 'Акции' },
            { id: 8, code: 'FUND', name: 'Фонды' },
            { id: 9, code: 'OTHER', name: 'Прочее' }
        ];

        console.log('Restoring product_types...');
        for (const item of productTypes) {
            await knex('product_types')
                .insert(item)
                .onConflict('id')
                .merge();
        }
        console.log('Success! product_types restored.');

    } catch (error) {
        console.error('Error restoring metadata:', error.message);
    } finally {
        await knex.destroy();
        process.exit();
    }
}

restoreMetadata();
