/**
 * Проверка цепочки отчёта для конкретного client id (данные + PDF).
 * Usage: node scripts/test_report_client.js [clientId]
 *   CLIENT_ID=361 node scripts/test_report_client.js
 */
const fs = require('fs');
const path = require('path');

const knex = require('../src/config/database');
const reportService = require('../src/services/reportService');
const reportPdfService = require('../src/services/reportPdfService');

const clientId = Number(process.argv[2] || process.env.CLIENT_ID || 361);

async function main() {
    const row = await knex('clients').where({ id: clientId }).first();
    if (!row) {
        console.error(`Клиент id=${clientId} не найден в БД`);
        process.exit(1);
    }

    const projectId = row.project_id;
    const agentId = row.agent_id;

    console.log('Клиент:', {
        id: row.id,
        project_id: projectId,
        agent_id: agentId,
        has_goals_summary: Boolean(row.goals_summary),
    });

    console.log('\n--- GET /api/pfp/reports/:id (reportService.getClientReportData) ---');
    const report = await reportService.getClientReportData(clientId, projectId);
    console.log('Ключи верхнего уровня:', Object.keys(report));
    console.log('goals_detailed:', report.goals_detailed?.length ?? 0, 'целей');
    console.log('pdf_summary_layout:', report.pdf_summary_layout ? 'есть' : 'нет');
    if (report.client_info) {
        console.log('client_info:', report.client_info);
    }
    if (report.current_situation) {
        console.log('net_worth:', report.current_situation.net_worth);
    }

    const outDir = path.join(__dirname, '..', 'tmp');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    const jsonPath = path.join(outDir, `report-client-${clientId}-payload.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf8');
    console.log('\nJSON сохранён:', jsonPath);

    if (!agentId) {
        console.log('\nagent_id пустой — PDF с брендингом через generateClientReportPdf(agentId) упадёт; пробуем brandingAgentId=null (дефолты).');
    }

    console.log('\n--- PDF (reportPdfService.generateClientReportPdf) ---');
    const pdfBuffer = await reportPdfService.generateClientReportPdf({
        clientId,
        agentId: agentId || undefined,
        brandingAgentId: agentId != null ? Number(agentId) : null,
        projectId,
    });
    const pdfPath = path.join(outDir, `report-client-${clientId}-test.pdf`);
    fs.writeFileSync(pdfPath, pdfBuffer);
    console.log('PDF байт:', pdfBuffer.length, 'файл:', pdfPath);

    await knex.destroy();
}

main().catch(async (e) => {
    console.error(e);
    try {
        await knex.destroy();
    } catch (_) {}
    process.exit(1);
});
