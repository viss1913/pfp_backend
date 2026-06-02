const reportService = require('../services/reportService');
const reportPdfService = require('../services/reportPdfService');
const clientService = require('../services/clientService');
const agentService = require('../services/agentService');
const emailService = require('../services/emailService');
const {
    maybeCompressPdfBuffer,
    ensureClientReportPdfReady,
    getClientReportPdfCacheStatus,
} = require('../services/reportPdfStorageService');
const { uploadPublicFile } = require('../utils/r2Client');

function buildAgentDisplayFullName(agent) {
    const parts = [agent.last_name, agent.first_name, agent.middle_name].filter(Boolean);
    return parts.length ? parts.join(' ') : '—';
}

/** Для обращения в письме: male | female */
function normalizeReportClientGender(raw) {
    const s = String(raw || '').toLowerCase();
    if (s === 'female' || s === 'f' || s === 'ж') return 'female';
    return 'male';
}

function parseReportIncludeFlag(val, defaultTrue = true) {
    if (val === undefined || val === null || val === '') return defaultTrue;
    const s = String(val).toLowerCase();
    return s !== '0' && s !== 'false';
}

async function ensureClientReportAccess({ user, clientId, projectId }) {
    const client = await clientService.getFullClient(clientId, projectId);
    if (!client) {
        const err = new Error('Client not found');
        err.statusCode = 404;
        throw err;
    }

    const role = String(user?.role || '').toLowerCase();
    const isAdmin = ['admin', 'super_admin'].includes(role);
    if (isAdmin) return client;

    if (role === 'client') {
        if (Number(user?.clientId) !== Number(clientId)) {
            const err = new Error('Access denied');
            err.statusCode = 403;
            throw err;
        }
        return client;
    }

    const requesterAgentId = Number(user?.agentId);
    const ownerAgentId = Number(client?.agent_id);
    if (!Number.isFinite(requesterAgentId) || requesterAgentId <= 0 || requesterAgentId !== ownerAgentId) {
        const err = new Error('Access denied');
        err.statusCode = 403;
        throw err;
    }

    return client;
}

/**
 * Настройки брендинга отчёта: из JWT агента; если нет (админ и т.п.) — агент с карточки клиента; иначе дефолты.
 * @param {object} user
 * @param {object} client
 * @returns {{ agentId?: number, brandingAgentId?: null }}
 */
function wantsReportHtmlDocument(req) {
    const inline = String(req.query.inline || '').toLowerCase();
    const format = String(req.query.format || '').toLowerCase();
    return inline === '1' || inline === 'true' || format === 'html';
}

function wantsReportHtmlPages(req) {
    const includePages = String(req.query.includePages || req.query.pages || '').toLowerCase();
    return includePages === '1' || includePages === 'true';
}

function reportBrandingOpts(user, client) {
    const jwtAgentId =
        Number.isFinite(Number(user?.agentId)) && Number(user.agentId) > 0 ? Number(user.agentId) : null;
    const ownerAgentId =
        client?.agent_id != null && client.agent_id !== '' && Number.isFinite(Number(client.agent_id))
            ? Number(client.agent_id)
            : null;
    const settingsAgentId = jwtAgentId || ownerAgentId;
    if (settingsAgentId) {
        return { agentId: settingsAgentId };
    }
    return { brandingAgentId: null };
}

class ReportController {
    async getClientReport(req, res) {
        try {
            const clientId = Number(req.params.clientId);
            const projectId = req.projectId || req.user?.projectId;
            if (!clientId || Number.isNaN(clientId)) {
                res.status(400).json({ error: 'Invalid clientId' });
                return;
            }

            await ensureClientReportAccess({ user: req.user, clientId, projectId });

            const reportData = await reportService.getClientReportData(clientId, projectId);
            res.json(reportData);
        } catch (error) {
            if (error?.statusCode) {
                res.status(error.statusCode).json({ error: error.message });
                return;
            }
            console.error('Report Generation Error:', error);
            res.status(500).json({ error: 'Failed to generate report data' });
        }
    }

    async sendClientReportPdfEmail(req, res) {
        try {
            const clientId = Number(req.params.clientId);
            const projectId = req.projectId || req.user?.projectId;

            if (!clientId || Number.isNaN(clientId)) {
                res.status(400).json({ error: 'Invalid clientId' });
                return;
            }

            const role = String(req.user?.role || '').toLowerCase();
            if (role === 'client') {
                res.status(403).json({ error: 'Отправка отчёта на email доступна только агенту или администратору' });
                return;
            }

            const client = await ensureClientReportAccess({ user: req.user, clientId, projectId });

            const body = req.body && typeof req.body === 'object' ? req.body : {};
            const includeCover = parseReportIncludeFlag(
                body.includeCover !== undefined ? body.includeCover : req.query.includeCover,
                true
            );
            const includeSummary = parseReportIncludeFlag(
                body.includeSummary !== undefined ? body.includeSummary : req.query.includeSummary,
                true
            );
            const goalTypes =
                body.goalTypes != null && String(body.goalTypes).trim()
                    ? String(body.goalTypes).trim()
                    : req.query.goalTypes || null;

            const recipient = String(client.email || '').trim();
            if (!recipient) {
                res.status(400).json({
                    error: 'У клиента не заполнен email в карточке — укажите его и повторите отправку.',
                });
                return;
            }

            let emailAgentId =
                Number.isFinite(Number(req.user?.agentId)) && Number(req.user.agentId) > 0
                    ? Number(req.user.agentId)
                    : null;
            if (!emailAgentId && client.agent_id != null && Number.isFinite(Number(client.agent_id))) {
                emailAgentId = Number(client.agent_id);
            }
            if (!emailAgentId) {
                res.status(400).json({ error: 'Нет агента для отправки письма (привяжите клиента к агенту).' });
                return;
            }

            const agent = await agentService.getAgentById(emailAgentId, projectId);
            if (!agent) {
                res.status(404).json({ error: 'Agent not found' });
                return;
            }

            const report = await reportService.getClientReportData(clientId, projectId);
            const { pdfBuffer } = await reportPdfService.generateClientReportPdfPackage({
                clientId,
                projectId,
                includeCover,
                includeSummary,
                goalTypes,
                preloadedReport: report,
                ...reportBrandingOpts(req.user, client),
            });
            const finalPdf = (await maybeCompressPdfBuffer(pdfBuffer)).buffer;

            const ts = new Date().toISOString().slice(0, 10);
            const filename = `Finplan-otchyot-${clientId}-${ts}.pdf`;

            // По умолчанию — вложение (как раньше). Ссылка только при delivery=link или fallback после сбоя Resend.
            const deliveryMode = String(
                body.delivery !== undefined
                    ? body.delivery
                    : req.query.delivery !== undefined
                      ? req.query.delivery
                      : process.env.REPORT_EMAIL_DELIVERY || 'attach'
            )
                .trim()
                .toLowerCase();
            const forceLinkOnly = ['link', 'r2'].includes(deliveryMode);

            const agentFullName = buildAgentDisplayFullName(agent);
            const agentEmail = (agent.email && String(agent.email).trim()) || '—';
            const agentPhone = (agent.phone && String(agent.phone).trim()) || '—';

            const ccAgent =
                agentEmail &&
                agentEmail !== '—' &&
                String(agentEmail).toLowerCase() !== String(recipient).toLowerCase()
                    ? agentEmail
                    : undefined;

            const clientFullName = String(report?.client_info?.full_name || '').trim() || '—';
            const clientGender = normalizeReportClientGender(client.gender || client.sex);

            const exec = report.ai_executive_summary;
            const executiveSummaryText =
                exec && typeof exec === 'object' && exec.summary_text != null ? String(exec.summary_text) : '';

            const portfolio = report?.overall_plan?.pdf_metrics?.portfolio || {};
            const goalsCount = Array.isArray(report.goals_detailed) ? report.goals_detailed.length : 0;

            const safeFileName = String(filename).replace(/[^\w.\-]+/g, '_');

            const uploadReportPdfLink = async () => {
                const r2Key = `report-emails/${projectId || 'p'}/${clientId}/${Date.now()}_${safeFileName}`;
                const upload = await uploadPublicFile({
                    key: r2Key,
                    body: finalPdf,
                    contentType: 'application/pdf',
                });
                if (!upload?.ok || !upload?.url) {
                    throw {
                        status: 503,
                        message:
                            upload?.reason === 'r2_not_configured'
                                ? 'Не настроено хранилище R2 для отправки отчёта'
                                : 'Не удалось загрузить PDF отчёта в хранилище',
                    };
                }
                console.log(
                    `[ReportController] Report PDF uploaded to R2: ${upload.url} (${finalPdf.length} bytes)`
                );
                return upload.url;
            };

            const isReportEmailSendFailure = (err) => {
                if (!err) return false;
                if (err.status === 502 || err.status === 503) return true;
                const msg = String(err.message || '').toLowerCase();
                return (
                    msg.includes('econnreset') ||
                    msg.includes('socket hang up') ||
                    msg.includes('etimedout') ||
                    msg.includes('could not be resolved') ||
                    msg.includes('unable to fetch') ||
                    msg.includes('received null') ||
                    msg.includes('сервис почты') ||
                    msg.includes('не удалось отправить')
                );
            };

            const emailBase = {
                to: recipient,
                cc: ccAgent,
                clientFullName,
                clientGender,
                agentFullName,
                agentEmail,
                agentPhone,
                filename,
                reportAgent: { id: agent.id, email: agent.email, email_corp: agent.email_corp },
                portfolio,
                goalsCount,
                executiveSummaryText,
            };

            // На VPS base64 ~2MB+ в JSON к Resend → ECONNRESET/timeout. Крупные PDF: R2 + path-attachment (файл во вложении, лёгкий POST).
            const inlineAttachMaxBytes = Math.min(
                Math.max(Number(process.env.REPORT_EMAIL_ATTACH_INLINE_MAX_BYTES) || 900_000, 100_000),
                5_000_000
            );

            const sendReportLinkOnly = async (pdfDownloadUrl) =>
                emailService.sendFinancialPlanReportPdfEmail({
                    ...emailBase,
                    pdfBuffer: null,
                    pdfDownloadUrl,
                    linkOnly: true,
                    attachmentViaUrl: false,
                });

            const sendReportAttachViaUrl = async (pdfDownloadUrl) =>
                emailService.sendFinancialPlanReportPdfEmail({
                    ...emailBase,
                    pdfBuffer: null,
                    pdfDownloadUrl,
                    linkOnly: false,
                    attachmentViaUrl: true,
                });

            const sendReportInlineAttach = async () =>
                emailService.sendFinancialPlanReportPdfEmail({
                    ...emailBase,
                    pdfBuffer: finalPdf,
                    pdfDownloadUrl: null,
                    linkOnly: false,
                    attachmentViaUrl: false,
                });

            let emailResult;
            if (forceLinkOnly) {
                const pdfDownloadUrl = await uploadReportPdfLink();
                emailResult = await sendReportLinkOnly(pdfDownloadUrl);
            } else {
                const pdfDownloadUrl = await uploadReportPdfLink();
                try {
                    if (finalPdf.length > inlineAttachMaxBytes) {
                        console.log(
                            `[ReportController] Report PDF ${finalPdf.length} bytes > inline max ${inlineAttachMaxBytes}, attach via R2 path`
                        );
                        emailResult = await sendReportAttachViaUrl(pdfDownloadUrl);
                    } else {
                        try {
                            emailResult = await sendReportInlineAttach();
                        } catch (inlineErr) {
                            if (!isReportEmailSendFailure(inlineErr)) throw inlineErr;
                            console.warn(
                                '[ReportController] Report inline attach failed, retry via R2 path:',
                                inlineErr.message || inlineErr
                            );
                            emailResult = await sendReportAttachViaUrl(pdfDownloadUrl);
                        }
                    }
                } catch (attachErr) {
                    if (!isReportEmailSendFailure(attachErr)) throw attachErr;
                    console.warn(
                        '[ReportController] Report email attach failed, fallback to R2 link:',
                        attachErr.message || attachErr
                    );
                    emailResult = await sendReportLinkOnly(pdfDownloadUrl);
                }
            }

            res.json({
                ok: true,
                message_id: emailResult?.id || null,
                client_email: recipient,
                filename,
            });
        } catch (error) {
            if (error?.status) {
                res.status(error.status).json({ error: error.message });
                return;
            }
            if (error?.statusCode) {
                res.status(error.statusCode).json({ error: error.message });
                return;
            }
            console.error('Report PDF email send error:', error);
            res.status(500).json({ error: error.message || 'Failed to send report email' });
        }
    }

    async getClientReportPdf(req, res) {
        try {
            const clientId = Number(req.params.clientId);
            const projectId = req.projectId || req.user?.projectId;

            if (!clientId || Number.isNaN(clientId)) {
                res.status(400).json({ error: 'Invalid clientId' });
                return;
            }

            const client = await ensureClientReportAccess({ user: req.user, clientId, projectId });

            const includeCover = req.query.includeCover !== '0' && req.query.includeCover !== 'false';
            const includeSummary = req.query.includeSummary !== '0' && req.query.includeSummary !== 'false';
            const goalTypes = req.query.goalTypes || null;

            const pdfBuffer = await reportPdfService.generateClientReportPdf({
                clientId,
                projectId,
                includeCover,
                includeSummary,
                goalTypes,
                ...reportBrandingOpts(req.user, client),
            });
            const finalPdf = (await maybeCompressPdfBuffer(pdfBuffer)).buffer;

            const useAttachment = String(req.query.disposition || '').toLowerCase() === 'attachment';
            const ts = new Date().toISOString().slice(0, 10);
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader(
                'Content-Disposition',
                `${useAttachment ? 'attachment' : 'inline'}; filename="report-client-${clientId}-${ts}.pdf"`
            );
            res.setHeader('Cache-Control', 'private, no-store');
            res.send(finalPdf);
        } catch (error) {
            if (error?.statusCode) {
                res.status(error.statusCode).json({ error: error.message });
                return;
            }
            console.error('Report PDF Generation Error:', error);
            res.status(500).json({ error: error.message || 'Failed to generate PDF report' });
        }
    }

    async getClientReportHtml(req, res) {
        try {
            const clientId = Number(req.params.clientId);
            const projectId = req.projectId || req.user?.projectId;

            if (!clientId || Number.isNaN(clientId)) {
                res.status(400).json({ error: 'Invalid clientId' });
                return;
            }

            const client = await ensureClientReportAccess({ user: req.user, clientId, projectId });

            const includeCover = req.query.includeCover !== '0' && req.query.includeCover !== 'false';
            const includeSummary = req.query.includeSummary !== '0' && req.query.includeSummary !== 'false';
            const goalTypes = req.query.goalTypes || null;

            const needMergedHtml =
                wantsReportHtmlDocument(req) || !wantsReportHtmlPages(req);
            const { mergedHtml, pageHtmlList, toc, reportSchemaVersion } = await reportPdfService.generateClientReportHtmlPackage({
                clientId,
                projectId,
                includeCover,
                includeSummary,
                goalTypes,
                buildMergedHtml: needMergedHtml,
                ...reportBrandingOpts(req.user, client),
            });

            if (wantsReportHtmlDocument(req)) {
                res.setHeader('Content-Type', 'text/html; charset=utf-8');
                res.setHeader('Cache-Control', 'private, no-store');
                res.send(mergedHtml);
                return;
            }

            const response = {
                html: mergedHtml,
                toc: Array.isArray(toc) ? toc : [],
                report_schema_version: reportSchemaVersion || null,
                generated_at: new Date().toISOString(),
            };
            if (wantsReportHtmlPages(req)) {
                response.pages = pageHtmlList;
            }
            res.json(response);
        } catch (error) {
            if (error?.statusCode) {
                res.status(error.statusCode).json({ error: error.message });
                return;
            }
            console.error('Report HTML Generation Error:', error);
            res.status(500).json({ error: error.message || 'Failed to generate HTML report' });
        }
    }

    async getClientReportPdfUrl(req, res) {
        try {
            const clientId = Number(req.params.clientId);
            const projectId = req.projectId || req.user?.projectId;

            if (!clientId || Number.isNaN(clientId)) {
                res.status(400).json({ error: 'Invalid clientId' });
                return;
            }

            const client = await ensureClientReportAccess({ user: req.user, clientId, projectId });

            const includeCover = req.query.includeCover !== '0' && req.query.includeCover !== 'false';
            const includeSummary = req.query.includeSummary !== '0' && req.query.includeSummary !== 'false';
            const goalTypes = req.query.goalTypes || null;
            const forceRegenerate = req.query.forceRegenerate === '1' || req.query.forceRegenerate === 'true';

            const cacheState = await getClientReportPdfCacheStatus({ clientId, projectId });
            if (!forceRegenerate && cacheState.status === 'ready' && cacheState.pdfUrl) {
                res.json({
                    status: 'ready',
                    pdf_url: cacheState.pdfUrl,
                    toc: [],
                    compressed: true,
                    generated_at: cacheState.generatedAt || new Date().toISOString(),
                });
                return;
            }

            const uploadRes = await ensureClientReportPdfReady({
                clientId,
                projectId,
                includeCover,
                includeSummary,
                goalTypes,
                ...reportBrandingOpts(req.user, client),
                fileNamePrefix: 'report',
                forceRegenerate,
                waitForResult: false,
            });

            if (uploadRes.status !== 'ready') {
                return res.status(202).json({
                    status: 'processing',
                    pdf_url: uploadRes.pdfUrl || null,
                    compressed: !!uploadRes.compressed,
                    generated_at: uploadRes.generatedAt || null,
                });
            }

            res.json({
                status: 'ready',
                pdf_url: uploadRes.pdfUrl,
                toc: Array.isArray(uploadRes.toc) ? uploadRes.toc : [],
                compressed: !!uploadRes.compressed,
                generated_at: new Date().toISOString(),
            });
        } catch (error) {
            if (error?.statusCode) {
                res.status(error.statusCode).json({ error: error.message });
                return;
            }
            console.error('Report PDF URL Generation Error:', error);
            res.status(500).json({ error: error.message || 'Failed to generate report PDF URL' });
        }
    }
}

module.exports = new ReportController();
