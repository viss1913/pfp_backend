const { Resend } = require('resend');
const fs = require('fs');
const path = require('path');

let resend = null;

function getResendClient() {
    if (!resend) {
        const apiKey = process.env.RESEND_API_KEY;
        if (!apiKey) {
            throw { status: 500, message: 'RESEND_API_KEY is not configured' };
        }
        resend = new Resend(apiKey);
    }
    return resend;
}

const RESEND_FROM_RAW = () => (process.env.RESEND_FROM_EMAIL || '').trim();

/** Из строки вида `Имя <addr@domain>` или просто `addr@domain` — только email. */
function parseMailboxEmail(fromEnv) {
    const raw = String(fromEnv ?? '')
        .trim()
        .replace(/^["']+|["']+$/g, '');
    if (!raw) return null;
    const m = raw.match(/<([^>]+)>/);
    return (m ? m[1] : raw).trim() || null;
}

/** Домен из шаблона `{agent}@bank-future.com` (после подстановки заглушки). */
function extractDomainFromAgentTemplate(template) {
    const withPlaceholder = String(template).replace(/\{agent\}/gi, 'subst');
    const at = withPlaceholder.lastIndexOf('@');
    if (at < 0) return null;
    return withPlaceholder.slice(at + 1).trim().toLowerCase().replace(/[>\s].*$/, '') || null;
}

/** Локальная часть из `email_corp` (только ящик или полный адрес — берём до @). */
function normalizeCorpLocalPart(raw) {
    const s = String(raw ?? '').trim();
    if (!s) return null;
    const at = s.indexOf('@');
    const local = (at >= 0 ? s.slice(0, at) : s).trim();
    return local || null;
}

/**
 * Локальная часть для `{agent}`: приоритет agents.email_corp, иначе users.email на том же домене, иначе agent_{id}.
 */
function deriveAgentLocalPart(agent, domain) {
    const corp = normalizeCorpLocalPart(agent?.email_corp);
    if (corp) return corp;
    if (!domain) return `agent_${agent?.id ?? '0'}`;
    const em = String(agent?.email || '').trim();
    if (em) {
        const lower = em.toLowerCase();
        const idx = lower.lastIndexOf('@');
        if (idx > 0) {
            const local = em.slice(0, idx).trim();
            const dom = lower.slice(idx + 1);
            if (dom === domain && local) {
                return local;
            }
        }
    }
    return `agent_${agent?.id ?? '0'}`;
}

/**
 * RESEND_FROM_EMAIL может быть `{agent}@bank-future.com` — подстановка по агенту (NDA).
 * Иначе как раньше: один общий ящик.
 */
function resolveNdaMailbox(agent) {
    let raw = RESEND_FROM_RAW() || 'onboarding@resend.dev';
    if (/\{agent\}/i.test(raw)) {
        const domain = extractDomainFromAgentTemplate(raw);
        const local = deriveAgentLocalPart(agent, domain);
        raw = raw.replace(/\{agent\}/gi, local).trim();
    }
    return parseMailboxEmail(raw) || raw;
}

/**
 * Письма без контекста агента (код регистрации): при шаблоне `{agent}@domain` — noreply@domain.
 */
function getVerificationFrom() {
    const raw = RESEND_FROM_RAW();
    if (!raw) return 'onboarding@resend.dev';
    if (/\{agent\}/i.test(raw)) {
        const domain = extractDomainFromAgentTemplate(raw);
        const local = (process.env.RESEND_SYSTEM_LOCAL || 'noreply').trim();
        if (domain) return `${local}@${domain}`;
        return 'onboarding@resend.dev';
    }
    return raw;
}

/**
 * NDA: «ФИО» + конкретный ящик (в т.ч. ivanov@bank-future.com из шаблона).
 */
function buildNdaFromHeader(agentFullName, ndaMailboxEmail) {
    const disabled =
        process.env.NDA_FROM_USE_AGENT_NAME === '0' || process.env.NDA_FROM_USE_AGENT_NAME === 'false';
    if (disabled) {
        return ndaMailboxEmail;
    }
    const addr = String(ndaMailboxEmail || '').trim();
    if (!addr) {
        return RESEND_FROM_RAW() || 'onboarding@resend.dev';
    }
    const name = String(agentFullName || '')
        .trim()
        .replace(/"/g, '')
        .replace(/[\r\n]+/g, ' ');
    if (!name || name === '—') {
        return addr;
    }
    return `"${name}" <${addr}>`;
}

/** Ответ клиента — на почту агента (если не совпадает с фактическим From). */
function buildNdaReplyTo(agentEmail, ndaFromMailboxEmail) {
    const disabled =
        process.env.NDA_REPLY_TO_AGENT === '0' || process.env.NDA_REPLY_TO_AGENT === 'false';
    if (disabled) {
        return undefined;
    }
    const em = String(agentEmail || '').trim();
    if (!em || em === '—') {
        return undefined;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
        return undefined;
    }
    const fromAddr = String(ndaFromMailboxEmail || '').trim().toLowerCase();
    if (fromAddr && em.toLowerCase() === fromAddr) {
        return undefined;
    }
    return em;
}

function escapeHtmlLite(s) {
    return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/** Из ФИО «Фамилия Имя Отчество» → «Имя Отчество» для обращения в письме. */
function extractFirstNamePatronymic(fullName) {
    const parts = String(fullName || '')
        .trim()
        .split(/\s+/)
        .filter(Boolean);
    if (parts.length >= 3) return `${parts[1]} ${parts[2]}`;
    if (parts.length === 2) return parts[1];
    return parts[0] || '';
}

function buildNdaEmailSubject(agentFullName) {
    const name = String(agentFullName || '').trim() || 'Финансовый консультант';
    return `Соглашение о неразглашении. Финансовый консультант ${name}`;
}

function buildFinancialPlanReportEmailSubject() {
    return 'Финансовый план — PDF-отчёт во вложении';
}

function buildSberLifeOfferEmailSubject() {
    return 'Информация по страховой защите жизни';
}

function buildFinamBrokerOfferEmailSubject() {
    return 'Информация по открытию брокерского счёта Финам';
}

/** Простое форматирование текста резюме (без markdown-парсера): абзацы и переносы строк. */
function executiveSummaryTextToEmailHtml(raw) {
    const t = String(raw || '').trim();
    if (!t) return '';
    return t
        .split(/\n\n+/)
        .map((para) => {
            const inner = escapeHtmlLite(para).replace(/\n/g, '<br/>');
            return `<p style="margin:0 0 12px;">${inner}</p>`;
        })
        .join('');
}

/**
 * Краткий блок по сводному портфелю для тела письма.
 * @param {object} portfolio — overall_plan.pdf_metrics.portfolio из отчёта
 * @param {number} goalsCount
 */
function buildFinancialPlanPortfolioSummaryHtml(portfolio, goalsCount) {
    const p = portfolio && typeof portfolio === 'object' ? portfolio : {};
    const nGoals = Number(goalsCount);
    const lines = [];

    lines.push(
        `<strong>Кратко по плану:</strong> целей — ${Number.isFinite(nGoals) ? nGoals : '—'}.`
    );

    const init = Number(p.total_initial_capital);
    if (Number.isFinite(init) && init > 0) {
        lines.push(
            `Совокупный стартовый капитал: ${Math.round(init).toLocaleString('ru-RU')}&nbsp;₽.`
        );
    }

    const monthly = Number(p.total_monthly_replenishment);
    if (Number.isFinite(monthly) && monthly > 0) {
        lines.push(
            `Совокупное ежемесячное пополнение: ${Math.round(monthly).toLocaleString('ru-RU')}&nbsp;₽/мес.`
        );
    }

    const yld = Number(p.estimated_portfolio_yield_percent);
    if (Number.isFinite(yld) && yld > 0) {
        lines.push(`Ориентир доходности портфеля (среднее по целям): ${yld.toFixed(1)}%.`);
    }

    const alloc = Array.isArray(p.assets_allocation) ? [...p.assets_allocation] : [];
    alloc.sort((a, b) => Number(b?.share_percent) - Number(a?.share_percent));
    const top = alloc.filter((a) => Number(a?.share_percent) > 0).slice(0, 3);
    if (top.length > 0) {
        lines.push('<strong>Крупнейшие доли стартового портфеля:</strong>');
        top.forEach((a) => {
            const name = escapeHtmlLite(a?.name || 'Инструмент');
            const sh = Math.round(Number(a?.share_percent) || 0);
            lines.push(`— ${name}: ${sh}%`);
        });
    }

    return lines.map((line) => `<p style="margin:0 0 8px;">${line}</p>`).join('');
}

function buildNdaSalutationLine(clientGender, clientFullName) {
    const title = clientGender === 'female' ? 'Уважаемая' : 'Уважаемый';
    const short = extractFirstNamePatronymic(clientFullName);
    const namePart = String(short || clientFullName || '').trim() || 'клиент';
    return `${title} ${escapeHtmlLite(namePart)},`;
}

function buildNdaAgentSignatureHtml(agentFullName, agentEmail, agentPhone) {
    const nameLine = escapeHtmlLite(String(agentFullName || '').trim() || '—');
    const blocks = [`С уважением,<br/>${nameLine}`];
    const em = String(agentEmail || '').trim();
    const ph = String(agentPhone || '').trim();
    if (em && em !== '—') {
        blocks.push(`<a href="mailto:${escapeHtmlLite(em)}">${escapeHtmlLite(em)}</a>`);
    }
    if (ph && ph !== '—') {
        blocks.push(escapeHtmlLite(ph));
    }
    return blocks.join('<br/>');
}

function readImageAsDataUrl(absPath) {
    try {
        if (!fs.existsSync(absPath)) return null;
        const ext = path.extname(absPath).toLowerCase();
        const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
        const b64 = fs.readFileSync(absPath).toString('base64');
        return `data:${mime};base64,${b64}`;
    } catch {
        return null;
    }
}

class EmailService {
    /**
     * Send a 6-digit verification code to the client's email
     * @param {string} email - recipient email
     * @param {string} code - 6-digit verification code
     * @returns {Promise<object>} Resend API response
     */
    async sendVerificationCode(email, code) {
        try {
            const { data, error } = await getResendClient().emails.send({
                from: getVerificationFrom(),
                to: email,
                subject: 'Код подтверждения регистрации',
                html: this._buildVerificationEmail(code)
            });

            if (error) {
                console.error('[EmailService] Resend API error:', JSON.stringify(error));
                // In dev mode: don't block registration, just log the code
                if (process.env.NODE_ENV !== 'production') {
                    console.warn(`[EmailService] ⚠️  DEV MODE: Email failed but code is saved. Code for ${email}: ${code}`);
                    return { id: 'dev-mode', code };
                }
                throw { status: 500, message: 'Failed to send verification email' };
            }

            console.log(`[EmailService] Verification code sent to ${email}, messageId: ${data?.id}`);
            return data;
        } catch (err) {
            if (err.status) throw err;
            console.error('[EmailService] Send error:', err.message || err);
            // In dev mode: don't block registration
            if (process.env.NODE_ENV !== 'production') {
                console.warn(`[EmailService] ⚠️  DEV MODE: Email service error but code is saved. Code for ${email}: ${code}`);
                return { id: 'dev-mode-fallback', code };
            }
            throw { status: 500, message: 'Email service unavailable' };
        }
    }

    /**
     * Build a nice HTML email with the verification code
     */
    /**
     * Письмо с PDF соглашения о неразглашении (NDA).
     * @param {{ to: string, cc?: string, clientFullName: string, clientGender: 'male'|'female', agentFullName: string, agentEmail: string, agentPhone: string, pdfBuffer: Buffer, filename: string, ndaAgent: { id: number, email?: string|null, email_corp?: string|null } }} opts
     */
    async sendNdaPdfEmail({
        to,
        cc,
        clientFullName,
        clientGender,
        agentFullName,
        agentEmail,
        agentPhone,
        pdfBuffer,
        filename,
        ndaAgent,
    }) {
        const safeName = filename && String(filename).endsWith('.pdf') ? filename : `${filename || 'NDA'}.pdf`;
        const salutation = buildNdaSalutationLine(clientGender, clientFullName);
        const signature = buildNdaAgentSignatureHtml(agentFullName, agentEmail, agentPhone);
        const subject = buildNdaEmailSubject(agentFullName);
        const html = `
<!DOCTYPE html>
<html><head><meta charset="utf-8"/></head>
<body style="font-family:Segoe UI,Roboto,Arial,sans-serif;font-size:15px;color:#333;line-height:1.6;">
  <p>${salutation}</p>
  <p>Направляю вам во вложении соглашение о неразглашении информации (NDA). Документ подготовлен в рамках консультационного сопровождения.</p>
  <p>При необходимости вы можете задать вопросы по контактным данным ниже.</p>
  <p style="margin-top:1.5em;">${signature}</p>
</body></html>`;

        const ndaMailbox = resolveNdaMailbox(ndaAgent || {});
        const fromHeader = buildNdaFromHeader(agentFullName, ndaMailbox);
        const replyTo = buildNdaReplyTo(agentEmail, ndaMailbox);

        try {
            const { data, error } = await getResendClient().emails.send({
                from: fromHeader,
                to,
                ...(cc ? { cc } : {}),
                ...(replyTo ? { reply_to: replyTo } : {}),
                subject,
                html,
                attachments: [
                    {
                        filename: safeName,
                        content: Buffer.isBuffer(pdfBuffer)
                            ? pdfBuffer.toString('base64')
                            : Buffer.from(pdfBuffer).toString('base64'),
                    },
                ],
            });

            if (error) {
                console.error('[EmailService] Resend NDA error:', JSON.stringify(error));
                if (process.env.NODE_ENV !== 'production') {
                    console.warn('[EmailService] DEV: NDA email failed; PDF still returned in API response');
                    return { id: 'dev-mode-nda', error: error.message };
                }
                throw { status: 502, message: 'Не удалось отправить письмо с NDA' };
            }

            console.log(`[EmailService] NDA PDF sent to ${to}, messageId: ${data?.id}`);
            return data;
        } catch (err) {
            if (err.status) throw err;
            console.error('[EmailService] NDA send error:', err.message || err);
            if (process.env.NODE_ENV !== 'production') {
                return { id: 'dev-mode-nda-fallback' };
            }
            throw { status: 502, message: 'Сервис почты недоступен' };
        }
    }

    /**
     * Письмо с PDF финансового плана (от ящика агента, как NDA).
     * @param {{ to: string, cc?: string, clientFullName: string, clientGender: 'male'|'female', agentFullName: string, agentEmail: string, agentPhone: string, pdfBuffer: Buffer, filename: string, reportAgent: { id: number, email?: string|null, email_corp?: string|null }, portfolio: object, goalsCount: number, executiveSummaryText: string }} opts
     */
    async sendFinancialPlanReportPdfEmail({
        to,
        cc,
        clientFullName,
        clientGender,
        agentFullName,
        agentEmail,
        agentPhone,
        pdfBuffer,
        filename,
        reportAgent,
        portfolio,
        goalsCount,
        executiveSummaryText,
    }) {
        const safeName =
            filename && String(filename).endsWith('.pdf') ? filename : `${filename || 'report'}.pdf`;
        const salutation = buildNdaSalutationLine(clientGender, clientFullName);
        const signature = buildNdaAgentSignatureHtml(agentFullName, agentEmail, agentPhone);
        const subject = buildFinancialPlanReportEmailSubject();
        const portfolioBlock = buildFinancialPlanPortfolioSummaryHtml(portfolio, goalsCount);
        const summaryBlock = executiveSummaryTextToEmailHtml(executiveSummaryText);
        const disclaimer =
            '<p style="margin:16px 0 0;font-size:12px;color:#64748b;">Материал носит информационный характер и не является индивидуальной инвестиционной рекомендацией.</p>';

        const html = `
<!DOCTYPE html>
<html><head><meta charset="utf-8"/></head>
<body style="font-family:Segoe UI,Roboto,Arial,sans-serif;font-size:15px;color:#333;line-height:1.6;">
  <p>${salutation}</p>
  <p>Направляю вам во вложении PDF-отчёт по вашему финансовому плану.</p>
  ${portfolioBlock}
  ${summaryBlock ? `<p style="margin:16px 0 8px;"><strong>Краткое резюме:</strong></p>${summaryBlock}` : ''}
  <p style="margin-top:1.2em;">При необходимости вы можете задать вопросы по контактным данным ниже.</p>
  ${disclaimer}
  <p style="margin-top:1.5em;">${signature}</p>
</body></html>`;

        const ndaMailbox = resolveNdaMailbox(reportAgent || {});
        const fromHeader = buildNdaFromHeader(agentFullName, ndaMailbox);
        const replyTo = buildNdaReplyTo(agentEmail, ndaMailbox);

        try {
            const { data, error } = await getResendClient().emails.send({
                from: fromHeader,
                to,
                ...(cc ? { cc } : {}),
                ...(replyTo ? { reply_to: replyTo } : {}),
                subject,
                html,
                attachments: [
                    {
                        filename: safeName,
                        content: Buffer.isBuffer(pdfBuffer)
                            ? pdfBuffer.toString('base64')
                            : Buffer.from(pdfBuffer).toString('base64'),
                    },
                ],
            });

            if (error) {
                console.error('[EmailService] Resend financial plan report error:', JSON.stringify(error));
                if (process.env.NODE_ENV !== 'production') {
                    console.warn('[EmailService] DEV: financial plan email failed');
                    return { id: 'dev-mode-finplan-report', error: error.message };
                }
                throw { status: 502, message: 'Не удалось отправить письмо с отчётом' };
            }

            console.log(`[EmailService] Financial plan PDF sent to ${to}, messageId: ${data?.id}`);
            return data;
        } catch (err) {
            if (err.status) throw err;
            console.error('[EmailService] Financial plan report send error:', err.message || err);
            if (process.env.NODE_ENV !== 'production') {
                return { id: 'dev-mode-finplan-report-fallback' };
            }
            throw { status: 502, message: 'Сервис почты недоступен' };
        }
    }

    /**
     * Письмо клиенту с открытием LIFE-продукта «Подушка безопасности».
     * @param {{ to: string, clientFullName: string, clientGender: 'male'|'female', agentFullName: string, agentEmail: string, agentPhone: string, reportAgent: { id: number, email?: string|null, email_corp?: string|null }, offerUrl: string, shortDescription?: string }} opts
     */
    async sendSberLifeOfferEmail({
        to,
        clientFullName,
        clientGender,
        agentFullName,
        agentEmail,
        agentPhone,
        reportAgent,
        offerUrl,
        shortDescription,
    }) {
        const salutation = buildNdaSalutationLine(clientGender, clientFullName);
        const signature = buildNdaAgentSignatureHtml(agentFullName, agentEmail, agentPhone);
        const subject = buildSberLifeOfferEmailSubject();
        const safeOfferUrl = String(offerUrl || 'https://sberbank-insurance.ru/podushka-bezopasnosti').trim();
        const description = String(shortDescription || '').trim() ||
            'Подушка безопасности от Сбер Страхование Жизни — страховая защита с фиксированным тарифом 1,44% в год. Продукт покрывает риски травм, инвалидности I-II группы и ухода из жизни по ключевым сценариям.';

        const html = `
<!DOCTYPE html>
<html><head><meta charset="utf-8"/></head>
<body style="margin:0;padding:20px;background:#ffffff;font-family:Segoe UI,Roboto,Arial,sans-serif;color:#1f2937;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;margin:0 auto;border-collapse:collapse;">
    <tr><td style="padding:0 0 10px;font-size:16px;line-height:1.5;">${salutation}</td></tr>
    <tr><td style="padding:0 0 10px;font-size:16px;line-height:1.55;">Направляю информацию по страховой защите жизни.</td></tr>
    <tr><td style="padding:0 0 12px;font-size:16px;line-height:1.55;">${escapeHtmlLite(description)}</td></tr>
    <tr>
      <td style="padding:0 0 14px;font-size:16px;line-height:1.55;">
        Ссылка для оформления: <a href="${escapeHtmlLite(safeOfferUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtmlLite(safeOfferUrl)}</a>
      </td>
    </tr>
    <tr>
      <td style="padding:4px 0 16px;">
        <a href="${escapeHtmlLite(safeOfferUrl)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;background:#177245;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:6px;font-size:15px;">Оформить НСЖ</a>
      </td>
    </tr>
    <tr><td style="padding:0 0 8px;font-size:16px;line-height:1.55;">Если будет нужно — помогу с оформлением и отвечу на вопросы.</td></tr>
    <tr><td style="padding:10px 0 0;font-size:15px;line-height:1.5;">${signature}</td></tr>
  </table>
</body></html>`;

        const text = [
            String(salutation || '').replace(/<[^>]+>/g, ''),
            '',
            'Направляю информацию по страховой защите жизни.',
            description,
            '',
            `Ссылка для оформления: ${safeOfferUrl}`,
            '',
            'Если будет нужно — помогу с оформлением и отвечу на вопросы.',
            '',
            String(signature || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')
        ].join('\n');

        const ndaMailbox = resolveNdaMailbox(reportAgent || {});
        const fromHeader = buildNdaFromHeader(agentFullName, ndaMailbox);
        const replyTo = buildNdaReplyTo(agentEmail, ndaMailbox);

        try {
            const { data, error } = await getResendClient().emails.send({
                from: fromHeader,
                to,
                ...(replyTo ? { reply_to: replyTo } : {}),
                subject,
                html,
                text,
            });

            if (error) {
                console.error('[EmailService] Resend Sber life offer error:', JSON.stringify(error));
                if (process.env.NODE_ENV !== 'production') {
                    return { id: 'dev-mode-sber-life-offer', error: error.message };
                }
                throw { status: 502, message: 'Не удалось отправить письмо с предложением страхования' };
            }

            console.log(`[EmailService] Sber life offer email sent to ${to}, messageId: ${data?.id}`);
            return data;
        } catch (err) {
            if (err.status) throw err;
            console.error('[EmailService] Sber life offer send error:', err.message || err);
            if (process.env.NODE_ENV !== 'production') {
                return { id: 'dev-mode-sber-life-offer-fallback' };
            }
            throw { status: 502, message: 'Сервис почты недоступен' };
        }
    }

    /**
     * Письмо клиенту с открытием брокерского счёта Финам и блоком спецакций.
     * @param {{ to: string, clientFullName: string, clientGender: 'male'|'female', agentFullName: string, agentEmail: string, agentPhone: string, reportAgent: { id: number, email?: string|null, email_corp?: string|null }, openUrl?: string, shortDescription?: string, promoBonusUrl?: string, promoTransferUrl?: string }} opts
     */
    async sendFinamBrokerOfferEmail({
        to,
        clientFullName,
        clientGender,
        agentFullName,
        agentEmail,
        agentPhone,
        reportAgent,
        openUrl,
        shortDescription,
        promoBonusUrl,
        promoTransferUrl,
    }) {
        const salutation = buildNdaSalutationLine(clientGender, clientFullName);
        const signature = buildNdaAgentSignatureHtml(agentFullName, agentEmail, agentPhone);
        const subject = buildFinamBrokerOfferEmailSubject();
        const safeOpenUrl = String(openUrl || 'https://www.finam.ru/open/order/russia/').trim();
        const safePromoBonusUrl = String(promoBonusUrl || 'https://bonus.finam.ru/2025/').trim();
        const safePromoTransferUrl = String(promoTransferUrl || 'https://broker.finam.ru/landing/vygodniy-perekhod/').trim();
        const description = String(shortDescription || '').trim() ||
            'Открытие брокерского счёта Финам даёт доступ к рынку акций, облигаций, фондов и стратегиям автоследования в рамках вашего финансового плана.';

        const html = `
<!DOCTYPE html>
<html><head><meta charset="utf-8"/></head>
<body style="margin:0;padding:20px;background:#ffffff;font-family:Segoe UI,Roboto,Arial,sans-serif;color:#1f2937;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;margin:0 auto;border-collapse:collapse;">
    <tr><td style="padding:0 0 10px;font-size:16px;line-height:1.5;">${salutation}</td></tr>
    <tr><td style="padding:0 0 10px;font-size:16px;line-height:1.55;">Направляю информацию по открытию брокерского счёта Финам.</td></tr>
    <tr><td style="padding:0 0 12px;font-size:16px;line-height:1.55;">${escapeHtmlLite(description)}</td></tr>
    <tr>
      <td style="padding:0 0 14px;font-size:16px;line-height:1.55;">
        Ссылка для открытия: <a href="${escapeHtmlLite(safeOpenUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtmlLite(safeOpenUrl)}</a>
      </td>
    </tr>
    <tr>
      <td style="padding:4px 0 16px;">
        <a href="${escapeHtmlLite(safeOpenUrl)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;background:#177245;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:6px;font-size:15px;">Открыть брокерский счёт</a>
      </td>
    </tr>
    <tr>
      <td style="padding:0 0 8px;font-size:16px;line-height:1.55;">
        <strong>Спецакции Финам:</strong><br/>
        • Финам Бонус: <a href="${escapeHtmlLite(safePromoBonusUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtmlLite(safePromoBonusUrl)}</a><br/>
        • Выгодный переход: <a href="${escapeHtmlLite(safePromoTransferUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtmlLite(safePromoTransferUrl)}</a><br/>
        Актуальные условия, сроки и ограничения — на страницах акций.
      </td>
    </tr>
    <tr><td style="padding:10px 0 0;font-size:15px;line-height:1.5;">${signature}</td></tr>
  </table>
</body></html>`;

        const text = [
            String(salutation || '').replace(/<[^>]+>/g, ''),
            '',
            'Направляю информацию по открытию брокерского счёта Финам.',
            description,
            '',
            `Ссылка для открытия: ${safeOpenUrl}`,
            '',
            'Спецакции Финам:',
            `- Финам Бонус: ${safePromoBonusUrl}`,
            `- Выгодный переход: ${safePromoTransferUrl}`,
            'Актуальные условия, сроки и ограничения — на страницах акций.',
            '',
            String(signature || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')
        ].join('\n');

        const ndaMailbox = resolveNdaMailbox(reportAgent || {});
        const fromHeader = buildNdaFromHeader(agentFullName, ndaMailbox);
        const replyTo = buildNdaReplyTo(agentEmail, ndaMailbox);

        try {
            const { data, error } = await getResendClient().emails.send({
                from: fromHeader,
                to,
                ...(replyTo ? { reply_to: replyTo } : {}),
                subject,
                html,
                text,
            });

            if (error) {
                console.error('[EmailService] Resend broker offer error:', JSON.stringify(error));
                if (process.env.NODE_ENV !== 'production') {
                    return { id: 'dev-mode-broker-offer', error: error.message };
                }
                throw { status: 502, message: 'Не удалось отправить письмо с предложением по брокерскому счёту' };
            }

            console.log(`[EmailService] Finam broker offer email sent to ${to}, messageId: ${data?.id}`);
            return data;
        } catch (err) {
            if (err.status) throw err;
            console.error('[EmailService] Finam broker offer send error:', err.message || err);
            if (process.env.NODE_ENV !== 'production') {
                return { id: 'dev-mode-broker-offer-fallback' };
            }
            throw { status: 502, message: 'Сервис почты недоступен' };
        }
    }

    _buildVerificationEmail(code) {
        return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#f4f4f7;font-family:'Segoe UI',Roboto,Arial,sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f7;padding:40px 0;">
        <tr>
            <td align="center">
                <table width="420" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,0.08);overflow:hidden;">
                    <!-- Header -->
                    <tr>
                        <td style="background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);padding:32px 40px;text-align:center;">
                            <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:600;">Подтверждение регистрации</h1>
                        </td>
                    </tr>
                    <!-- Body -->
                    <tr>
                        <td style="padding:32px 40px;">
                            <p style="margin:0 0 16px;color:#51545e;font-size:15px;line-height:1.5;">
                                Здравствуйте! Для завершения регистрации введите код:
                            </p>
                            <div style="text-align:center;margin:24px 0;">
                                <span style="display:inline-block;background:#f4f4f7;border:2px solid #667eea;border-radius:8px;padding:16px 32px;font-size:32px;font-weight:700;letter-spacing:8px;color:#333;">
                                    ${code}
                                </span>
                            </div>
                            <p style="margin:0 0 8px;color:#51545e;font-size:13px;line-height:1.5;">
                                Код действителен <strong>10 минут</strong>.
                            </p>
                            <p style="margin:0;color:#a8aaaf;font-size:12px;line-height:1.5;">
                                Если вы не запрашивали этот код, просто проигнорируйте это письмо.
                            </p>
                        </td>
                    </tr>
                    <!-- Footer -->
                    <tr>
                        <td style="padding:16px 40px;background:#f9f9fb;text-align:center;">
                            <p style="margin:0;color:#a8aaaf;font-size:11px;">Финансовый планировщик</p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`;
    }
}

module.exports = new EmailService();
