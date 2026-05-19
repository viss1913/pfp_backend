const logger = require('../utils/logger');

function httpErrorLabel(status) {
    const labels = {
        400: 'Bad Request',
        401: 'Unauthorized',
        403: 'Forbidden',
        404: 'Not Found',
        409: 'Conflict',
        422: 'Unprocessable Entity',
        502: 'Bad Gateway',
    };
    if (labels[status]) return labels[status];
    return status >= 500 ? 'Internal Server Error' : 'Error';
}

module.exports = (err, req, res, next) => {
    // Log error, with stack only if not in production or if explicitly requested
    if (err.stack && process.env.NODE_ENV !== 'production') {
        logger.error(err.stack);
    } else {
        logger.error(err.message || err);
    }

    const status = err.status || err.statusCode || 500;

    // In production, mask internal server errors to avoid leaking details
    let message = err.message || 'Internal Server Error';
    if (status === 500 && process.env.NODE_ENV === 'production') {
        message = 'Внутренняя ошибка сервера';
    }

    const errorType = err.error || httpErrorLabel(status);

    // Format error according to API spec
    const response = {
        error: errorType,
        message: message
    };

    res.status(status).json(response);
};
