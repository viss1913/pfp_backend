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

app.set('trust proxy', 1);

// CORS: если CORS_ALLOWED_ORIGINS не задан — пускаем любой origin (чтобы админка с любого домена работала)
const allowedOriginsRaw = process.env.CORS_ALLOWED_ORIGINS;
const hasAllowedList = allowedOriginsRaw && allowedOriginsRaw.trim().length > 0;
const allowedOrigins = hasAllowedList
    ? allowedOriginsRaw.split(',').map((o) => o.trim()).filter(Boolean)
    : [];

app.use(cors({
    origin: function (origin, callback) {
        if (!origin) return callback(null, true);
        // Список не задан — разрешаем любой origin
        if (allowedOrigins.length === 0) return callback(null, true);
        if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) return callback(null, true);
        callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
        'Content-Type',
        'Authorization',
        'x-agent-id',
        'x-role',
        'x-api-key',
        'X-Requested-With',
        'x-project-key',
        'x-project-id',
        'x-constructor-session-id',
    ],
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

// Content Factory media (base64) + IDE proxy: до 32 MB как у ide-api; дефолт Express 100kb ломает загрузку логотипов.
const JSON_BODY_LIMIT = process.env.JSON_BODY_LIMIT || '32mb';
app.use(express.json({ limit: JSON_BODY_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: JSON_BODY_LIMIT }));

// Static files (uploads)
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

app.use((req, res, next) => {
    logger.info(`${req.method} ${req.url}`);
    next();
});

// Swagger
const swaggerDocument = YAML.load(path.join(__dirname, '../openapi/pfp-api.yaml'));
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

const b2cSwaggerDocument = YAML.load(path.join(__dirname, '../openapi/pfpB2C.yaml'));
app.use('/api-docs-b2c', swaggerUi.serve, swaggerUi.setup(b2cSwaggerDocument));

// PDF-настройки (отдельный спек, пока не вшиваем в pfp-api.yaml)
const pdfSettingsSwaggerDocument = YAML.load(path.join(__dirname, '../openapi/PDFsettings.yaml'));
app.use('/api-docs-pdf-settings', swaggerUi.serve, swaggerUi.setup(pdfSettingsSwaggerDocument));

// Routes
// Note: tenantMiddleware is now applied within routes to benefit from req.user context
app.use('/api', routes);

// Error Handler
app.use(errorHandler);

module.exports = app;
