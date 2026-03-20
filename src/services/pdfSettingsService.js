const knex = require('../config/database');
const {
    buildReportCoverHtml,
    GLOBAL_DEFAULTS,
    buildCoverLayoutPayload,
    formatCoverDateRu,
    sanitizeTitleBandColor,
} = require('../reports/cover/buildCoverHtml');
const {
    keyFromPublicUrl,
    getSignedGetObjectUrl,
    shouldSignCoverReadUrl,
    signedCoverUrlTtlSec,
} = require('../utils/r2Client');

const TABLE = 'agent_report_pdf_settings';

/**
 * Описание шаблона для ЛК агента: какие поля редактируемы и как к ним ходить.
 */
function buildEditorSchema() {
    return {
        version: 1,
        templates: [
            {
                id: 'report_cover',
                title: 'Обложка PDF-отчёта',
                description:
                    'Первая страница: фон, заголовок на плашке, цвет плашки. Дата ставится при генерации PDF. Полная геометрия, градиенты, типографика и resolved-цвета — в корневом поле ответа `cover_layout` (синхронно с HTML/PDF).',
                fields: [
                    {
                        id: 'cover_background_url',
                        type: 'image',
                        label: 'Фоновое изображение',
                        hint: 'Вертикальное фото лучше подойдёт под формат A4.',
                        patch_key: 'cover_background_url',
                        upload: {
                            method: 'POST',
                            path: '/api/pfp/pdf-settings/cover-background',
                            form_field: 'image',
                            max_size_mb: 8,
                            accept_mime: ['image/jpeg', 'image/png', 'image/webp'],
                        },
                        read_url: {
                            method: 'GET',
                            path: '/api/pfp/pdf-settings/cover-image',
                            description:
                                'Прямой URL или подписанный GET к R2 (если R2_SIGN_COVER_URL=1). Для превью в ЛК.',
                        },
                        reset: { patch_key: 'cover_background_url', value: '' },
                    },
                    {
                        id: 'cover_title',
                        type: 'text',
                        label: 'Текст на цветной плашке',
                        patch_key: 'cover_title',
                        max_length: 500,
                        reset: { patch_key: 'cover_title', value: '' },
                    },
                    {
                        id: 'title_band_color',
                        type: 'color',
                        label: 'Цвет плашки под заголовком',
                        patch_key: 'title_band_color',
                        format: 'hex6',
                        reset: { patch_key: 'title_band_color', value: '' },
                    },
                    {
                        id: 'cover_date',
                        type: 'readonly',
                        label: 'Дата на обложке',
                        hint: 'Подставляется автоматически при создании PDF (текущая дата).',
                        value_key: 'date_preview',
                    },
                ],
            },
        ],
        endpoints: {
            load: { method: 'GET', path: '/api/pfp/pdf-settings' },
            save_partial: { method: 'PATCH', path: '/api/pfp/pdf-settings' },
        },
        defaults: {
            cover_title: GLOBAL_DEFAULTS.coverTitle,
            title_band_color: GLOBAL_DEFAULTS.titleBandColor,
            cover_background_url: null,
            stock_background_hint:
                'Если фон не задан, используется стандартное изображение из макета (см. cover_background_url = null).',
        },
    };
}

class PdfSettingsService {
    /**
     * Проверка, что агент принадлежит текущему проекту (мультитенант).
     */
    async assertAgentInProject(agentId, projectId) {
        if (!agentId) {
            const err = new Error('Agent context required');
            err.statusCode = 403;
            throw err;
        }
        const q = knex('agents').where('id', agentId);
        if (projectId != null) {
            q.andWhere('project_id', projectId);
        }
        const row = await q.first();
        if (!row) {
            const err = new Error('Agent not found in this project');
            err.statusCode = 404;
            throw err;
        }
        return row;
    }

    /**
     * Слить дефолты + строку из БД → объект для API и для HTML.
     */
    mergeWithDefaults(dbRow) {
        const band = dbRow?.title_band_color
            ? sanitizeTitleBandColor(dbRow.title_band_color)
            : GLOBAL_DEFAULTS.titleBandColor;
        const cover_title = dbRow?.cover_title ?? GLOBAL_DEFAULTS.coverTitle;
        const cover_background_url = dbRow?.cover_background_url ?? null;
        const date_preview = formatCoverDateRu();
        return {
            cover_background_url,
            cover_title,
            title_band_color: band,
            /** только для ответа API — в БД не хранится */
            date_preview,
            /** Все параметры превью/PDF одним объектом (те же значения, что в buildReportCoverHtml) */
            cover_layout: buildCoverLayoutPayload({
                title_band_color: band,
                cover_title,
                date_line: date_preview,
                cover_background_url,
            }),
        };
    }

    async getByAgentId(agentId, projectId) {
        await this.assertAgentInProject(agentId, projectId);
        const dbRow = await knex(TABLE).where({ agent_id: agentId }).first();
        return this.mergeWithDefaults(dbRow);
    }

    /**
     * Частичное обновление. Пустая строка для url/title сбрасывает к дефолту (null в БД).
     */
    async upsert(agentId, projectId, payload) {
        await this.assertAgentInProject(agentId, projectId);

        const patch = {};
        if (payload.cover_background_url !== undefined) {
            const v = payload.cover_background_url;
            patch.cover_background_url = v === '' || v == null ? null : String(v).trim();
        }
        if (payload.cover_title !== undefined) {
            const v = payload.cover_title;
            patch.cover_title = v === '' || v == null ? null : String(v).trim();
        }
        if (payload.title_band_color !== undefined) {
            const v = payload.title_band_color;
            patch.title_band_color = v === '' || v == null ? null : String(v).trim();
        }

        const existing = await knex(TABLE).where({ agent_id: agentId }).first();
        if (existing) {
            if (Object.keys(patch).length) {
                await knex(TABLE).where({ agent_id: agentId }).update(patch);
            }
        } else if (Object.keys(patch).length) {
            await knex(TABLE).insert({
                agent_id: agentId,
                ...patch,
            });
        }

        return this.getByAgentId(agentId, projectId);
    }

    /**
     * HTML обложки с актуальной датой и настройками агента.
     */
    async buildCoverHtmlForAgent(agentId, projectId) {
        const s = await this.getByAgentId(agentId, projectId);
        return buildReportCoverHtml({
            coverTitle: s.cover_title,
            titleBandColor: s.title_band_color,
            coverBackgroundUrl: s.cover_background_url || undefined,
        });
    }

    /**
     * URL для отображения фона в ЛК: прямой или временный signed URL к R2.
     */
    async getCoverImageAccess(agentId, projectId) {
        const s = await this.getByAgentId(agentId, projectId);
        const stored = s.cover_background_url;
        if (!stored) {
            const err = new Error('No cover background configured');
            err.statusCode = 404;
            throw err;
        }

        if (!shouldSignCoverReadUrl()) {
            return {
                url: stored,
                access: 'direct',
                expires_in: null,
                expires_at: null,
            };
        }

        const key = keyFromPublicUrl(stored);
        if (!key) {
            return {
                url: stored,
                access: 'direct',
                expires_in: null,
                expires_at: null,
            };
        }

        const ttl = signedCoverUrlTtlSec();
        const signed = await getSignedGetObjectUrl(key, ttl);
        if (!signed.ok) {
            return {
                url: stored,
                access: 'direct',
                expires_in: null,
                expires_at: null,
            };
        }

        return {
            url: signed.url,
            access: 'signed',
            expires_in: signed.expiresIn,
            expires_at: new Date(Date.now() + ttl * 1000).toISOString(),
        };
    }

    getEditorSchema() {
        return buildEditorSchema();
    }
}

module.exports = new PdfSettingsService();
