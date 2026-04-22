const axios = require('axios');

const BASE_URL = process.env.PFP_BASE_URL || 'https://pfpbackend-production.up.railway.app';
const EMAIL = process.env.PFP_AGENT_EMAIL;
const PASSWORD = process.env.PFP_AGENT_PASSWORD;

if (!EMAIL || !PASSWORD) {
  console.error('Missing env vars: PFP_AGENT_EMAIL / PFP_AGENT_PASSWORD');
  process.exit(1);
}

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
});

const authHeader = (token) => ({ Authorization: `Bearer ${token}` });

async function login() {
  const res = await api.post('/api/auth/login', { email: EMAIL, password: PASSWORD });
  // В проекте используется res.data.token (см. существующие тест-скрипты).
  return res.data.token;
}

async function getBot(token) {
  // getMyBot: если bot_type не указан, вернёт массив ботов.
  const res = await api.get('/api/pfp/constructor/bot', { headers: authHeader(token) });
  const data = res.data;
  if (Array.isArray(data)) return data[0];
  return data && data.id ? data : null;
}

async function getBrainContexts(token) {
  const res = await api.get('/api/pfp/constructor/brain-contexts', { headers: authHeader(token) });
  return res.data || [];
}

async function upsertBrainContext(token, { title, content, is_active = true, priority = 0 }) {
  const current = await getBrainContexts(token);
  const found = current.find((x) => x.title === title);
  if (found) {
    await api.put(`/api/pfp/constructor/brain-contexts/${found.id}`, {
      title,
      content,
      is_active,
      priority,
    }, { headers: authHeader(token) });
    return { id: found.id, updated: true };
  }

  const res = await api.post('/api/pfp/constructor/brain-contexts', {
    title,
    content,
    is_active,
    priority,
  }, { headers: authHeader(token) });

  return { id: res.data.id, updated: false };
}

async function getCommands(token, botId) {
  const res = await api.get(`/api/pfp/constructor/commands`, {
    headers: authHeader(token),
    params: { bot_id: botId },
  });
  return res.data || [];
}

async function upsertCommand(token, botId, { command, classifier, response, section = null, is_template = false }) {
  const current = await getCommands(token, botId);
  const found = current.find((x) => x.command === command);

  if (found) {
    await api.put(`/api/pfp/constructor/commands/${found.id}`, {
      command,
      classifier,
      response,
      section,
      is_template,
      bot_id: botId,
    }, { headers: authHeader(token) });
    return { id: found.id, updated: true };
  }

  const res = await api.post('/api/pfp/constructor/commands', {
    command,
    classifier,
    response,
    section,
    is_template,
    bot_id: botId,
  }, { headers: authHeader(token) });

  return { id: res.data.id, updated: false };
}

async function main() {
  const token = await login();
  if (!token) throw new Error('Login failed: token empty');

  const bot = await getBot(token);
  if (!bot || !bot.id) throw new Error('Bot not found for this agent/project');

  const botId = bot.id;
  console.log('Bot id:', botId, 'bot_type:', bot.bot_type);

  // База знаний / brain-contexts:
  // - главный контекст: "Ты Асоль"
  // - контекст 1: при приветствии выдать строкой /startPFP
  // - контекст 2: спросить имя
  const brainMain = {
    title: 'Ты Асоль',
    content: 'Ты Асоль.',
    is_active: true,
    priority: 100,
  };

  const brainGreetingToStartPfp = {
    title: '/startPFP по приветствию',
    content: 'Если клиент написал приветствие (например: привет, здравствуйте), добавь отдельной строкой команду `/startPFP`.',
    is_active: true,
    priority: 90,
  };

  const brainAskName = {
    title: 'Вопрос имени',
    content: 'Спроси как зовут клиента: «Как вас зовут?»',
    is_active: true,
    priority: 80,
  };

  const r1 = await upsertBrainContext(token, brainMain);
  const r2 = await upsertBrainContext(token, brainGreetingToStartPfp);
  const r3 = await upsertBrainContext(token, brainAskName);
  console.log('Brain contexts upsert:', r1, r2, r3);

  // Команды (stages):
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
      'Оставайся на /startPFP после получения имени и дай следующий шаг. Если данных для следующего шага недостаточно — повторно спроси имя.',
    response:
      'Если имя уже известно — поприветствуй и скажи, что дальше будет консультация. Если имени нет — повторно спроси: «Как вас зовут?»',
  };

  const c1 = await upsertCommand(token, botId, startCmd);
  const c2 = await upsertCommand(token, botId, startPfpCmd);
  console.log('Commands upsert:', c1, c2);

  console.log('OK: microflow configured.');
}

main().catch((e) => {
  // Не выводим содержимое токена/пароля.
  console.error('Failed:', e.message);
  process.exit(1);
});

