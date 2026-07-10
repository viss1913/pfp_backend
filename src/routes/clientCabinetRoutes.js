const express = require('express');
const router = express.Router();
const clientCabinetController = require('../controllers/clientCabinetController');
const clientComonStrategyController = require('../controllers/clientComonStrategyController');
const { restrictTo } = require('../middlewares/roleMiddleware');

// All routes here require 'client' role (or agent/admin acting on behalf)
router.use(restrictTo('client', 'agent', 'admin', 'super_admin'));

// GET /my/plan — Get my financial plan
router.get('/plan', clientCabinetController.getMyPlan.bind(clientCabinetController));

// GET /my/plan/report — JSON отчёта (pdf_summary_layout и т.д.)
router.get('/plan/report/pdf', clientCabinetController.getMyReportPdf.bind(clientCabinetController));
router.get('/plan/report/pdf-url', clientCabinetController.getMyReportPdfUrl.bind(clientCabinetController));
router.get('/plan/report/html', clientCabinetController.getMyReportHtml.bind(clientCabinetController));
router.get('/plan/report', clientCabinetController.getMyReport.bind(clientCabinetController));
router.get('/plan/comon-showcase', clientCabinetController.getMyComonShowcase.bind(clientCabinetController));
router.get('/risk-profile/questionnaire', clientCabinetController.getRiskProfileQuestionnaire.bind(clientCabinetController));
router.get('/risk-profile/questionnaire-v2', clientCabinetController.getRiskProfileQuestionnaireV2.bind(clientCabinetController));
router.get('/risk-profile/answers', clientCabinetController.getRiskProfileAnswers.bind(clientCabinetController));
router.post('/risk-profile/answers', clientCabinetController.saveRiskProfileAnswers.bind(clientCabinetController));

// Стратегии Comon закреплённого за клиентом агента (информация для клиента)
router.get('/comon-strategies', clientComonStrategyController.list);
router.get('/comon-strategies/:id/profit/metrics', clientComonStrategyController.metrics);
router.get('/comon-strategies/:id/profit', clientComonStrategyController.profit);
router.get('/comon-strategies/:id', clientComonStrategyController.getOne);

// POST /my/plan/first-run — Create/update my financial plan
router.post('/plan/first-run', clientCabinetController.createMyPlan.bind(clientCabinetController));

// POST /my/plan/:goalId/recalculate — одна цель; опционально в корне тела: risk_profile, risk_profile_extended (ручной риск, приоритет над анкетой)
router.post('/plan/:goalId/recalculate', clientCabinetController.recalculateGoal.bind(clientCabinetController));

// Plan assistant (guest_token или client JWT) — разбор финплана после first-run
router.post('/plan-assistant/chat/stream', clientCabinetController.planAssistantChatStream.bind(clientCabinetController));
router.get('/plan-assistant/history', clientCabinetController.getPlanAssistantHistory.bind(clientCabinetController));

// ==================== AI B2C Chat ====================
const aiB2cController = require('../controllers/aiB2cController');

// POST /my/ai-b2c/chat — Send message to AI (regular response)
router.post('/ai-b2c/chat', aiB2cController.sendAiB2cChat.bind(aiB2cController));

// POST /my/ai-b2c/chat/stream — Send message to AI (SSE streaming)
router.post('/ai-b2c/chat/stream', aiB2cController.sendAiB2cChatStream.bind(aiB2cController));

// POST /my/ai-b2c/chat/dynamic/stream — Dynamic start flow (SSE streaming)
router.post('/ai-b2c/chat/dynamic/stream', aiB2cController.sendAiB2cDynamicChatStream.bind(aiB2cController));

// POST /my/ai-b2c/chat_AI/stream — Separate chat_AI flow (SSE streaming)
router.post('/ai-b2c/chat_AI/stream', aiB2cController.sendAiB2cChatAiStream.bind(aiB2cController));

// GET /my/ai-b2c/history — Get chat history (?stage=PFP1)
router.get('/ai-b2c/history', aiB2cController.getAiB2cHistory.bind(aiB2cController));

// GET /my/ai-b2c/stages — Get available stages list for current project
router.get('/ai-b2c/stages', aiB2cController.getMyStages.bind(aiB2cController));

// DELETE /my/ai-b2c/history — Clear chat history (?stage=PFP1)
router.delete('/ai-b2c/history', aiB2cController.clearAiB2cHistory.bind(aiB2cController));

// GET /my/ai-b2c/settings — Get assistant settings for current project
router.get('/ai-b2c/settings', aiB2cController.getMySettings.bind(aiB2cController));

module.exports = router;
