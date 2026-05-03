const { Resend } = require('resend');

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

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';

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
                from: FROM_EMAIL,
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
     * @param {{ to: string, cc?: string, clientFullName: string, clientGender: 'male'|'female', agentFullName: string, agentEmail: string, agentPhone: string, pdfBuffer: Buffer, filename: string }} opts
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

        try {
            const { data, error } = await getResendClient().emails.send({
                from: FROM_EMAIL,
                to,
                ...(cc ? { cc } : {}),
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
