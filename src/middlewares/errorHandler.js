const logger = require('../utils/logger');

module.exports = (err, req, res, next) => {
    // Log error, with stack only if not in production or if explicitly requested
    if (err.stack && process.env.NODE_ENV !== 'production') {
        logger.error(err.stack);
    } else {
        logger.error(err.message || err);
    }

    const status = err.status || 500;

    // In production, mask internal server errors to avoid leaking details
    let message = err.message || 'Internal Server Error';
    if (status === 500 && process.env.NODE_ENV === 'production') {
        message = 'Внутренняя ошибка сервера';
    }

    const errorType = err.error || 'Internal Server Error';

    // Format error according to API spec
    const response = {
        error: errorType,
        message: message
    };

    res.status(status).json(response);
};
