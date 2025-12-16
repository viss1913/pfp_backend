const db = require('./src/config/database');

async function checkPortfolioClasses(portfolioId) {
    try {
        console.log('🔍 Проверка classes в БД для портфеля ID=' + portfolioId);
        console.log('='.repeat(60));

        // Проверяем, существует ли таблица portfolio_class_links
        const tableExists = await db.schema.hasTable('portfolio_class_links');
        console.log(`\n📊 Таблица portfolio_class_links существует: ${tableExists ? '✅ ДА' : '❌ НЕТ'}`);

        if (tableExists) {
            // Получаем все связи для этого портфеля
            const classLinks = await db('portfolio_class_links')
                .where('portfolio_id', portfolioId)
                .select('*');
            
            console.log(`\n🔗 Связи в portfolio_class_links (${classLinks.length} записей):`);
            if (classLinks.length > 0) {
                for (const link of classLinks) {
                    // Получаем информацию о классе
                    const classInfo = await db('portfolio_classes')
                        .where('id', link.class_id)
                        .first();
                    
                    console.log(`   - ID связи: ${link.id}`);
                    console.log(`     portfolio_id: ${link.portfolio_id}`);
                    console.log(`     class_id: ${link.class_id}`);
                    console.log(`     Класс: ${classInfo?.name || 'unknown'} (${classInfo?.code || 'unknown'})`);
                    console.log('');
                }
            } else {
                console.log('   (нет связей)');
            }
        } else {
            console.log('\n⚠️  Таблица portfolio_class_links не существует!');
            console.log('   Проверяем JSON поле classes в таблице portfolios...');
            
            const portfolio = await db('portfolios')
                .where('id', portfolioId)
                .first();
            
            if (portfolio && portfolio.classes) {
                let classesData;
                try {
                    classesData = typeof portfolio.classes === 'string' 
                        ? JSON.parse(portfolio.classes) 
                        : portfolio.classes;
                    console.log(`\n📦 Classes в JSON поле:`, JSON.stringify(classesData, null, 2));
                } catch (e) {
                    console.log(`\n❌ Ошибка парсинга JSON: ${e.message}`);
                }
            } else {
                console.log('\n   (поле classes пустое или null)');
            }
        }

        // Также проверим сам портфель
        console.log('\n' + '='.repeat(60));
        console.log('📋 Информация о портфеле:');
        console.log('='.repeat(60));
        
        const portfolio = await db('portfolios')
            .where('id', portfolioId)
            .first();
        
        if (portfolio) {
            console.log(`   ID: ${portfolio.id}`);
            console.log(`   Название: ${portfolio.name}`);
            console.log(`   Обновлен: ${portfolio.updated_at}`);
        } else {
            console.log('   ❌ Портфель не найден!');
        }

        // Получаем все доступные классы
        console.log('\n' + '='.repeat(60));
        console.log('📚 Все доступные классы портфелей:');
        console.log('='.repeat(60));
        
        const allClasses = await db('portfolio_classes').select('*');
        console.log(`\nВсего классов: ${allClasses.length}`);
        for (const cls of allClasses) {
            console.log(`   - ID: ${cls.id}, Код: ${cls.code}, Название: ${cls.name}`);
        }

        await db.destroy();
        console.log('\n✅ Проверка завершена');

    } catch (error) {
        console.error('\n❌ Ошибка:', error.message);
        if (error.code) {
            console.error(`   Код ошибки: ${error.code}`);
        }
        if (error.stack) {
            console.error('\nStack trace:');
            console.error(error.stack);
        }
        await db.destroy();
        process.exit(1);
    }
}

// Получаем ID портфеля из аргументов или используем 1 по умолчанию
const portfolioId = process.argv[2] ? parseInt(process.argv[2]) : 1;

checkPortfolioClasses(portfolioId);


