/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> } 
 */
exports.seed = async function (knex) {
    // Проверяем, есть ли уже данные
    const existing = await knex('product_types').count('* as count').first();
    if (parseInt(existing.count) > 0) {
        console.log('✅ Product types already exist, skipping seed');
        return;
    }

    // Создаём типы продуктов
    await knex('product_types').insert([
        { id: 1, code: 'PDS', name: 'Программа долгосрочных сбережений', description: 'ПДС - программа долгосрочных сбережений с государственным софинансированием', is_active: true, order_index: 1 },
        { id: 2, code: 'IIS', name: 'Индивидуальный инвестиционный счёт', description: 'ИИС - индивидуальный инвестиционный счёт с налоговыми льготами', is_active: true, order_index: 2 },
        { id: 3, code: 'ISZH', name: 'Инвестиционное страхование жизни', description: 'ИСЖ - инвестиционное страхование жизни', is_active: true, order_index: 3 },
        { id: 4, code: 'NSZH', name: 'Накопительное страхование жизни', description: 'НСЖ - накопительное страхование жизни', is_active: true, order_index: 4 },
        { id: 5, code: 'DEPOSIT', name: 'Банковский вклад', description: 'Банковский депозит', is_active: true, order_index: 5 },
        { id: 6, code: 'BOND', name: 'Облигации', description: 'Облигации', is_active: true, order_index: 6 },
        { id: 7, code: 'STOCK', name: 'Акции', description: 'Акции', is_active: true, order_index: 7 },
        { id: 8, code: 'FUND', name: 'Фонды', description: 'Инвестиционные фонды', is_active: true, order_index: 8 },
        { id: 9, code: 'OTHER', name: 'Прочее', description: 'Другие типы продуктов', is_active: true, order_index: 9 }
    ]);

    console.log('✅ Product types seed data inserted successfully!');
};








