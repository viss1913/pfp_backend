const winston = require('winston');
const { combine, timestamp, printf, colorize, errors, json } = winston.format;

// Формат для консоли (красивый)
const consoleFormat = combine(
    colorize(),
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    errors({ stack: true }),
    printf(({ level, message, timestamp, stack, ...meta }) => {
        let log = `[${timestamp}] ${level}: ${message}`;
        if (stack) log += `\n${stack}`;

        // Добавляем метаданные, если они есть
        const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
        if (metaStr && metaStr !== '{}') {
            log += `\n${metaStr}`;
        }
        return log;
    })
);

// Формат для продакшена (JSON)
const prodFormat = combine(
    timestamp(),
    errors({ stack: true }),
    json()
);

// Инициализация логгера
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
    defaultMeta: { service: 'pfp-backend' },
    format: process.env.NODE_ENV === 'production' ? prodFormat : consoleFormat,
    transports: [
        new winston.transports.Console()
    ],
});

module.exports = logger;
