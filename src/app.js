const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');
const path = require('path');
const routes = require('./routes');
const errorHandler = require('./middlewares/errorHandler');
const tenantMiddleware = require('./middlewares/tenantMiddleware');
const logger = require('./utils/logger');

const app = express();

// CORS configuration - must be before other middleware
const allowedOriginsRaw = process.env.CORS_ALLOWED_ORIGINS;
const allowedOrigins = allowedOriginsRaw
    ? allowedOriginsRaw.split(',').map((o) => o.trim()).filter(Boolean)
    : (process.env.NODE_ENV === 'production'
        ? [] // в продакшене без env разрешаем любой origin ниже
        : ['http://localhost:3000', 'http://localhost:5173']);

app.use(cors({
    origin: function (origin, callback) {
        // Нет origin — запросы с того же домена, Postman, мобилки
        if (!origin) {
            return callback(null, true);
        }
        // Явно разрешённый список
        if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
            return callback(null, true);
        }
        // В продакшене без CORS_ALLOWED_ORIGINS — разрешаем любой origin (чтобы админка с любого домена работала)
        if (process.env.NODE_ENV === 'production' && allowedOrigins.length === 0) {
            return callback(null, true);
        }
        callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-agent-id', 'x-role', 'x-api-key', 'X-Requested-With', 'x-project-key', 'x-project-id'],
    exposedHeaders: ['Content-Type', 'Authorization', 'x-project-key'],
    preflightContinue: false,
    optionsSuccessStatus: 204
}));

// Helmet configuration
app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    // Enable CSP with standard secure defaults, allowing swagger-ui inline scripts if needed
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"], // Needed for swagger-ui
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:"],
            connectSrc: ["'self'"]
        }
    }
}));

app.use(express.json());

app.use((req, res, next) => {
    logger.info(`${req.method} ${req.url}`);
    next();
});

// Swagger
const swaggerDocument = YAML.load(path.join(__dirname, '../openapi/pfp-api.yaml'));
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

const b2cSwaggerDocument = YAML.load(path.join(__dirname, '../openapi/pfpB2C.yaml'));
app.use('/api-docs-b2c', swaggerUi.serve, swaggerUi.setup(b2cSwaggerDocument));

// Routes
// Note: tenantMiddleware is now applied within routes to benefit from req.user context
app.use('/api', routes);

// Error Handler
app.use(errorHandler);

module.exports = app;
