/**
 * Логгер без внешних зависимостей (только console).
 * API: info, error, warn, debug. Не использует winston.
 */
const level = process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug');
const levels = { error: 0, warn: 1, info: 2, debug: 3 };
const currentLevel = levels[level] ?? 2;

function formatMsg(level, args) {
    const [msg, meta] = args;
    const ts = new Date().toISOString();
    let out = `[${ts}] ${level.toUpperCase()}: ${msg}`;
    if (meta && typeof meta === 'object' && Object.keys(meta).length) {
        out += ' ' + JSON.stringify(meta);
    }
    return out;
}

const logger = {
    info(...args) {
        if (currentLevel >= levels.info) console.log(formatMsg('info', args));
    },
    error(...args) {
        if (currentLevel >= levels.error) console.error(formatMsg('error', args));
    },
    warn(...args) {
        if (currentLevel >= levels.warn) console.warn(formatMsg('warn', args));
    },
    debug(...args) {
        if (currentLevel >= levels.debug) console.debug(formatMsg('debug', args));
    }
};

module.exports = logger;
