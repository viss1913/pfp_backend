/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex('constructor_commands').insert([
        {
            command: '/start',
            section: 'Обучение',
            is_template: true,
            classifier: 'Пользователь только что запустил бота или написал "привет/старт". Включи эту стадию для приветствия и объяснения возможностей.',
            response: 'Приветствуй пользователя максимально вежливо. Представься как ИИ-помощник финансового консультанта. Скажи, что ты можешь помочь с расчетом страховки квартиры или ответить на общие вопросы по финансовому планированию.'
        },
        {
            command: '/homeOwnersCalc',
            section: 'Расчеты',
            is_template: true,
            classifier: 'Пользователь предоставил параметры для расчета страховки квартиры (отделка, имущество, гражданская ответственность) или явно попросил "рассчитай", "сколько стоит страховка".',
            response: 'Ты получил данные для расчета. Сейчас я подготовлю для тебя детальный PDF-отчет с расчетом. Пожалуйста, подожди секунду...'
        },
        {
            command: '/support',
            section: 'Помощь',
            is_template: true,
            classifier: 'Пользователь просит позвать человека, жалуется на ошибку или задает вопрос, на который ты не знаешь ответа.',
            response: 'Скажи, что ты — ИИ, но ты можешь передать информацию менеджеру. Попроси пользователя оставить свой номер телефона или дождаться ответа в этом чате.'
        }
    ]);
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex('constructor_commands')
        .whereIn('command', ['/start', '/homeOwnersCalc', '/support'])
        .andWhere('is_template', true)
        .del();
};
