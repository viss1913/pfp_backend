const path = require('path');
const knex = require('../config/database');
const {
    buildReportCoverHtml,
    GLOBAL_DEFAULTS,
    buildCoverLayoutPayload,
    formatCoverDateRu,
    sanitizeTitleBandColor,
} = require('../reports/cover/buildCoverHtml');
const {
    buildReportSummaryOverviewHtml,
    buildSummaryLayoutPayload,
    buildGoalCardAssetsForAgentLK,
    GLOBAL_DEFAULTS: SUMMARY_DEFAULTS,
    sanitizeSummaryChartColor,
} = require('../reports/summary/buildSummaryOverviewHtml');
const reportService = require('./reportService');
const previewMockPayload = require('../reports/summary/previewMockPayload.json');
const {
    keyFromPublicUrl,
    getSignedGetObjectUrl,
    shouldSignCoverReadUrl,
    signedCoverUrlTtlSec,
} = require('../utils/r2Client');

const TABLE = 'agent_report_pdf_settings';
const REPO_ROOT = path.join(__dirname, '..', '..');

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
            {
                id: 'report_summary_overview',
                title: 'Сводная информация (страница 2)',
                description:
                    'Только брендинг: фон страницы, логотип (один на сводную), цвет графиков и акцента секций. Тексты, клиент, цели, аватар ИИ — из расчётов/стока. Геометрия — в `summary_layout`. Картинки внутри карточек целей (тип PENSION, LIFE, …) — **не настраиваются в ЛК**; для красивого превью макета в ответе API смотри корневое поле **`goal_card_assets`** (`cards[].public_url`, `goal_type`).',
                fields: [
                    {
                        id: 'summary_background_url',
                        type: 'image',
                        label: 'Фон страницы',
                        hint: 'Вертикальное изображение под A4. Поверх — тёмный градиент для читаемости.',
                        patch_key: 'summary_background_url',
                        upload: {
                            method: 'POST',
                            path: '/api/pfp/pdf-settings/summary-background',
                            form_field: 'image',
                            max_size_mb: 8,
                            accept_mime: ['image/jpeg', 'image/png', 'image/webp'],
                        },
                        read_url: {
                            method: 'GET',
                            path: '/api/pfp/pdf-settings/summary-background-image',
                            description:
                                'Прямой URL или подписанный GET (R2_SIGN_COVER_URL=1), как у обложки.',
                        },
                        reset: { patch_key: 'summary_background_url', value: '' },
                    },
                    {
                        id: 'summary_logo_url',
                        type: 'image',
                        label: 'Логотип',
                        hint: 'Один файл на страницу «Сводная информация» (и далее можно переиспользовать в отчёте).',
                        patch_key: 'summary_logo_url',
                        upload: {
                            method: 'POST',
                            path: '/api/pfp/pdf-settings/summary-logo',
                            form_field: 'image',
                            max_size_mb: 8,
                            accept_mime: ['image/jpeg', 'image/png', 'image/webp'],
                        },
                        read_url: {
                            method: 'GET',
                            path: '/api/pfp/pdf-settings/summary-logo-image',
                            description: 'Превью лого: прямой или signed URL.',
                        },
                        reset: { patch_key: 'summary_logo_url', value: '' },
                    },
                    {
                        id: 'summary_chart_color',
                        type: 'color',
                        label: 'Цвет графиков и акцента секций',
                        hint: 'Формат #RRGGBB. Используется для заголовков блоков на сводной и для диаграмм, когда появятся на следующих страницах.',
                        patch_key: 'summary_chart_color',
                        format: 'hex6',
                        reset: { patch_key: 'summary_chart_color', value: '' },
                    },
                ],
            },
        ],
        endpoints: {
            load: { method: 'GET', path: '/api/pfp/pdf-settings' },
            save_partial: { method: 'PATCH', path: '/api/pfp/pdf-settings' },
            preview_summary_html: {
                method: 'GET',
                path: '/api/pfp/pdf-settings/summary-preview-html',
                description:
                    'Полная HTML-страница сводной (мок-данные клиента/целей + твои фон, лого, цвет). Для iframe в ЛК или новой вкладке с Bearer.',
            },
        },
        defaults: {
            cover_title: GLOBAL_DEFAULTS.coverTitle,
            title_band_color: GLOBAL_DEFAULTS.titleBandColor,
            cover_background_url: null,
            summary_chart_color: SUMMARY_DEFAULTS.summaryChartColor,
            summary_background_url: null,
            summary_logo_url: null,
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
        const summary_chart_color = sanitizeSummaryChartColor(
            dbRow?.summary_chart_color || dbRow?.summary_accent_color || SUMMARY_DEFAULTS.summaryChartColor
        );
        const summary_background_url = dbRow?.summary_background_url ?? null;
        const summary_logo_url = dbRow?.summary_logo_url ?? null;
        /** в ЛК не показываем; колонки остаются для совместимости */
        const summary_ai_avatar_url = dbRow?.summary_ai_avatar_url ?? null;
        const summary_accent_color_legacy = dbRow?.summary_accent_color ?? null;
        return {
            cover_background_url,
            cover_title,
            title_band_color: band,
            summary_background_url,
            summary_logo_url,
            summary_chart_color,
            summary_ai_avatar_url,
            summary_accent_color: summary_accent_color_legacy,
            /** только для ответа API — в БД не хранится */
            date_preview,
            /** Все параметры превью/PDF одним объектом (те же значения, что в buildReportCoverHtml) */
            cover_layout: buildCoverLayoutPayload({
                title_band_color: band,
                cover_title,
                date_line: date_preview,
                cover_background_url,
            }),
            summary_layout: buildSummaryLayoutPayload({
                summary_chart_color,
                summary_background_url,
                summary_logo_url,
            }),
            /** Иллюстрации карточек целей: ссылки для превью макета в ЛК (не PATCH, не из БД) */
            goal_card_assets: buildGoalCardAssetsForAgentLK(REPO_ROOT),
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
        if (payload.summary_background_url !== undefined) {
            const v = payload.summary_background_url;
            patch.summary_background_url = v === '' || v == null ? null : String(v).trim();
        }
        if (payload.summary_logo_url !== undefined) {
            const v = payload.summary_logo_url;
            patch.summary_logo_url = v === '' || v == null ? null : String(v).trim();
        }
        if (payload.summary_chart_color !== undefined) {
            const v = payload.summary_chart_color;
            patch.summary_chart_color = v === '' || v == null ? null : String(v).trim();
        }
        if (payload.summary_accent_color !== undefined) {
            const v = payload.summary_accent_color;
            patch.summary_accent_color = v === '' || v == null ? null : String(v).trim();
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
     * HTML второй страницы отчёта (сводная) с настройками агента и данными отчёта клиента.
     * @param {Object} [extra] — опции для buildReportSummaryOverviewHtml: clientInfo, aiIntroHtml, reportPayload override
     */
    /**
     * Превью сводной для ЛК: фиксированный мок отчёта + актуальные pdf-settings агента.
     */
    async buildSummaryPreviewHtml(agentId, projectId) {
        await this.assertAgentInProject(agentId, projectId);
        const s = await this.getByAgentId(agentId, projectId);
        return buildReportSummaryOverviewHtml({
            reportPayload: previewMockPayload,
            clientInfo: {
                name: 'Алексей Петров',
                age: '37',
                income: '280 000 ₽',
                currentCapital: '1 617 000 ₽',
            },
            summaryLogoUrl: s.summary_logo_url || undefined,
            summaryBackgroundUrl: s.summary_background_url || undefined,
            summaryChartColor: s.summary_chart_color,
            /** ЛК открывает HTML в браузере — file:// с сервера недоступен, вшиваем ассеты */
            inlineLocalAssets: true,
        });
    }

    async buildSummaryOverviewHtmlForClient(agentId, projectId, clientId, extra = {}) {
        const report = await reportService.getClientReportData(clientId, projectId);
        const s = await this.getByAgentId(agentId, projectId);
        const net = report.current_situation?.net_worth;
        const capitalStr =
            net != null && Number.isFinite(Number(net))
                ? `${Math.round(Number(net)).toLocaleString('ru-RU')} ₽`
                : '—';
        const defaultClientInfo = {
            name: report.client_info?.full_name || '—',
            age: report.client_info?.age != null ? String(report.client_info.age) : '—',
            income: '—',
            currentCapital: capitalStr,
        };
        return buildReportSummaryOverviewHtml({
            reportPayload: extra.reportPayload || {
                goals_detailed: report.goals_detailed,
                overall_plan: report.overall_plan,
            },
            clientInfo: extra.clientInfo || defaultClientInfo,
            aiIntroHtml: extra.aiIntroHtml,
            summaryLogoUrl: s.summary_logo_url || undefined,
            summaryBackgroundUrl: s.summary_background_url || undefined,
            summaryChartColor: s.summary_chart_color,
        });
    }

    /**
     * Прямой или подписанный URL для превью картинки из настроек (обложка, сводная).
     */
    async resolveStoredImageReadUrl(storedUrl) {
        if (!storedUrl || !String(storedUrl).trim()) {
            return null;
        }
        const stored = String(storedUrl).trim();
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

    /**
     * URL для отображения фона обложки в ЛК: прямой или временный signed URL к R2.
     */
    async getCoverImageAccess(agentId, projectId) {
        const s = await this.getByAgentId(agentId, projectId);
        const stored = s.cover_background_url;
        if (!stored) {
            const err = new Error('No cover background configured');
            err.statusCode = 404;
            throw err;
        }
        const resolved = await this.resolveStoredImageReadUrl(stored);
        return resolved;
    }

    async getSummaryBackgroundImageAccess(agentId, projectId) {
        const s = await this.getByAgentId(agentId, projectId);
        const stored = s.summary_background_url;
        if (!stored) {
            const err = new Error('No summary background configured');
            err.statusCode = 404;
            throw err;
        }
        return await this.resolveStoredImageReadUrl(stored);
    }

    async getSummaryLogoImageAccess(agentId, projectId) {
        const s = await this.getByAgentId(agentId, projectId);
        const stored = s.summary_logo_url;
        if (!stored) {
            const err = new Error('No summary logo configured');
            err.statusCode = 404;
            throw err;
        }
        return await this.resolveStoredImageReadUrl(stored);
    }

    getEditorSchema() {
        return buildEditorSchema();
    }
}

module.exports = new PdfSettingsService();
