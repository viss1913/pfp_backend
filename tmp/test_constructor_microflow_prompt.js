const constructorAiService = require('../src/services/constructorAiService');
const knex = require('knex')(require('../knexfile').development);

async function ensureAgentAndBot() {
  const agentEmail = 'test_constructor_microflow@example.com';
  let agent = await knex('agents').join('users', 'agents.id', 'users.agent_id')
    .where('users.email', agentEmail)
    .select('agents.*')
    .first();

  // На некоторых БД таблица `agents` может быть заполнена без связанного `users` (агентские записи).
  if (!agent) {
    const [id] = await knex('agents').insert({
      first_name: 'Test',
      last_name: 'Microflow',
      email: agentEmail,
      about_text: 'Test agent for constructor microflow.',
      // В конструкторе brain-contexts фильтруются по project_id.
      // Поэтому для теста обязательно ставим project_id (берём существующий дефолтный 1).
      project_id: 1,
      is_active: true,
      created_at: knex.fn.now(),
      updated_at: knex.fn.now(),
    });
    agent = await knex('agents').where('id', id).first();
  }

  // Если бот/агент уже был создан раньше без project_id, подтянем для теста.
  if (!agent.project_id) {
    await knex('agents').where({ id: agent.id }).update({ project_id: 1, updated_at: knex.fn.now() });
    agent = await knex('agents').where({ id: agent.id }).first();
  }

  let bot = await knex('constructor_bots')
    .where('agent_id', agent.id)
    .orderBy('created_at', 'desc')
    .first();

  if (!bot) {
    const [id] = await knex('constructor_bots').insert({
      agent_id: agent.id,
      name: 'ConstructorMicroflowTestBot',
      token: 'mock_token',
      communication_style: 'Общайся кратко и по делу.',
      base_brain_context: 'Ты — финансовый консультант и помощник.',
      webhook_secret: null,
      bot_type: 'telegram',
      project_id: agent.project_id ?? 1,
    });

    bot = await knex('constructor_bots').where('id', id).first();
  }

  return { agent, bot };
}

async function upsertBrainContexts(projectId) {
  const ctxs = [
    { title: 'Ты Асоль', content: 'Ты Асоль.', is_active: true, priority: 100 },
    {
      title: '/startPFP по приветствию',
      content:
        'Если клиент написал приветствие (например: привет, здравствуйте), добавь отдельной строкой команду `/startPFP`.',
      is_active: true,
      priority: 90,
    },
    {
      title: 'Вопрос имени',
      content: 'Спроси как зовут клиента: «Как вас зовут?»',
      is_active: true,
      priority: 80,
    },
  ];

  for (const ctx of ctxs) {
    const found = await knex('constructor_brain_contexts').where({ project_id: projectId, title: ctx.title }).first();
    if (found) {
      await knex('constructor_brain_contexts').where({ id: found.id }).update(ctx);
    } else {
      await knex('constructor_brain_contexts').insert({ ...ctx, project_id: projectId });
    }
  }
}

async function upsertCommands(bot) {
  const cmds = [
    {
      command: '/start',
      section: 'start',
      is_template: false,
      classifier:
        'Если пользователь после вопроса об имени называет своё имя (например: «меня зовут …», «я …») — переключи на /startPFP. Иначе оставайся на /start.',
      response:
        'Следуй строго инструкциям из brain-contexts для стадии начала диалога (главный контекст, инструкция про /startPFP при приветствии и вопрос про имя).',
    },
    {
      command: '/startPFP',
      section: 'start',
      is_template: false,
      classifier:
        'Оставайся на /startPFP после получения имени и дай следующий шаг. Если имя ещё не получено — повторно спроси имя.',
      response:
        'Если имя уже известно — поприветствуй и скажи, что дальше сделаем консультацию. Если имени нет — повторно спроси: «Как вас зовут?»',
    },
  ];

  for (const cmd of cmds) {
    const found = await knex('constructor_commands').where({ bot_id: bot.id, command: cmd.command }).first();
    const payload = {
      ...cmd,
      bot_id: bot.id,
      project_id: bot.project_id ?? null,
    };

    if (found) {
      await knex('constructor_commands').where({ id: found.id }).update(payload);
    } else {
      await knex('constructor_commands').insert(payload);
    }
  }
}

async function run() {
  const { bot } = await ensureAgentAndBot();
  if (!bot.project_id) {
    console.error('Bot has no project_id; cannot upsert brain_contexts.');
    return;
  }

  await upsertBrainContexts(bot.project_id);
  await upsertCommands(bot);

  const userId = 'test_user_microflow';
  const nickname = 'SashaTest';

  console.log('\n--- Send: "Привет" ---');
  const r1 = await constructorAiService.processMessage(bot.id, userId, nickname, 'Привет');
  console.log('AI:', typeof r1 === 'string' ? r1 : r1.text || JSON.stringify(r1));

  console.log('\n--- Send: "Меня зовут Александр" ---');
  const r2 = await constructorAiService.processMessage(bot.id, userId, nickname, 'Меня зовут Александр');
  console.log('AI:', typeof r2 === 'string' ? r2 : r2.text || JSON.stringify(r2));
}

run()
  .then(() => knex.destroy())
  .catch(async (e) => {
    console.error('Test failed:', e.message);
    await knex.destroy();
  });

