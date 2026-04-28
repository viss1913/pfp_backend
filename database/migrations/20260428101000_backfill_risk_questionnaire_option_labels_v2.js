/**
 * Backfill человекочитаемых текстов вариантов для анкеты finam-risk-v1.
 *
 * @param { import("knex").Knex } knex
 */
exports.up = async function (knex) {
    const labelsByQuestionCode = {
        drawdown_reaction: {
            a1: 'Это нормальная часть рынка; вероятно, будут куплены активы по более низким ценам.',
            a2: 'Возникнет дискомфорт, но стратегия, скорее всего, будет сохранена.',
            a3: 'Появится сильное желание сократить риск и перевести часть средств в защитные инструменты.',
            a4: 'Возникнет желание как можно быстрее выйти из рискованных активов.'
        },
        uncertainty_attitude: {
            a1: 'Неопределенность воспринимается как возможность для роста.',
            a2: 'Неопределенность принимается, если есть понятный план действий.',
            a3: 'Неопределенность переносится тяжело, даже если выгода выглядит разумной.',
            a4: 'Предпочтение почти всегда отдается предсказуемому результату, даже при более низкой доходности.'
        },
        investment_success_benchmark: {
            a1: 'Максимально возможная доходность и шанс обогнать рынок.',
            a2: 'Рост капитала выше инфляции при принятии заметных колебаний.',
            a3: 'Достижение личной финансовой цели без излишнего стресса.',
            a4: 'Сохранность капитала и спокойствие важнее, чем потенциально высокая доходность.'
        },
        social_comparison_reaction: {
            a1: 'Возникает желание быстро изменить стратегию и догнать результат.',
            a2: 'Интерес к пересмотру стратегии появляется, но решения принимаются не сразу.',
            a3: 'Сравнение неприятно, но собственная стратегия важнее чужих результатов.',
            a4: 'Чужие результаты почти не влияют; важнее соответствие портфеля своим целям.'
        },
        management_involvement: {
            a1: 'Активное участие, самостоятельные решения, готовность менять структуру портфеля.',
            a2: 'Периодический пересмотр и участие в ключевых решениях.',
            a3: 'Следование заранее согласованной стратегии с редкими корректировками.',
            a4: 'Максимально спокойный режим, где изменения происходят по заранее установленным правилам.'
        },
        calmness_tradeoff: {
            a1: 'Нет, приоритет — использовать максимум возможностей роста.',
            a2: 'Лишь в ограниченной степени.',
            a3: 'Да, если это заметно снижает вероятность сильной просадки.',
            a4: 'Да, спокойствие и понятность структуры портфеля имеют высокий приоритет.'
        },
        post_loss_behavior: {
            a1: 'Готовность быстро принять новый риск и компенсировать потери.',
            a2: 'Анализ ошибки и поиск нового решения с сохранением общей склонности к риску.',
            a3: 'После ошибки хочется действовать осторожнее и снижать риск.',
            a4: 'После ошибки надолго пропадает готовность принимать существенные колебания капитала.'
        }
    };

    const versionRows = await knex('risk_questionnaire_versions')
        .select('id')
        .where({ code: 'finam-risk-v1' });

    if (!Array.isArray(versionRows) || versionRows.length === 0) return;

    const versionIds = versionRows.map((row) => row.id);
    const questionCodes = Object.keys(labelsByQuestionCode);

    const questions = await knex('risk_questions')
        .select('id', 'code')
        .whereIn('questionnaire_version_id', versionIds)
        .whereIn('code', questionCodes);

    if (!Array.isArray(questions) || questions.length === 0) return;

    const questionIdToCode = new Map(questions.map((q) => [q.id, q.code]));
    const questionIds = questions.map((q) => q.id);

    const options = await knex('risk_answer_options')
        .select('id', 'question_id', 'code', 'sort_order', 'label')
        .whereIn('question_id', questionIds);

    for (const option of options) {
        const questionCode = questionIdToCode.get(option.question_id);
        const questionLabels = labelsByQuestionCode[questionCode];
        if (!questionLabels) continue;

        const fallbackCode = `a${Number(option.sort_order)}`;
        const nextLabel = questionLabels[option.code] || questionLabels[fallbackCode];
        if (!nextLabel || option.label === nextLabel) continue;

        await knex('risk_answer_options')
            .where({ id: option.id })
            .update({ label: nextLabel });
    }
};

/**
 * @param { import("knex").Knex } knex
 */
exports.down = async function (knex) {
    const defaultLabels = {
        a1: '1 балл — выраженная склонность к риску',
        a2: '2 балла — умеренная склонность к риску',
        a3: '3 балла — умеренная потребность в защите',
        a4: '4 балла — высокая потребность в защите и предсказуемости'
    };

    const versionRows = await knex('risk_questionnaire_versions')
        .select('id')
        .where({ code: 'finam-risk-v1' });

    if (!Array.isArray(versionRows) || versionRows.length === 0) return;
    const versionIds = versionRows.map((row) => row.id);

    const questions = await knex('risk_questions')
        .select('id')
        .whereIn('questionnaire_version_id', versionIds);
    if (!Array.isArray(questions) || questions.length === 0) return;

    const questionIds = questions.map((q) => q.id);
    const options = await knex('risk_answer_options')
        .select('id', 'code', 'sort_order', 'label')
        .whereIn('question_id', questionIds);

    for (const option of options) {
        const fallbackCode = `a${Number(option.sort_order)}`;
        const nextLabel = defaultLabels[option.code] || defaultLabels[fallbackCode];
        if (!nextLabel || option.label === nextLabel) continue;

        await knex('risk_answer_options')
            .where({ id: option.id })
            .update({ label: nextLabel });
    }
};
