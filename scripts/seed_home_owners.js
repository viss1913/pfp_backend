const knex = require('../src/config/database');

async function seed() {
    console.log('🌱 Seeding Home Owners data...');

    try {
        // 1. Create Product
        const [productId] = await knex('insurance_home_owners_products').insert({
            name: 'Домашний уют (Базовый)',
            description: 'Комплексное страхование квартиры и ответственности перед соседями',
            is_active: true,
            rate_constructive: 0.0012,
            rate_finish: 0.0025,
            rate_property: 0.0035,
            rate_civil: 0.0010
        }).onConflict('name').merge({
            rate_constructive: 0.0012,
            rate_finish: 0.0025,
            rate_property: 0.0035,
            rate_civil: 0.0010
        });

        let finalProductId = productId;
        if (!finalProductId) {
            const product = await knex('insurance_home_owners_products').where('name', 'Домашний уют (Базовый)').first();
            finalProductId = product.id;
        }

        console.log(`✅ Product created/found ID: ${finalProductId}`);

        // 2. Clear existing tariffs for this product to avoid duplicates during re-seed
        await knex('insurance_home_owners_tariffs').where('product_id', finalProductId).delete();

        // 3. Insert Tariffs (Multipliers)
        const tariffs = [
            // Multipliers: Wall Material
            { product_id: finalProductId, parameter_name: 'wall_material', parameter_value: 'brick', coefficient: 1.0, label: 'Кирпич/Бетон', coefficient_type: 'multiplier' },
            { product_id: finalProductId, parameter_name: 'wall_material', parameter_value: 'wood', coefficient: 1.8, label: 'Дерево', coefficient_type: 'multiplier' },
            { product_id: finalProductId, parameter_name: 'wall_material', parameter_value: 'blocks', coefficient: 1.2, label: 'Пеноблоки/Газобетон', coefficient_type: 'multiplier' },

            // Multipliers: Security
            { product_id: finalProductId, parameter_name: 'security', parameter_value: 'alarm', coefficient: 0.9, label: 'Есть сигнализация', coefficient_type: 'multiplier' },
            { product_id: finalProductId, parameter_name: 'security', parameter_value: 'none', coefficient: 1.0, label: 'Нет охраны', coefficient_type: 'multiplier' },

            // Multipliers: For Rent
            { product_id: finalProductId, parameter_name: 'is_rented', parameter_value: 'yes', coefficient: 1.25, label: 'Сдается в аренду', coefficient_type: 'multiplier' },
            { product_id: finalProductId, parameter_name: 'is_rented', parameter_value: 'no', coefficient: 1.0, label: 'Для собственного проживания', coefficient_type: 'multiplier' }
        ];

        await knex('insurance_home_owners_tariffs').insert(tariffs);
        console.log('✅ Tariffs seeded successfully');

    } catch (error) {
        console.error('❌ Seeding failed:', error);
    } finally {
        await knex.destroy();
    }
}

seed();
