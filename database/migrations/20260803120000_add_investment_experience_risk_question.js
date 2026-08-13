/**
 * Добавляет 8-й поведенческий вопрос investment_experience в finam-risk-v1.
 *
 * @param { import("knex").Knex } knex
 */
exports.up = async function (knex) {
    const versionRows = await knex('risk_questionnaire_versions')
        .select('id')
        .where({ code: 'finam-risk-v1' });

    if (!Array.isArray(versionRows) || versionRows.length === 0) return;

    const optionLabels = {
        a1: 'Продвинутый: есть самостоятельный опыт инвестиций в разные инструменты и понимание рыночных рисков.',
        a2: 'Средний: есть практика инвестиций, но без глубокого опыта сложных инструментов.',
        a3: 'Небольшой: ограниченный опыт с базовыми инструментами (депозит, фонды, ИИС).',
        a4: 'Нет опыта: ранее почти не инвестировал или только начинает.'
    };

    for (const version of versionRows) {
        const existing = await knex('risk_questions')
            .where({
                questionnaire_version_id: version.id,
                code: 'investment_experience'
            })
            .first();
        if (existing) continue;

        const [questionId] = await knex('risk_questions').insert({
            questionnaire_version_id: version.id,
            code: 'investment_experience',
            title: 'Какой у клиента опыт инвестирования?',
            description: 'Оценивает практический опыт инвестирования клиента.',
            help_text: 'Низкий опыт усиливает потребность в защите и снижает допустимый риск портфеля.',
            category: 'BEHAVIOR',
            sort_order: 8,
            is_active: true
        });

        for (let score = 1; score <= 4; score += 1) {
            const code = `a${score}`;
            await knex('risk_answer_options').insert({
                question_id: questionId,
                code,
                label: optionLabels[code],
                score,
                sort_order: score,
                is_default: score === 2
            });
        }
    }
};

/**
 * @param { import("knex").Knex } knex
 */
exports.down = async function (knex) {
    const versionRows = await knex('risk_questionnaire_versions')
        .select('id')
        .where({ code: 'finam-risk-v1' });

    if (!Array.isArray(versionRows) || versionRows.length === 0) return;
    const versionIds = versionRows.map((row) => row.id);

    const questions = await knex('risk_questions')
        .select('id')
        .whereIn('questionnaire_version_id', versionIds)
        .andWhere({ code: 'investment_experience' });

    if (!Array.isArray(questions) || questions.length === 0) return;
    const questionIds = questions.map((q) => q.id);

    await knex('risk_answer_options').whereIn('question_id', questionIds).del();
    await knex('risk_questions').whereIn('id', questionIds).del();
};
