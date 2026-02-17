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
