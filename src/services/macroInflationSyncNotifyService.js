const macroService = require('./macroService');
const emailService = require('./emailService');

function getNotifyRecipients() {
    const raw = process.env.MACRO_SYNC_NOTIFY_EMAIL || '';
    return raw
        .split(/[,;]/)
        .map((s) => s.trim())
        .filter(Boolean);
}

function isNotifyEnabled() {
    if (process.env.MACRO_SYNC_NOTIFY_ENABLED === '0' || process.env.MACRO_SYNC_NOTIFY_ENABLED === 'false') {
        return false;
    }
    return getNotifyRecipients().length > 0 && Boolean(process.env.RESEND_API_KEY);
}

/**
 * Скачивание ИПЦ г/г с ЦБ + уведомление на MACRO_SYNC_NOTIFY_EMAIL (Resend).
 * @param {string} [trigger] cron|manual|api
 */
async function runCbrInflationYoySync(trigger = 'manual') {
    const startedAt = new Date();
    try {
        const result = await macroService.fetchCbrInflationYoyExcel();
        const ok = result.saved > 0;
        await sendNotifySafe({
            success: ok,
            trigger,
            saved: result.saved,
            latest: result.latest,
            startedAt,
            error: ok ? null : 'Файл ЦБ пустой или не удалось сохранить ни одной точки',
        });
        return result;
    } catch (error) {
        await sendNotifySafe({
            success: false,
            trigger,
            saved: 0,
            latest: null,
            startedAt,
            error: error.message,
        });
        throw error;
    }
}

async function sendNotifySafe(payload) {
    if (!isNotifyEnabled()) {
        console.log('[macroNotify] Пропуск письма: MACRO_SYNC_NOTIFY_EMAIL или RESEND_API_KEY не заданы');
        return { skipped: true };
    }
    try {
        return await emailService.sendMacroInflationYoySyncEmail({
            to: getNotifyRecipients(),
            ...payload,
        });
    } catch (err) {
        console.error('[macroNotify] Не удалось отправить письмо:', err.message || err);
        return { failed: true };
    }
}

module.exports = {
    runCbrInflationYoySync,
    isNotifyEnabled,
    getNotifyRecipients,
};
