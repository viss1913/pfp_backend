const knex = require('knex')(require('../knexfile').development);
const constructorAiService = require('../src/services/constructorAiService');

const AGENT_EMAIL = process.env.PFP_AGENT_EMAIL;
if (!AGENT_EMAIL) {
  console.error('Missing env var: PFP_AGENT_EMAIL');
  process.exit(1);
}

async function main() {
  // 1) Находим агента/проект по email пользователя
  const user = await knex('users')
    .leftJoin('agents', 'users.agent_id', 'agents.id')
    .where({ 'users.email': AGENT_EMAIL, 'users.is_active': true })
    .select(
      'users.id as user_id',
      'users.role',
      'agents.id as agent_id',
      'agents.project_id as project_id',
      'agents.uuid as agent_uuid'
    )
    .first();

  if (!user) {
    console.error('Agent/user not found in DB for email:', AGENT_EMAIL);
    process.exit(2);
  }

  const { agent_id, project_id } = user;
  console.log('Found:', { user_id: user.user_id, role: user.role, agent_id, project_id });

  // 2) Находим бота в таблице constructor_bots
  const bot = await knex('constructor_bots')
    .where({ agent_id })
    .orderBy('created_at', 'desc')
    .first();

  if (!bot) {
    console.error('No constructor bot found for agent_id:', agent_id);
    process.exit(3);
  }

  console.log('Bot:', { id: bot.id, bot_type: bot.bot_type, project_id: bot.project_id });

  // 3) Brain contexts upsert (constructor_brain_contexts)
  const brainContexts = [
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

  for (const ctx of brainContexts) {
    const found = await knex('constructor_brain_contexts')
      .where({ project_id: bot.project_id, title: ctx.title })
      .first();

    if (found) {
      await knex('constructor_brain_contexts')
        .where({ id: found.id })
        .update({ ...ctx });
      console.log('Updated brain:', ctx.title);
    } else {
      await knex('constructor_brain_contexts').insert({
        project_id: bot.project_id,
        title: ctx.title,
        content: ctx.content,
        is_active: ctx.is_active,
        priority: ctx.priority,
      });
      console.log('Inserted brain:', ctx.title);
    }
  }

  // 4) Commands upsert (constructor_commands)
  const startCmd = {
    command: '/start',
    section: 'start',
    is_template: false,
    classifier:
      'Если пользователь после вопроса об имени называет своё имя (например: «меня зовут …», «я …») — переключи на /startPFP. Иначе оставайся на /start.',
    response:
      'Следуй строго инструкциям из brain-contexts для стадии начала диалога (главный контекст, инструкция про /startPFP при приветствии и вопрос про имя).',
  };

  const startPfpCmd = {
    command: '/startPFP',
    section: 'start',
    is_template: false,
    classifier:
      'Оставайся на /startPFP после получения имени и дай следующий шаг. Если имя ещё не получено — повторно спроси имя.',
    response:
      'Если имя уже известно — поприветствуй и скажи, что дальше сделаем консультацию. Если имя не известно — повторно спроси: «Как вас зовут?»',
  };

  const commands = [startCmd, startPfpCmd];

  for (const cmd of commands) {
    const found = await knex('constructor_commands')
      .where({ bot_id: bot.id, command: cmd.command })
      .first();

    if (found) {
      await knex('constructor_commands')
        .where({ id: found.id })
        .update({
          ...cmd,
          bot_id: bot.id,
          project_id: bot.project_id,
        });
      console.log('Updated command:', cmd.command);
    } else {
      await knex('constructor_commands').insert({
        ...cmd,
        bot_id: bot.id,
        project_id: bot.project_id,
      });
      console.log('Inserted command:', cmd.command);
    }
  }

  console.log('OK: microflow upserted in DB.');

  // 5) Быстрый локальный тест (AI требует OPENROUTER_API_KEY)
  // Если ключей нет — просто скажем, что вставка ок, но AI не прогнали.
  try {
    const userId = 'test_user_microflow';
    const nickname = 'SashaTest';

    console.log('\n--- Test 1: user says greeting ---');
    const resp1 = await constructorAiService.processMessage(bot.id, userId, nickname, 'Привет');
    console.log('AI response 1:', typeof resp1 === 'string' ? resp1 : resp1.text || JSON.stringify(resp1));

    console.log('\n--- Test 2: user provides name ---');
    const resp2 = await constructorAiService.processMessage(bot.id, userId, nickname, 'Меня зовут Александр');
    console.log('AI response 2:', typeof resp2 === 'string' ? resp2 : resp2.text || JSON.stringify(resp2));
  } catch (e) {
    console.warn('AI test skipped/failed:', e.message);
  }
}

main()
  .then(async () => {
    await knex.destroy();
    process.exit(0);
  })
  .catch(async (e) => {
    console.error('Failed:', e.message);
    await knex.destroy();
    process.exit(1);
  });

