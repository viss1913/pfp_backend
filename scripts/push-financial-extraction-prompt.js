/**
 * Обновляет response шаблона /extractFinancialPlanParams на проде через API.
 * Учётные данные только из env (не хардкодить):
 *   PFP_LOGIN_EMAIL, PFP_LOGIN_PASSWORD
 *
 *   node scripts/push-financial-extraction-prompt.js
 */
const fs = require('fs');
const path = require('path');

const BASE = process.env.PFP_API_BASE || 'https://pfpbackend-production.up.railway.app/api';
const PROJECT_KEY = process.env.PFP_PROJECT_KEY || 'pk_1dd03c524679894f04e68c6a';

const email = process.env.PFP_LOGIN_EMAIL;
const password = process.env.PFP_LOGIN_PASSWORD;

if (!email || !password) {
    console.error('Задай PFP_LOGIN_EMAIL и PFP_LOGIN_PASSWORD');
    process.exit(1);
}

const promptPath = path.join(__dirname, '..', 'data', 'prompts', 'financialExtractionFirstRun.txt');
const responseText = fs.readFileSync(promptPath, 'utf8').trim();

async function main() {
    const loginRes = await fetch(`${BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
    });
    if (!loginRes.ok) {
        const t = await loginRes.text();
        throw new Error(`login ${loginRes.status}: ${t}`);
    }
    const { token } = await loginRes.json();
    if (!token) throw new Error('no token in login response');

    const headers = {
        Authorization: `Bearer ${token}`,
        'x-project-key': PROJECT_KEY,
        'Content-Type': 'application/json',
    };

    const listRes = await fetch(`${BASE}/pfp/constructor/commands?is_template=true`, { headers });
    if (!listRes.ok) {
        const t = await listRes.text();
        throw new Error(`commands ${listRes.status}: ${t}`);
    }
    const commands = await listRes.json();
    const row = Array.isArray(commands)
        ? commands.find((c) => String(c.command || '').toLowerCase() === '/extractfinancialplanparams')
        : null;

    if (!row || row.id == null) {
        console.error('Команда /extractFinancialPlanParams не найдена среди шаблонов проекта.');
        console.error('Первые id:', (commands || []).slice(0, 5).map((c) => ({ id: c.id, command: c.command })));
        process.exit(1);
    }

    const body = {
        command: row.command || '/extractFinancialPlanParams',
        classifier: row.classifier || 'Извлечение параметров финплана для first run',
        response: responseText,
        section: row.section ?? null,
        is_template: row.is_template !== false,
        bot_id: row.bot_id ?? null,
    };

    const putRes = await fetch(`${BASE}/pfp/constructor/commands/${row.id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(body),
    });
    if (!putRes.ok) {
        const t = await putRes.text();
        throw new Error(`PUT ${putRes.status}: ${t}`);
    }

    console.log('OK: обновлена команда id=', row.id, 'project_id=', row.project_id);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
