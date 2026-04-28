/**
 * Идемпотентная миграция: безопасна при повторном запуске и если таблицы
 * уже созданы частичным прогоном (до записи в knex_migrations).
 *
 * @param { import("knex").Knex } knex
 */
exports.up = async function (knex) {
    const isIgnorableCreateError = (err) => {
        const code = err?.code || err?.errno;
        return code === 'ER_TABLE_EXISTS_ERROR' || code === 1050;
    };
    const isIgnorableAddColumnError = (err) => {
        const code = err?.code || err?.errno;
        return code === 'ER_DUP_FIELDNAME' || code === 1060;
    };

    const safeCreateTable = async (name, builder) => {
        try {
            await knex.schema.createTable(name, builder);
        } catch (err) {
            if (!isIgnorableCreateError(err)) throw err;
        }
    };

    const safeAddColumn = async (tableName, callback) => {
        try {
            await knex.schema.table(tableName, callback);
        } catch (err) {
            if (!isIgnorableAddColumnError(err)) throw err;
        }
    };

    const hasVersions = await knex.schema.hasTable('risk_questionnaire_versions');
    if (!hasVersions) {
        await safeCreateTable('risk_questionnaire_versions', (table) => {
            table.bigIncrements('id').primary();
            table.string('code', 64).notNullable();
            table.string('name', 255).notNullable();
            table.text('description').nullable();
            table.bigInteger('project_id').unsigned().nullable()
                .references('id').inTable('projects').onDelete('CASCADE');
            table.boolean('is_active').notNullable().defaultTo(true);
            table.timestamps(true, true);
            table.unique(['code', 'project_id'], 'risk_questionnaire_versions_code_project_uidx');
        });
    }

    const hasQuestions = await knex.schema.hasTable('risk_questions');
    if (!hasQuestions) {
        await safeCreateTable('risk_questions', (table) => {
            table.bigIncrements('id').primary();
            table.bigInteger('questionnaire_version_id').unsigned().notNullable()
                .references('id').inTable('risk_questionnaire_versions').onDelete('CASCADE');
            table.string('code', 64).notNullable();
            table.string('title', 512).notNullable();
            table.text('description').nullable();
            table.text('help_text').nullable();
            table.string('category', 64).notNullable().defaultTo('BEHAVIOR');
            table.integer('sort_order').notNullable().defaultTo(0);
            table.boolean('is_active').notNullable().defaultTo(true);
            table.timestamps(true, true);
            table.unique(['questionnaire_version_id', 'code'], 'risk_questions_version_code_uidx');
        });
    }

    const hasOptions = await knex.schema.hasTable('risk_answer_options');
    if (!hasOptions) {
        await safeCreateTable('risk_answer_options', (table) => {
            table.bigIncrements('id').primary();
            table.bigInteger('question_id').unsigned().notNullable()
                .references('id').inTable('risk_questions').onDelete('CASCADE');
            table.string('code', 64).notNullable();
            table.string('label', 1024).notNullable();
            table.decimal('score', 6, 3).notNullable();
            table.integer('sort_order').notNullable().defaultTo(0);
            table.boolean('is_default').notNullable().defaultTo(false);
            table.timestamps(true, true);
            table.unique(['question_id', 'code'], 'risk_answer_options_question_code_uidx');
        });
    }

    const hasRules = await knex.schema.hasTable('risk_scoring_rules');
    if (!hasRules) {
        await safeCreateTable('risk_scoring_rules', (table) => {
            table.bigIncrements('id').primary();
            table.bigInteger('questionnaire_version_id').unsigned().notNullable()
                .references('id').inTable('risk_questionnaire_versions').onDelete('CASCADE');
            table.string('rule_key', 128).notNullable();
            table.json('rule_value').notNullable();
            table.boolean('is_active').notNullable().defaultTo(true);
            table.timestamps(true, true);
            table.unique(['questionnaire_version_id', 'rule_key'], 'risk_scoring_rules_version_key_uidx');
        });
    }

    const hasColVersion = await knex.schema.hasColumn('clients', 'risk_questionnaire_version_id');
    if (!hasColVersion) {
        await safeAddColumn('clients', (table) => {
            table.bigInteger('risk_questionnaire_version_id').unsigned().nullable()
                .references('id').inTable('risk_questionnaire_versions').onDelete('SET NULL');
        });
    }

    const hasColResult = await knex.schema.hasColumn('clients', 'risk_profile_result');
    if (!hasColResult) {
        await safeAddColumn('clients', (table) => {
            table.json('risk_profile_result').nullable();
        });
    }

    let versionRow = await knex('risk_questionnaire_versions')
        .where({ code: 'finam-risk-v1' })
        .whereNull('project_id')
        .first();

    if (!versionRow) {
        await knex('risk_questionnaire_versions').insert({
            code: 'finam-risk-v1',
            name: 'Финам риск-профиль v1',
            description: 'BaseScore + BehaviorScore методика для целей финплана.',
            project_id: null,
            is_active: true
        });
        versionRow = await knex('risk_questionnaire_versions')
            .where({ code: 'finam-risk-v1' })
            .whereNull('project_id')
            .first();
    }

    const versionId = versionRow.id;

    const [cntRow] = await knex('risk_questions')
        .where({ questionnaire_version_id: versionId })
        .count('* as cnt');
    const qCount = Number(cntRow?.cnt ?? Object.values(cntRow || {})[0] ?? 0);
    if (qCount > 0) {
        return;
    }

    const questions = [
        {
            code: 'drawdown_reaction',
            title: 'Если стоимость портфеля временно снизится на 20%, какая реакция будет наиболее вероятной?',
            description: 'Оценивает устойчивость к краткосрочным просадкам.',
            help_text: 'Нужен для оценки риска панических действий при волатильности.'
        },
        {
            code: 'uncertainty_attitude',
            title: 'Как клиент обычно относится к ситуациям, где результат заранее неясен, но потенциально выгоден?',
            description: 'Показывает отношение к неопределенности.',
            help_text: 'Помогает подобрать риск так, чтобы стратегия была психологически переносимой.'
        },
        {
            code: 'investment_success_benchmark',
            title: 'Что для клиента важнее всего при оценке успеха портфеля?',
            description: 'Фиксирует приоритет: рост, баланс или сохранность.',
            help_text: 'Нужно для согласования ожидаемой доходности и допустимых колебаний.'
        },
        {
            code: 'social_comparison_reaction',
            title: 'Если знакомые или медиа сообщают о более высокой доходности других стратегий, что происходит чаще всего?',
            description: 'Измеряет склонность к импульсивным сменам стратегии.',
            help_text: 'Снижает риск FOMO-решений в неподходящий момент.'
        },
        {
            code: 'management_involvement',
            title: 'Какой формат управления портфелем кажется наиболее комфортным?',
            description: 'Показывает комфортный уровень вовлеченности.',
            help_text: 'Нужно для выбора стратегии, которую клиент сможет дисциплинированно удерживать.'
        },
        {
            code: 'calmness_tradeoff',
            title: 'Готов ли клиент отказаться от части потенциальной доходности ради большей предсказуемости результата?',
            description: 'Определяет ценность предсказуемости относительно доходности.',
            help_text: 'Позволяет отстроить баланс доходности и стабильности.'
        },
        {
            code: 'post_loss_behavior',
            title: 'Если выбранная инвестиционная идея оказывается неудачной, какая реакция ближе всего клиенту?',
            description: 'Показывает поведение после ошибки или убытка.',
            help_text: 'Критично для оценки устойчивости стратегии в стресс-сценариях.'
        }
    ];

    const optionLabels = [
        '1 балл — выраженная склонность к риску',
        '2 балла — умеренная склонность к риску',
        '3 балла — умеренная потребность в защите',
        '4 балла — высокая потребность в защите и предсказуемости'
    ];

    for (let i = 0; i < questions.length; i += 1) {
        const q = questions[i];
        const [questionId] = await knex('risk_questions').insert({
            questionnaire_version_id: versionId,
            code: q.code,
            title: q.title,
            description: q.description,
            help_text: q.help_text,
            category: 'BEHAVIOR',
            sort_order: i + 1,
            is_active: true
        });

        for (let score = 1; score <= 4; score += 1) {
            await knex('risk_answer_options').insert({
                question_id: questionId,
                code: `a${score}`,
                label: optionLabels[score - 1],
                score,
                sort_order: score,
                is_default: score === 2
            });
        }
    }

    const rulesExist = await knex('risk_scoring_rules')
        .where({ questionnaire_version_id: versionId, rule_key: 'base_weights' })
        .first();
    if (!rulesExist) {
        await knex('risk_scoring_rules').insert([
            {
                questionnaire_version_id: versionId,
                rule_key: 'base_weights',
                rule_value: {
                    term: 0.30,
                    debt: 0.20,
                    free_cash_flow: 0.15,
                    reserve: 0.15,
                    housing: 0.10,
                    dependents: 0.05,
                    income_stability: 0.05
                },
                is_active: true
            },
            {
                questionnaire_version_id: versionId,
                rule_key: 'behavior_coefficient_formula',
                rule_value: { formula: '1.25 - 0.20 * (BehaviorScore - 1)', min: 0.65, max: 1.25 },
                is_active: true
            },
            {
                questionnaire_version_id: versionId,
                rule_key: 'final_score_ranges',
                rule_value: [
                    { from: 1.0, to: 1.8, label: 'CONSERVATIVE' },
                    { from: 1.9, to: 2.6, label: 'MODERATELY_CONSERVATIVE' },
                    { from: 2.7, to: 3.4, label: 'BALANCED' },
                    { from: 3.5, to: 4.2, label: 'MODERATELY_AGGRESSIVE' },
                    { from: 4.3, to: 5.0, label: 'AGGRESSIVE' }
                ],
                is_active: true
            }
        ]);
    }
};

/**
 * @param { import("knex").Knex } knex
 */
exports.down = async function (knex) {
    if (await knex.schema.hasColumn('clients', 'risk_profile_result')) {
        await knex.schema.table('clients', (table) => {
            table.dropColumn('risk_profile_result');
        });
    }
    if (await knex.schema.hasColumn('clients', 'risk_questionnaire_version_id')) {
        await knex.schema.table('clients', (table) => {
            table.dropColumn('risk_questionnaire_version_id');
        });
    }

    await knex.schema.dropTableIfExists('risk_scoring_rules');
    await knex.schema.dropTableIfExists('risk_answer_options');
    await knex.schema.dropTableIfExists('risk_questions');
    await knex.schema.dropTableIfExists('risk_questionnaire_versions');
};
