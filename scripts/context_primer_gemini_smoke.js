/**
 * Собирает тот же layered prompt, что generateResponse для firstRun, и шлёт в LLM (по умолчанию Gemini через OpenRouter).
 *
 *   node scripts/context_primer_gemini_smoke.js
 *
 * Нужен OPENROUTER_API_KEY в .env. Без ключа — только сводка по сообщениям.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');

const aiService = require('../src/services/aiService');
const constructorAi = require('../src/services/constructorAiService');

const fixtureCalc = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'fixtures', 'context_primer_sample_firstrun_result.json'), 'utf8')
);
const fixtureExtraction = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'fixtures', 'context_primer_sample_extraction.json'), 'utf8')
);

const MODEL = process.env.CONTEXT_PRIMER_MODEL || 'google/gemini-2.5-flash-lite';

function summarizeMessages(messages) {
    return messages.map((m, i) => ({
        index: i,
        role: m.role,
        contentChars: (m.content || '').length,
        contentPreview: (m.content || '').slice(0, 220).replace(/\n/g, ' ') + ((m.content || '').length > 220 ? '…' : ''),
    }));
}

async function main() {
    const messages = constructorAi.buildFirstRunLayeredMessagesForSmoke({
        calculationResult: fixtureCalc,
        firstRunExtraction: fixtureExtraction,
    });

    console.log('--- Сводка сообщений (context primer smoke) ---');
    console.log(JSON.stringify(summarizeMessages(messages), null, 2));
    console.log('Model:', MODEL);

    const hasKey = !!(process.env.OPENROUTER_API_KEY || process.env.SILICONFLOW_API_KEY);
    if (!hasKey) {
        console.log('\n[SKIP] Нет OPENROUTER_API_KEY / SILICONFLOW_API_KEY — запрос к LLM не выполнялся.');
        process.exit(0);
    }

    console.log('\n--- Запрос к API… ---\n');
    const reply = await aiService.getCompletion(messages, MODEL);
    console.log('--- Ответ модели ---\n');
    console.log(reply);
}

main().catch((e) => {
    console.error(e.message || e);
    process.exit(1);
});
