const constructorAiService = require('../src/services/constructorAiService');
const knex = require('../src/config/database');

async function testExtraction() {
    console.log('🧪 Testing Home Owners Calculation Flow...');

    // 1. Create a mock client and session
    const [clientId] = await knex('constructor_clients').insert({
        bot_id: 1, // Assuming bot 1 exists
        user_id: 'test_user_123',
        nickname: 'Tester'
    }).onConflict(['bot_id', 'user_id']).ignore();

    const client = await knex('constructor_clients').where({ user_id: 'test_user_123' }).first();

    const [sessionId] = await knex('constructor_sessions').insert({
        client_id: client.id
    });

    // 2. Insert mock logs (conversation history)
    await knex('constructor_logs').insert([
        {
            session_id: sessionId,
            input_text: 'Привет, я хочу застраховать квартиру',
            response_generated: 'Конечно! Какая стоимость отделки?'
        },
        {
            session_id: sessionId,
            input_text: 'Отделка на 500 000 руб',
            response_generated: 'Понял. А имущество на какую сумму?'
        },
        {
            session_id: sessionId,
            input_text: 'Имущество на 300 000, и ГО на миллион сделай',
            response_generated: 'Хорошо. Сейчас рассчитаю...'
        }
    ]);

    console.log('📝 Mock history inserted.');

    // 3. Test extraction
    const session = { id: sessionId, client_id: client.id };
    const params = await constructorAiService.extractHomeOwnersParams(session);
    console.log('🤖 Extracted Params:', params);

    // 4. Test full processMessage with /homeOwnersCalc
    // Note: This relies on the classifier correctly detecting /homeOwnersCalc 
    // or being at a state where it's the current command.
    // For testing we'll simulate the user message that triggers it.

    const response = await constructorAiService.processMessage(
        1,
        'test_user_123',
        'Tester',
        'Рассчитай пожалуйста'
    );

    console.log('💬 AI Response:\n', response);

    // Cleanup
    await knex('constructor_logs').where('session_id', sessionId).del();
    await knex('constructor_sessions').where('id', sessionId).del();
    await knex('constructor_clients').where('id', client.id).del();

    console.log('🧹 Cleanup done.');
    process.exit(0);
}

testExtraction().catch(err => {
    console.error('❌ Test failed:', err);
    process.exit(1);
});
