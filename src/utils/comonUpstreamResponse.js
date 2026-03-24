/**
 * Ответы при ошибках запросов к Comon с сервера (403 WAF, 5xx и т.д.).
 */

function isComonUpstreamError(err) {
    if (!err || !err.message) return false;
    const msg = String(err.message);
    return (
        err.comonHttpStatus != null ||
        msg.includes('Comon strategy profit HTTP') ||
        msg.startsWith('Comon вернул 403') ||
        msg.includes('Comon strategy page HTTP')
    );
}

/**
 * @returns {boolean} true если ответ уже отправлен
 */
function sendComonUpstreamIfAny(res, err, { useMessageKey = false } = {}) {
    if (!isComonUpstreamError(err)) return false;
    const payload = {
        success: false,
        code: err.comonHttpStatus === 403 ? 'COMON_FORBIDDEN' : 'COMON_UPSTREAM',
    };
    if (useMessageKey) {
        payload.message = err.message;
    } else {
        payload.error = err.message;
    }
    if (err.comonHttpStatus != null) {
        payload.comon_http_status = err.comonHttpStatus;
    }
    res.status(502).json(payload);
    return true;
}

module.exports = {
    isComonUpstreamError,
    sendComonUpstreamIfAny,
};
