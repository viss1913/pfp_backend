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
    buildSummaryLayoutPayload,
    buildGoalCardAssetsForAgentLK,
    GLOBAL_DEFAULTS: SUMMARY_DEFAULTS,
    sanitizeSummaryChartColor,
} = require('../reports/summary/buildSummaryOverviewHtml');
const { buildSummaryOverviewHtmlByTheme, buildGoalPageHtmlByTheme } = require('../reports/themes/reportRenderers');
const { resolveReportThemeKey } = require('../reports/themes/themeResolver');
const reportService = require('./reportService');
const previewMockPayload = require('../reports/summary/previewMockPayload.json');
const {
    keyFromPublicUrl,
    getSignedGetObjectUrl,
    shouldSignCoverReadUrl,
    signedCoverUrlTtlSec,
} = require('../utils/r2Client');
const { resolveReportRasterRef } = require('../utils/reportRasterSrc');

const TABLE = 'agent_report_pdf_settings';
const REPO_ROOT = path.join(__dirname, '..', '..');

/** Ответ read_url-эндпоинтов, когда в БД нет загруженного файла (ЛК не должен трактовать как сетевую ошибку). */
const EMPTY_IMAGE_READ_RESULT = {
    url: null,
    access: 'none',
    expires_in: null,
    expires_at: null,
};

function previewHtmlEndpointForPageType(pageType) {
    if (!pageType) return null;
    return {
        method: 'GET',
        path: `/api/pfp/pdf-settings/pages/${pageType}/preview-html`,
        description:
            'Полный HTML превью страницы (мок + настройки агента). Authorization: Bearer; для iframe — fetch и srcdoc/blob.',
    };
}

function normalizePreviewPageType(pageType) {
    const upper = String(pageType || '')
        .trim()
        .toUpperCase();
    if (!upper) return '';
    if (upper === 'SUMMARY') return 'SUMMARY';
    if (upper === 'FIN_RESERVE') return 'FIN_RESERVE';
    if (upper === 'LIFE') return 'LIFE';
    if (upper === 'PENSION') return 'PENSION';
    if (upper === 'INVESTMENT') return 'INVESTMENT';
    if (upper === 'OTHER') return 'OTHER';
    return '';
}

/**
 * Описание шаблона для ЛК агента: какие поля редактируемы и как к ним ходить.
 */
function buildEditorSchema() {
    const sharedGoalPageBrandingFields = [
        {
            id: 'summary_background_url',
            type: 'image',
            label: 'Фон страницы',
            hint: 'Вертикальное изображение под A4. Поверх - тёмный градиент для читаемости.',
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
                    'JSON: url + access. Если фон не загружен — 200 и url:null, access:none (не 404). Иначе прямой или signed (R2_SIGN_COVER_URL=1).',
            },
            reset: { patch_key: 'summary_background_url', value: '' },
        },
        {
            id: 'summary_logo_url',
            type: 'image',
            label: 'Логотип',
            hint: 'Общий файл для сводной и страниц целей (пока shared-режим брендинга).',
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
                description:
                    'JSON: url + access. Если лого не загружено — 200, url:null, access:none. Иначе прямой или signed.',
            },
            reset: { patch_key: 'summary_logo_url', value: '' },
        },
        {
            id: 'summary_chart_color',
            type: 'color',
            label: 'Цвет графиков и акцента секций',
            hint: 'Формат #RRGGBB. Пока один общий цвет для сводной и страниц целей.',
            patch_key: 'summary_chart_color',
            format: 'hex6',
            reset: { patch_key: 'summary_chart_color', value: '' },
        },
        {
            id: 'summary_background_darkness_percent',
            type: 'text',
            label: 'Степень затемнения фона',
            hint: 'Число 0..100. Чем больше - тем темнее оверлей поверх картинки.',
            patch_key: 'summary_background_darkness_percent',
            reset: { patch_key: 'summary_background_darkness_percent', value: '' },
        },
        {
            id: 'summary_background_overlay_opacity',
            type: 'text',
            label: 'Прозрачность оверлея фона',
            hint: 'Число 0..1. Используется, если затемнение (percent) не задано.',
            patch_key: 'summary_background_overlay_opacity',
            reset: { patch_key: 'summary_background_overlay_opacity', value: '' },
        },
        {
            id: 'summary_text_color',
            type: 'color',
            label: 'Цвет текста',
            hint: 'Формат #RRGGBB.',
            patch_key: 'summary_text_color',
            format: 'hex6',
            reset: { patch_key: 'summary_text_color', value: '' },
        },
        {
            id: 'summary_line_color',
            type: 'color',
            label: 'Цвет линий/бордеров',
            hint: 'Формат #RRGGBB. По умолчанию совпадает с акцентом.',
            patch_key: 'summary_line_color',
            format: 'hex6',
            reset: { patch_key: 'summary_line_color', value: '' },
        },
    ];

    return {
        version: 1,
        templates: [
            {
                id: 'report_cover',
                title: 'Обложка PDF-отчёта',
                preview_page_type: null,
                preview_html: null,
                description:
                    'Первая страница: фон, заголовок на плашке, цвет плашки. Дата ставится при генерации PDF. Полная геометрия, градиенты, типографика и resolved-цвета — в корневом поле ответа `cover_layout` (синхронно с HTML/PDF). Отдельного HTML-превью обложки нет — ориентир `cover_layout` + сток из `cover_layout.background.fallback_repo_relative_path`.',
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
                                'JSON: url + access. Если фон не загружен — 200, url:null, access:none. Иначе прямой или signed (R2_SIGN_COVER_URL=1).',
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
                preview_page_type: 'SUMMARY',
                preview_html: previewHtmlEndpointForPageType('SUMMARY'),
                description:
                    'Брендинг: фон страницы (и затемнение/оверлей), логотип (один на сводную), цвет графиков/акцента секций, цвет текста и линий. Тексты, клиент, цели, аватар ИИ — из расчётов/стока. Геометрия — в `summary_layout`. Картинки внутри карточек целей (тип PENSION, LIFE, …) — **не настраиваются в ЛК**; для красивого превью макета в ответе API смотри корневое поле **`goal_card_assets`** (`cards[].public_url`, `goal_type`).',
                fields: sharedGoalPageBrandingFields,
            },
            {
                id: 'report_fin_reserve',
                title: 'Финансовый резерв',
                preview_page_type: 'FIN_RESERVE',
                preview_html: previewHtmlEndpointForPageType('FIN_RESERVE'),
                description:
                    'Страница FIN_RESERVE. Сейчас использует общий брендинг со сводной: фон/лого/цвета shared через summary_* поля.',
                fields: sharedGoalPageBrandingFields,
            },
            {
                id: 'report_life',
                title: 'Защита жизни',
                preview_page_type: 'LIFE',
                preview_html: previewHtmlEndpointForPageType('LIFE'),
                description:
                    'Страница LIFE. Сейчас использует общий брендинг со сводной: фон/лого/цвета shared через summary_* поля.',
                fields: sharedGoalPageBrandingFields,
            },
            {
                id: 'report_investment',
                title: 'Сохранить и приумножить',
                preview_page_type: 'INVESTMENT',
                preview_html: previewHtmlEndpointForPageType('INVESTMENT'),
                description:
                    'Страница INVESTMENT. Сейчас использует общий брендинг со сводной: фон/лого/цвета shared через summary_* поля.',
                fields: sharedGoalPageBrandingFields,
            },
            {
                id: 'report_other',
                title: 'Прочая цель',
                preview_page_type: 'OTHER',
                preview_html: previewHtmlEndpointForPageType('OTHER'),
                description:
                    'Страница OTHER. Сейчас использует общий брендинг со сводной: фон/лого/цвета shared через summary_* поля.',
                fields: sharedGoalPageBrandingFields,
            },
            {
                id: 'report_pension',
                title: 'Госпенсия',
                preview_page_type: 'PENSION',
                preview_html: previewHtmlEndpointForPageType('PENSION'),
                description:
                    'Страница PENSION. Сейчас использует общий брендинг со сводной: фон/лого/цвета shared через summary_* поля.',
                fields: sharedGoalPageBrandingFields,
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
            preview_page_html: {
                method: 'GET',
                path: '/api/pfp/pdf-settings/pages/:pageType/preview-html',
                description:
                    'Полная HTML-страница превью по типу: SUMMARY|FIN_RESERVE|LIFE|INVESTMENT|OTHER (мок-данные + текущие настройки).',
            },
        },
        defaults: {
            cover_title: GLOBAL_DEFAULTS.coverTitle,
            title_band_color: GLOBAL_DEFAULTS.titleBandColor,
            cover_background_url: null,
            summary_chart_color: SUMMARY_DEFAULTS.summaryChartColor,
            summary_background_darkness_percent: Math.round(SUMMARY_DEFAULTS.summaryBackgroundOverlayOpacity * 100),
            summary_background_overlay_opacity: SUMMARY_DEFAULTS.summaryBackgroundOverlayOpacity,
            summary_text_color: SUMMARY_DEFAULTS.summaryTextColor,
            summary_line_color: SUMMARY_DEFAULTS.summaryChartColor,
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
        const summary_background_overlay_opacity =
            dbRow?.summary_background_overlay_opacity ?? SUMMARY_DEFAULTS.summaryBackgroundOverlayOpacity;
        const summary_background_darkness_percent =
            dbRow?.summary_background_darkness_percent != null
                ? Number(dbRow.summary_background_darkness_percent)
                : Math.round(summary_background_overlay_opacity * 100);
        const summary_text_color = dbRow?.summary_text_color ?? SUMMARY_DEFAULTS.summaryTextColor;
        const summary_line_color = dbRow?.summary_line_color ?? summary_chart_color;
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
            summary_background_overlay_opacity,
            summary_background_darkness_percent,
            summary_text_color,
            summary_line_color,
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
                summary_background_overlay_opacity,
                summary_background_darkness_percent,
                summary_text_color,
                summary_line_color,
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
     * Только дефолты (без БД и без assert) — PDF для клиента без привязанного агента.
     */
    getDefaultsMerged() {
        return this.mergeWithDefaults(null);
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
        if (payload.summary_background_darkness_percent !== undefined) {
            const v = payload.summary_background_darkness_percent;
            patch.summary_background_darkness_percent = v === '' || v == null ? null : Number(v);
        }
        if (payload.summary_background_overlay_opacity !== undefined) {
            const v = payload.summary_background_overlay_opacity;
            patch.summary_background_overlay_opacity = v === '' || v == null ? null : Number(v);
        }
        if (payload.summary_text_color !== undefined) {
            const v = payload.summary_text_color;
            patch.summary_text_color = v === '' || v == null ? null : String(v).trim();
        }
        if (payload.summary_line_color !== undefined) {
            const v = payload.summary_line_color;
            patch.summary_line_color = v === '' || v == null ? null : String(v).trim();
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
        return await buildReportCoverHtml({
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
        const themeKey = resolveReportThemeKey(projectId);
        const s = await this.getByAgentId(agentId, projectId);
        return await buildSummaryOverviewHtmlByTheme({
            themeKey,
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
            summaryBackgroundDarknessPercent: s.summary_background_darkness_percent,
            summaryBackgroundOverlayOpacity: s.summary_background_overlay_opacity,
            summaryTextColor: s.summary_text_color,
            summaryLineColor: s.summary_line_color,
            /** ЛК открывает HTML в браузере — file:// с сервера недоступен, вшиваем ассеты */
            inlineLocalAssets: true,
        });
    }

    /**
     * Превью конкретной страницы (без clientId) на мок-данных, но с настройками агента.
     * pageType: SUMMARY | FIN_RESERVE | LIFE | INVESTMENT | OTHER
     */
    async buildPagePreviewHtml(agentId, projectId, pageTypeRaw) {
        await this.assertAgentInProject(agentId, projectId);
        const themeKey = resolveReportThemeKey(projectId);
        const pageType = normalizePreviewPageType(pageTypeRaw);
        if (!pageType) {
            const err = new Error('Unknown pageType');
            err.statusCode = 400;
            throw err;
        }
        if (pageType === 'SUMMARY') {
            return await this.buildSummaryPreviewHtml(agentId, projectId);
        }

        const s = await this.getByAgentId(agentId, projectId);
        const goal = (previewMockPayload?.goals || []).find((g) => g?.goal_type === pageType);
        if (!goal) {
            const err = new Error(`Preview goal for pageType ${pageType} not found`);
            err.statusCode = 404;
            throw err;
        }

        const backgroundSrc = await resolveReportRasterRef(s.summary_background_url, REPO_ROOT, REPO_ROOT, true);
        const logoSrc = await resolveReportRasterRef(s.summary_logo_url, REPO_ROOT, REPO_ROOT, true);
        const aiAvatarSrc = await resolveReportRasterRef(
            'assets/reports/summary/stock-ai-avatar.png',
            REPO_ROOT,
            REPO_ROOT,
            true
        );

        return await buildGoalPageHtmlByTheme({
            themeKey,
            goalType: pageType,
            goal,
            clientName: 'Алексей Петров',
            options: {
                inlineLocalAssets: true,
                accentColor: s.summary_chart_color,
                textColor: s.summary_text_color,
                lineColor: s.summary_line_color,
                backgroundSrc: backgroundSrc || '',
                logoSrc: logoSrc || undefined,
                aiAvatarSrc: aiAvatarSrc || undefined,
                backgroundOverlayOpacity: s.summary_background_overlay_opacity,
                backgroundDarknessPercent: s.summary_background_darkness_percent,
                reportGoalsOrdered: previewMockPayload?.goals || [],
                clientAvgMonthlyIncome: 280000,
            },
        });
    }

    async buildSummaryOverviewHtmlForClient(agentId, projectId, clientId, extra = {}) {
        const themeKey = resolveReportThemeKey(projectId);
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
        return await buildSummaryOverviewHtmlByTheme({
            themeKey,
            reportPayload: extra.reportPayload || {
                goals_detailed: report.goals_detailed,
                overall_plan: report.overall_plan,
            },
            clientInfo: extra.clientInfo || defaultClientInfo,
            aiIntroHtml: extra.aiIntroHtml,
            summaryLogoUrl: s.summary_logo_url || undefined,
            summaryBackgroundUrl: s.summary_background_url || undefined,
            summaryChartColor: s.summary_chart_color,
            summaryBackgroundDarknessPercent: s.summary_background_darkness_percent,
            summaryBackgroundOverlayOpacity: s.summary_background_overlay_opacity,
            summaryTextColor: s.summary_text_color,
            summaryLineColor: s.summary_line_color,
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
            return { ...EMPTY_IMAGE_READ_RESULT };
        }
        const resolved = await this.resolveStoredImageReadUrl(stored);
        return resolved || { ...EMPTY_IMAGE_READ_RESULT };
    }

    async getSummaryBackgroundImageAccess(agentId, projectId) {
        const s = await this.getByAgentId(agentId, projectId);
        const stored = s.summary_background_url;
        if (!stored) {
            return { ...EMPTY_IMAGE_READ_RESULT };
        }
        const resolved = await this.resolveStoredImageReadUrl(stored);
        return resolved || { ...EMPTY_IMAGE_READ_RESULT };
    }

    async getSummaryLogoImageAccess(agentId, projectId) {
        const s = await this.getByAgentId(agentId, projectId);
        const stored = s.summary_logo_url;
        if (!stored) {
            return { ...EMPTY_IMAGE_READ_RESULT };
        }
        const resolved = await this.resolveStoredImageReadUrl(stored);
        return resolved || { ...EMPTY_IMAGE_READ_RESULT };
    }

    getEditorSchema() {
        return buildEditorSchema();
    }
}

module.exports = new PdfSettingsService();
