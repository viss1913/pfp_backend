module.exports = (err, req, res, next) => {
    // Логируем ошибку, если есть stack
    if (err.stack) {
        console.error(err.stack);
    } else {
        console.error('Error:', err);
    }

    const status = err.status || 500;
    const message = err.message || 'Internal Server Error';
    const errorType = err.error || 'Internal Server Error';

    // Формат ошибки согласно спецификации API
    const response = {
        error: errorType,
        message: message
    };

    res.status(status).json(response);
};
