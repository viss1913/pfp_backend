require('dotenv').config({ override: true });
const productRepository = require('../src/repositories/productRepository');
const knex = require('../src/config/database');

async function fixAndVerify() {
    console.log('--- Fixing Product Data via Repository ---');
    try {
        const productId = 3; // ПДС НПФ (из вашего скрина)

        // 1. Эмулируем данные, которые приходят с фронта Админки
        const yieldsFromAdmin = [
            {
                term_from_months: 0,
                term_to_months: 360,
                amount_from: 0,
                amount_to: 100000,
                yield_percent: 13
            },
            {
                term_from_months: 0,
                term_to_months: 360,
                amount_from: 100001,
                amount_to: 100000000000, // 100 млрд
                yield_percent: 15
            }
        ];

        // 2. Обновляем продукт через репозиторий (как это делает API)
        // Мы передаем yieldsData вторым аргументом, репозиторий сам запишет их в JSON lines
        await productRepository.update(productId, { name: 'ПДС НПФ (Updated)' }, yieldsFromAdmin);
        console.log('✅ Product updated via Repository.');

        // 3. Читаем обратно, чтобы убедиться, что маппинг работает
        const product = await productRepository.findById(productId);
        console.log('\n--- Reading back from Repository ---');
        console.log(`Product: ${product.name}`);
        console.log('Yields array (mapped):');
        console.log(JSON.stringify(product.yields, null, 2));

        if (product.yields && product.yields.length > 0) {
            console.log('\n🎉 SUCCESS: Data is stored correctly and Repository maps it correctly!');
        } else {
            console.log('\n⚠️ FAILURE: Yields are still empty.');
        }

    } catch (e) {
        console.error('Error:', e);
    } finally {
        await knex.destroy();
    }
}

fixAndVerify();
