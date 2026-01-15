const calculationService = require('../src/services/calculationService');

/**
 * Тест First Run с Life Insurance goal и интеграцией NSJ API
 */
async function testFirstRunWithLife() {
    console.log('\n=== ТЕСТ FIRST RUN С LIFE INSURANCE ===\n');

    const testData = {
        client: {
            birth_date: '1980-01-01',
            sex: 'male',
            avg_monthly_income: 150000,
            total_liquid_capital: 500000, // 500,000 руб ликвидного капитала
            ipk_current: null,
            assets: [] // Нет дополнительных активов
        },
        goals: [
            {
                goal_type_id: 5, // Life Insurance
                name: 'Страхование жизни НСЖ',
                target_amount: 2000000, // 2 млн руб
                term_months: 180, // 15 лет
                payment_variant: 12, // Ежемесячная оплата
                program: 'test' // Тестовая программа
            }
        ]
    };

    console.log('📋 Исходные данные:');
    console.log(`Ликвидный капитал клиента: ${testData.client.total_liquid_capital.toLocaleString('ru-RU')} руб`);
    console.log(`Цель: ${testData.goals[0].name}`);
    console.log(`Страховая сумма: ${testData.goals[0].target_amount.toLocaleString('ru-RU')} руб`);
    console.log(`Срок: ${testData.goals[0].term_months / 12} лет`);
    console.log(`Периодичность: ежемесячно\n`);

    try {
        console.log('🚀 Запуск First Run...\n');
        const result = await calculationService.calculateFirstRun(testData);

        console.log('\n✅ РЕЗУЛЬТАТ РАСЧЕТА:\n');
        console.log('='.repeat(60));

        // Общая информация
        console.log('📊 ОБЩАЯ СТАТИСТИКА:');
        console.log(`Количество целей: ${result.summary.goals_count}`);
        console.log(`Общий капитал на конец: ${result.summary.total_capital?.toLocaleString('ru-RU')} руб`);
        console.log('='.repeat(60));

        // Детали по Life Insurance
        const lifeGoal = result.goals[0];
        if (lifeGoal) {
            console.log('\n💼 LIFE INSURANCE GOAL:');
            console.log(`Название: ${lifeGoal.goal_name}`);
            console.log(`Статус: ${lifeGoal.summary?.status}`);
            console.log(`\n💰 Капитал:`);
            console.log(`  Initial Capital (выделено): ${lifeGoal.summary?.initial_capital?.toLocaleString('ru-RU')} руб`);
            console.log(`  Monthly Replenishment: ${lifeGoal.summary?.monthly_replenishment?.toLocaleString('ru-RU')} руб/мес`);
            console.log(`  Total Capital at End: ${lifeGoal.summary?.total_capital_at_end?.toLocaleString('ru-RU')} руб`);

            // NSJ API данные
            if (lifeGoal.nsj_calculation) {
                console.log(`\n📋 NSJ API РАСЧЕТ:`);
                console.log(`  Success: ${lifeGoal.nsj_calculation.success}`);
                console.log(`  Total Premium (весь контракт): ${lifeGoal.nsj_calculation.total_premium?.toLocaleString('ru-RU')} руб`);
                console.log(`  Total Limit: ${lifeGoal.nsj_calculation.total_limit?.toLocaleString('ru-RU')} руб`);
                console.log(`  Term Years: ${lifeGoal.nsj_calculation.term_years} лет`);

                if (lifeGoal.nsj_calculation.risks && lifeGoal.nsj_calculation.risks.length > 0) {
                    console.log(`\n  Риски:`);
                    lifeGoal.nsj_calculation.risks.forEach((risk, idx) => {
                        console.log(`    ${idx + 1}. ${risk.name}: ${risk.premium?.toLocaleString('ru-RU')} руб/мес`);
                    });
                }

                if (lifeGoal.nsj_calculation.warnings && lifeGoal.nsj_calculation.warnings.length > 0) {
                    console.log(`\n  ⚠️  Предупреждения:`);
                    lifeGoal.nsj_calculation.warnings.forEach(w => console.log(`    - ${w}`));
                }
            }

            // Портфель
            if (lifeGoal.details?.portfolio) {
                console.log(`\n📦 ПОРТФЕЛЬ:`);
                console.log(`  Название: ${lifeGoal.details.portfolio.name}`);
                if (lifeGoal.details.portfolio.instruments) {
                    lifeGoal.details.portfolio.instruments.forEach(inst => {
                        console.log(`    - ${inst.name}: ${inst.amount?.toLocaleString('ru-RU')} руб (${inst.share}%)`);
                    });
                }
            }

            // Налоговые вычеты
            if (lifeGoal.details && (lifeGoal.details.annual_premium || lifeGoal.details.tax_deduction_2026)) {
                console.log(`\n💵 НАЛОГОВЫЕ ВЫЧЕТЫ:`);
                if (lifeGoal.details.annual_premium) {
                    console.log(`  Годовая премия: ${lifeGoal.details.annual_premium?.toLocaleString('ru-RU')} руб`);
                }
                if (lifeGoal.details.tax_deduction_2026) {
                    console.log(`  Вычет за 2026: ${lifeGoal.details.tax_deduction_2026?.toLocaleString('ru-RU')} руб`);
                }
                if (lifeGoal.details.total_tax_deductions) {
                    console.log(`  Всего вычетов за 15 лет: ${lifeGoal.details.total_tax_deductions?.toLocaleString('ru-RU')} руб`);
                }
            }

            // Ошибки
            if (lifeGoal.error) {
                console.log(`\n❌ ОШИБКИ:`);
                console.log(`  ${lifeGoal.error}`);
            }
        }

        console.log('\n' + '='.repeat(60));

        // Проверки
        console.log('\n🔍 ПРОВЕРКИ:');
        const checks = [];

        if (lifeGoal?.summary?.initial_capital > 0) {
            checks.push('✅ Initial capital выделен');
        } else {
            checks.push('❌ Initial capital не выделен');
        }

        if (lifeGoal?.nsj_calculation) {
            checks.push('✅ NSJ API вызван');
        } else {
            checks.push('❌ NSJ API не вызван');
        }

        if (lifeGoal?.nsj_calculation?.success) {
            checks.push('✅ NSJ API вернул success=true');
        } else {
            checks.push('❌ NSJ API вернул ошибку');
        }

        if (lifeGoal?.summary?.monthly_replenishment > 0) {
            checks.push('✅ Monthly replenishment рассчитан');
        } else {
            checks.push('⚠️  Monthly replenishment = 0 (возможно единовременный платеж)');
        }

        checks.forEach(check => console.log(`  ${check}`));

        console.log('\n' + '='.repeat(60));

        // Налоговые вычеты Summary
        if (result.summary.tax_benefits_summary) {
            console.log('\n💰 СВОДКА НАЛОГОВЫХ ВЫЧЕТОВ:');
            const taxSummary = result.summary.tax_benefits_summary;

            if (taxSummary.pds_benefits) {
                console.log('\n  📊 ПДС (Софинансирование):');
                console.log(`    Вычет за 2026: ${taxSummary.pds_benefits.deduction_2026?.toLocaleString('ru-RU')} руб`);
                console.log(`    Всего вычетов: ${taxSummary.pds_benefits.total_deductions?.toLocaleString('ru-RU')} руб`);
                console.log(`    Софинансирование: ${taxSummary.pds_benefits.total_cofinancing?.toLocaleString('ru-RU')} руб`);
            }

            if (taxSummary.nsj_benefits) {
                console.log('\n  🛡️  НСЖ (Страхование жизни):');
                console.log(`    Годовая премия: ${taxSummary.nsj_benefits.annual_premium?.toLocaleString('ru-RU')} руб`);
                console.log(`    Вычет за 2026: ${taxSummary.nsj_benefits.deduction_2026?.toLocaleString('ru-RU')} руб`);
                console.log(`    Всего вычетов: ${taxSummary.nsj_benefits.total_deductions?.toLocaleString('ru-RU')} руб`);
            }

            if (taxSummary.totals) {
                console.log('\n  💵 ИТОГО:');
                console.log(`    Вычеты за 2026: ${taxSummary.totals.deduction_2026?.toLocaleString('ru-RU')} руб`);
                console.log(`    Всего вычетов: ${taxSummary.totals.total_deductions?.toLocaleString('ru-RU')} руб`);
                console.log(`    Всего господдержки: ${taxSummary.totals.total_state_benefits?.toLocaleString('ru-RU')} руб`);
            }
        }

        console.log('\n' + '='.repeat(60));
        console.log('\n✅ ТЕСТ ЗАВЕРШЕН УСПЕШНО!\n');

    } catch (error) {
        console.error('\n❌ ОШИБКА ПРИ РАСЧЕТЕ:');
        console.error('Message:', error.message);
        console.error('Stack:', error.stack);
        process.exit(1);
    }
}

// Запуск теста
testFirstRunWithLife();
