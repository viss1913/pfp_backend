/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
    // 1. Создаем дефолтный проект
    const [projectId] = await knex('projects').insert({
        name: 'Основной проект',
        slug: 'default',
        public_key: 'pk_default_pfp_2026',
        status: 'active',
        created_at: new Date(),
        updated_at: new Date()
    }).returning('id');

    const id = typeof projectId === 'object' ? projectId.id : projectId;

    // 2. Привязываем существующих пользователей
    await knex('users').whereNull('project_id').update({ project_id: id });

    // 3. Привязываем агентов
    await knex('agents').whereNull('project_id').update({ project_id: id });

    // 4. Привязываем клиентов
    await knex('clients').whereNull('project_id').update({ project_id: id });

    // 5. Привязываем продукты и типы продуктов
    await knex('products').whereNull('project_id').update({ project_id: id });
    await knex('product_types').whereNull('project_id').update({ project_id: id });

    // 6. Привязываем ботов-конструктора
    if (await knex.schema.hasTable('constructor_bots')) {
        await knex('constructor_bots').whereNull('project_id').update({ project_id: id });
    }

    // 7. Привязываем классы портфелей
    await knex('portfolio_classes').whereNull('project_id').update({ project_id: id });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    // One-way migration
};
