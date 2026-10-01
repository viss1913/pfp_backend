#!/usr/bin/env node
/**
 * MCP для Cursor и Claude Desktop.
 * Считает план и кладёт PDF в tmp/mcp-plans.
 *
 *   node src/mcp/stdio.js
 *   env: PFP_MCP_PROJECT_ID, плюс обычный .env backend (база).
 *
 * stdout занят протоколом MCP. Логи процесса уходят в stderr.
 */
console.log = (...args) => {
    console.error(...args);
};

require('dotenv').config({
    path: require('path').join(__dirname, '../../.env'),
    quiet: true,
});
const readline = require('readline');
const { MCP_GOAL_CATALOG, MCP_INTERVIEW } = require('./goalCatalog');
const { runMcpPlan } = require('./runMcpPlan');

const SERVER_INFO = { name: 'pfp', version: '0.1.0' };
const PROTOCOL = '2024-11-05';

const TOOLS = [
    {
        name: 'list_goal_catalog',
        description: 'Каталог целей ПФП и порядок вопросов. Вызови до расчёта. Рекомендуй цели только из этого списка. Сначала спроси про детей, расходы, капитал, резерв, защиту жизни и риск-профиль.',
        inputSchema: {
            type: 'object',
            properties: {},
            additionalProperties: false,
        },
    },
    {
        name: 'build_financial_plan',
        description: 'Считает финансовый план и сохраняет PDF. В ответе presentation — единственные цифры, которые можно называть. pdf_path — файл отчёта, его нужно отдать человеку. Не выдумывай доходность, тариф и взносы. Если ответ ok:false и есть ask_next — задай эти вопросы и вызови инструмент снова.',
        inputSchema: {
            type: 'object',
            additionalProperties: false,
            required: [
                'birth_date',
                'sex',
                'monthly_income',
                'monthly_expenses',
                'liquid_capital',
                'has_children',
                'risk_profile',
                'goals',
            ],
            properties: {
                display_name: { type: 'string', description: 'Как обращаться. Необязательно.' },
                birth_date: { type: 'string', description: 'Дата рождения, ГГГГ-ММ-ДД.' },
                sex: { type: 'string', description: 'male или female. Можно «мужской» / «женский».' },
                monthly_income: { type: 'number', description: 'Доход до налога, рубли в месяц.' },
                monthly_expenses: { type: 'number', description: 'Текущие расходы, рубли в месяц.' },
                liquid_capital: { type: 'number', description: 'Ликвидный капитал, рубли. 0, если нет.' },
                has_children: { type: 'boolean', description: 'Есть ли дети. Спроси явно.' },
                children_birth_years: {
                    type: 'array',
                    items: { type: 'integer' },
                    description: 'Годы рождения детей. Пусто, если детей нет.',
                },
                risk_profile: {
                    type: 'string',
                    description: 'CONSERVATIVE, BALANCED или AGGRESSIVE.',
                },
                goals: {
                    type: 'array',
                    description: 'Выбранные цели. Коды из list_goal_catalog.',
                    items: {
                        type: 'object',
                        required: ['code'],
                        additionalProperties: false,
                        properties: {
                            code: {
                                type: 'string',
                                enum: ['reserve', 'life', 'pension', 'investment', 'purchase', 'passive_income', 'inheritance'],
                            },
                            name: { type: 'string', description: 'Название, для покупки: Квартира, Образование и т.п.' },
                            target_amount: { type: 'number', description: 'Стоимость цели, рубли.' },
                            term_years: { type: 'number', description: 'Срок в годах.' },
                            coverage: { type: 'number', description: 'Страховая сумма для life, рубли.' },
                            reserve_months: { type: 'number', description: 'На сколько месяцев расходов резерв. По умолчанию 6.' },
                            desired_monthly_income: { type: 'number', description: 'Желаемый пассивный доход в месяц.' },
                        },
                    },
                },
            },
        },
    },
];

function send(message) {
    process.stdout.write(`${JSON.stringify(message)}\n`);
}

function toolResult(payload) {
    return {
        content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
    };
}

async function callTool(name, args) {
    if (name === 'list_goal_catalog') {
        return toolResult({
            interview: MCP_INTERVIEW,
            goals: MCP_GOAL_CATALOG,
        });
    }
    if (name === 'build_financial_plan') {
        const projectId = Number(process.env.PFP_MCP_PROJECT_ID);
        const result = await runMcpPlan(args || {}, projectId);
        return toolResult(result);
    }
    return {
        isError: true,
        content: [{ type: 'text', text: `Неизвестный инструмент ${name}` }],
    };
}

async function handle(message) {
    if (!message || message.jsonrpc !== '2.0') return;
    const { id, method, params } = message;
    if (id == null) return;

    try {
        if (method === 'initialize') {
            send({
                jsonrpc: '2.0',
                id,
                result: {
                    protocolVersion: PROTOCOL,
                    capabilities: { tools: { listChanged: false } },
                    serverInfo: SERVER_INFO,
                },
            });
            return;
        }
        if (method === 'ping') {
            send({ jsonrpc: '2.0', id, result: {} });
            return;
        }
        if (method === 'tools/list') {
            send({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
            return;
        }
        if (method === 'tools/call') {
            const result = await callTool(params?.name, params?.arguments || {});
            send({ jsonrpc: '2.0', id, result });
            return;
        }
        send({
            jsonrpc: '2.0',
            id,
            error: { code: -32601, message: `Method not found: ${method}` },
        });
    } catch (err) {
        send({
            jsonrpc: '2.0',
            id,
            error: { code: -32000, message: err.message || 'MCP error' },
        });
    }
}

const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
    const text = String(line || '').trim();
    if (!text) return;
    let message;
    try {
        message = JSON.parse(text);
    } catch (err) {
        return;
    }
    void handle(message);
});
