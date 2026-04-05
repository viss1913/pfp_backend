/**
 * Клиент Ростех (project 22): Александр, цель OTHER «Квартира», 10 млн, 500k старт, 20 лет.
 * Расчёт → goals_summary → PDF в tmp/.
 *
 * Usage: node scripts/seed_rostech_other_apartment_client_and_pdf.js
 */
const fs = require('fs');
const path = require('path');

const knex = require('../src/config/database');
const clientService = require('../src/services/clientService');
const calculationService = require('../src/services/calculationService');
const reportPdfService = require('../src/services/reportPdfService');
const { syncCalculationGoalsWithDatabase } = require('../src/services/clientGoalSyncService');

const ROSTECH_PROJECT_ID = 22;

function prepareGoalsForCalc(client) {
    const rawGoals = client.goals || [];
    return rawGoals.map((g) => {
        let fromParams = {};
        try {
            if (typeof g.params === 'string') fromParams = JSON.parse(g.params);
            else if (typeof g.params === 'object' && g.params !== null) fromParams = g.params;
        } catch (e) {
            /* ignore */
        }
        const parsed = { ...fromParams, ...g };
        const numericFields = [
            'target_amount',
            'initial_capital',
            'term_months',
            'monthly_replenishment',
            'priority',
            'goal_type_id',
        ];
        numericFields.forEach((f) => {
            if (parsed[f] !== undefined) parsed[f] = Number(parsed[f]);
        });
        return parsed;
    });
}

async function main() {
    const agent = await knex('agents').where({ project_id: ROSTECH_PROJECT_ID }).first();
    if (!agent) {
        console.warn(
            `[WARN] Нет агента с project_id=${ROSTECH_PROJECT_ID} — клиент будет без agent_id.`
        );
    }

    const stamp = Date.now();
    const email = `rostech.other.apt.${stamp}@example.invalid`;

    // 30 лет на дату расчёта (апрель 2026)
    const payload = {
        client: {
            project_id: ROSTECH_PROJECT_ID,
            agent_id: agent ? agent.id : null,
            first_name: 'Александр',
            last_name: 'Тестов',
            email,
            birth_date: '1996-04-05',
            gender: 'male',
            avg_monthly_income: 110000,
            total_liquid_capital: 500000,
        },
        goals: [
            {
                goal_type_id: 4,
                name: 'Квартира',
                target_amount: 10_000_000,
                initial_capital: 500_000,
                term_months: 240,
                risk_profile: 'BALANCED',
            },
        ],
    };

    console.log('Создание клиента + цель OTHER...');
    const clientId = await clientService.createFullClient(payload);
    console.log('client_id:', clientId);

    const full = await clientService.getFullClient(clientId, ROSTECH_PROJECT_ID);
    if (!full) {
        throw new Error('getFullClient вернул null');
    }

    const clientForCalc = {
        ...full,
        sex: full.gender || full.sex || 'male',
        birth_date: full.birth_date || '1996-04-05',
    };
    const goalsPrepared = prepareGoalsForCalc(full);

    console.log('Расчёт ПФП (first run)...');
    const calculationResponse = await calculationService.calculateFirstRun(
        { client: clientForCalc, goals: goalsPrepared },
        null,
        null,
        { isFirstRun: true, usePool: true }
    );

    const calculation = calculationResponse.calculation || calculationResponse;
    await syncCalculationGoalsWithDatabase(clientId, calculation);

    await clientService.updateClient(clientId, {
        goals_summary: JSON.stringify(calculationResponse),
    });

    const other = (calculation.goals || calculationResponse.goals || []).find(
        (g) => String(g.goal_type || '').toUpperCase() === 'OTHER'
    );
    if (other && other.summary) {
        console.log('OTHER summary:', {
            target_amount_initial: other.summary.target_amount_initial,
            target_amount_future: other.summary.target_amount_future,
            monthly_replenishment: other.summary.monthly_replenishment,
            projected_capital_at_end: other.summary.projected_capital_at_end,
            inflation_rate: other.summary.inflation_rate,
            target_months: other.summary.target_months,
        });
    }

    console.log('Генерация PDF...');
    const pdfBuffer = await reportPdfService.generateClientReportPdf({
        clientId,
        agentId: full.agent_id || undefined,
        brandingAgentId: full.agent_id != null ? Number(full.agent_id) : null,
        projectId: ROSTECH_PROJECT_ID,
    });

    const outDir = path.join(__dirname, '..', 'tmp');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    const pdfPath = path.join(outDir, `report-client-${clientId}-rostech-other-kvartira.pdf`);
    fs.writeFileSync(pdfPath, pdfBuffer);

    const jsonPath = path.join(outDir, `report-client-${clientId}-rostech-other-calculation.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(calculationResponse, null, 2), 'utf8');

    console.log('\n--- Готово ---');
    console.log('client_id:', clientId);
    console.log('JSON расчёта:', jsonPath);
    console.log('PDF:', pdfPath);
    console.log('Байт:', pdfBuffer.length);
    console.log('Email:', email);

    if (process.platform === 'win32') {
        const { execFile } = require('child_process');
        execFile('cmd.exe', ['/c', 'start', '', pdfPath], () => {});
    }

    await knex.destroy();
}

main().catch(async (e) => {
    console.error(e);
    try {
        await knex.destroy();
    } catch (_) {}
    process.exit(1);
});
