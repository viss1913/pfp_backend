/**
 * Миграция для реорганизации структуры линий продукта
 * - Переносим данные из product_yields в JSON поле lines внутри products
 * - Изменяем названия полей: term_from_months -> min_term_months, term_to_months -> max_term_months, amount_from -> min_amount, amount_to -> max_amount
 * - Удаляем поля min_term_months, max_term_months, min_amount, max_amount из таблицы products
 * - Удаляем таблицу product_yields
 * 
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex.schema
        // 1. Добавляем JSON поле lines в products
        .table('products', (table) => {
            table.json('lines').nullable();
        })
        // 2. Переносим данные из product_yields в JSON поле lines (если таблица существует)
        .then(async () => {
            // Проверяем, существует ли таблица product_yields
            const hasTable = await knex.schema.hasTable('product_yields');
            
            if (hasTable) {
                // Получаем все продукты с их yields
                const products = await knex('products').select('id');
                
                for (const product of products) {
                    const yields = await knex('product_yields')
                        .where('product_id', product.id)
                        .select('term_from_months', 'term_to_months', 'amount_from', 'amount_to', 'yield_percent');
                    
                    // Преобразуем в новый формат с переименованием полей
                    const lines = yields.map(y => ({
                        min_term_months: y.term_from_months,
                        max_term_months: y.term_to_months,
                        min_amount: parseFloat(y.amount_from),
                        max_amount: parseFloat(y.amount_to),
                        yield_percent: parseFloat(y.yield_percent)
                    }));
                    
                    // Обновляем продукт с JSON данными
                    await knex('products')
                        .where('id', product.id)
                        .update({ lines: JSON.stringify(lines) });
                }
            }
        })
        // 3. Удаляем поля из таблицы products (если они еще есть)
        .then(async () => {
            try {
                await knex.schema.table('products', (table) => {
                    table.dropColumn('min_term_months');
                    table.dropColumn('max_term_months');
                    table.dropColumn('min_amount');
                    table.dropColumn('max_amount');
                });
            } catch (err) {
                // Игнорируем ошибку, если колонок уже нет (новая установка)
                if (!err.message.includes('Unknown column')) {
                    throw err;
                }
            }
        })
        // 4. Удаляем старую таблицу product_yields
        .then(() => {
            return knex.schema.dropTableIfExists('product_yields');
        });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex.schema
        // 1. Создаем обратно product_yields
        .createTable('product_yields', (table) => {
            table.bigIncrements('id').primary();
            table.bigInteger('product_id').unsigned().notNullable()
                .references('id').inTable('products').onDelete('CASCADE');
            table.integer('term_from_months').notNullable();
            table.integer('term_to_months').notNullable();
            table.decimal('amount_from', 18, 2).notNullable();
            table.decimal('amount_to', 18, 2).notNullable();
            table.decimal('yield_percent', 5, 2).notNullable();
        })
        // 2. Восстанавливаем данные из JSON поля lines обратно в product_yields
        .then(async () => {
            const products = await knex('products').whereNotNull('lines').select('id', 'lines');
            
            for (const product of products) {
                const lines = typeof product.lines === 'string' ? JSON.parse(product.lines) : product.lines;
                
                if (Array.isArray(lines)) {
                    const yields = lines.map(line => ({
                        product_id: product.id,
                        term_from_months: line.min_term_months,
                        term_to_months: line.max_term_months,
                        amount_from: line.min_amount,
                        amount_to: line.max_amount,
                        yield_percent: line.yield_percent
                    }));
                    
                    if (yields.length > 0) {
                        await knex('product_yields').insert(yields);
                    }
                }
            }
        })
        // 3. Удаляем JSON поле lines из products
        .then(() => {
            return knex.schema.table('products', (table) => {
                table.dropColumn('lines');
            });
        });
};

