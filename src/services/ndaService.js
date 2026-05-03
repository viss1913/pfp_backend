const axios = require('axios');
const clientService = require('./clientService');
const agentService = require('./agentService');
const { buildNdaHtml } = require('../reports/nda/buildNdaHtml');
const { renderHtmlToPdfBuffer } = require('../utils/renderHtmlToPdfBuffer');
const emailService = require('./emailService');

const AGREEMENT_TZ = process.env.REPORT_PDF_TZ || 'Europe/Moscow';
const AGREEMENT_CITY = process.env.NDA_AGREEMENT_CITY || 'Москва';

function formatDateLongRu(dateInput) {
    const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
    if (Number.isNaN(d.getTime())) return '—';
    try {
        const s = new Intl.DateTimeFormat('ru-RU', {
            timeZone: AGREEMENT_TZ,
            day: 'numeric',
            month: 'long',
            year: 'numeric',
        }).format(d);
        return s.includes('г.') ? s : `${s} г.`;
    } catch (e) {
        return d.toISOString().slice(0, 10);
    }
}

function buildAgentFullName(agent) {
    const parts = [agent.last_name, agent.first_name, agent.middle_name].filter(Boolean);
    return parts.length ? parts.join(' ') : '—';
}

function buildPassportLine(agent) {
    const s = (agent.passport_series || '').trim();
    const n = (agent.passport_number || '').trim();
    if (!s && !n) return '—';
    if (s && n) return `серия ${s}, № ${n}`;
    return s || n || '—';
}

/**
 * Скачать изображение подписи и встроить как data URI (надёжнее для Puppeteer).
 */
async function fetchImageAsDataUri(url) {
    if (!url || typeof url !== 'string') return null;
    const trimmed = url.trim();
    if (trimmed.startsWith('data:')) return trimmed;

    const res = await axios.get(trimmed, {
        responseType: 'arraybuffer',
        timeout: 20000,
        maxContentLength: 8 * 1024 * 1024,
        validateStatus: (s) => s >= 200 && s < 400,
    });
    const ct = (res.headers['content-type'] || 'image/png').split(';')[0].trim();
    const b64 = Buffer.from(res.data).toString('base64');
    return `data:${ct};base64,${b64}`;
}

class NdaService {
    /**
     * Общая отправка: PDF + письмо (подпись и данные агента из профиля).
     */
    async _deliverNdaPdfEmail({
        agentUserId,
        projectId,
        clientEmail,
        clientFullName,
        clientPhone,
        clientBirthDate,
        clientGender,
        filename,
    }) {
        const recipientEmail =
            clientEmail != null && String(clientEmail).trim() ? String(clientEmail).trim() : '';
        if (!recipientEmail) {
            throw { status: 400, message: 'Укажите client_email в теле запроса.' };
        }

        const agent = await agentService.getAgentById(agentUserId, projectId);
        if (!agent) {
            throw { status: 404, message: 'Agent not found' };
        }

        if (!agent.signature_image_url || !String(agent.signature_image_url).trim()) {
            throw {
                status: 400,
                message: 'Загрузите изображение подписи в профиле агента перед отправкой NDA.',
            };
        }

        let signatureDataUri;
        try {
            signatureDataUri = await fetchImageAsDataUri(agent.signature_image_url);
        } catch (e) {
            console.error('[ndaService] signature fetch failed:', e.message || e);
            throw {
                status: 502,
                message: 'Не удалось загрузить изображение подписи по ссылке. Проверьте signature_image_url.',
            };
        }

        const clientFullNameDisplay = String(clientFullName || '').trim() || '—';
        const clientPhoneDisplay = String(clientPhone || '').trim() || '—';

        const agentFullName = buildAgentFullName(agent);
        const agentPhone = (agent.phone && String(agent.phone).trim()) || '—';
        const agentEmail = (agent.email && String(agent.email).trim()) || '—';
        const agentBirthRaw = agent.birth_date;
        const agentBirthLong = agentBirthRaw ? formatDateLongRu(agentBirthRaw) : '—';

        const clientBirthLong = formatDateLongRu(clientBirthDate);

        const html = buildNdaHtml({
            agreementCity: AGREEMENT_CITY,
            agreementDateLong: formatDateLongRu(new Date()),
            clientFullName: clientFullNameDisplay,
            clientPhone: clientPhoneDisplay,
            clientEmail: recipientEmail,
            clientBirthDateLong: clientBirthLong,
            agentFullName,
            agentPhone,
            agentEmail,
            agentPassportLine: buildPassportLine(agent),
            agentBirthDateLong: agentBirthLong,
            signatureDataUri,
        });

        const pdfBuffer = await renderHtmlToPdfBuffer(html);

        const ccAgent =
            agentEmail &&
            agentEmail !== '—' &&
            String(agentEmail).toLowerCase() !== String(recipientEmail).toLowerCase()
                ? agentEmail
                : undefined;

        const emailResult = await emailService.sendNdaPdfEmail({
            to: recipientEmail,
            cc: ccAgent,
            clientFullName: clientFullNameDisplay,
            clientGender,
            agentFullName,
            agentEmail,
            agentPhone,
            pdfBuffer,
            filename,
        });

        return {
            ok: true,
            success: true,
            message_id: emailResult?.id || null,
            filename,
            pdf_base64: pdfBuffer.toString('base64'),
            client_email: recipientEmail,
        };
    }

    /**
     * NDA для существующего клиента (проверка agent_id в карточке).
     */
    async generateAndSendNda({
        clientId,
        agentUserId,
        projectId,
        clientEmail,
        clientFullName,
        clientPhone,
        clientBirthDate,
        clientGender,
    }) {
        const client = await clientService.getFullClient(clientId, projectId);
        if (!client) {
            throw { status: 404, message: 'Client not found' };
        }
        if (client.agent_id != null && Number(client.agent_id) !== Number(agentUserId)) {
            throw { status: 403, message: 'Access denied' };
        }

        const safeName = String(clientFullName || '')
            .trim()
            .replace(/[^\wа-яА-ЯёЁ\-]+/g, '_')
            .slice(0, 80);
        const filename = `NDA_${clientId}_${safeName || 'client'}.pdf`;

        return this._deliverNdaPdfEmail({
            agentUserId,
            projectId,
            clientEmail,
            clientFullName,
            clientPhone,
            clientBirthDate,
            clientGender,
            filename,
        });
    }

    /**
     * NDA без клиента в БД (до first-run): те же поля тела, без `clientId`.
     */
    async generateAndSendNdaStandalone({
        agentUserId,
        projectId,
        clientEmail,
        clientFullName,
        clientPhone,
        clientBirthDate,
        clientGender,
    }) {
        const safeName = String(clientFullName || '')
            .trim()
            .replace(/[^\wа-яА-ЯёЁ\-]+/g, '_')
            .slice(0, 60);
        const filename = `NDA_${safeName || 'client'}_${Date.now()}.pdf`;

        return this._deliverNdaPdfEmail({
            agentUserId,
            projectId,
            clientEmail,
            clientFullName,
            clientPhone,
            clientBirthDate,
            clientGender,
            filename,
        });
    }
}

module.exports = new NdaService();
