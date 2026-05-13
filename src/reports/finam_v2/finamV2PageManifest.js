const { FINAM_REPORT_V2_PAGE_TYPES } = require('./finamReportV2Contract');

const FINAM_V2_TEMPLATE_MANIFEST = Object.freeze({
    [FINAM_REPORT_V2_PAGE_TYPES.COVER]: {
        fileName: 'page-cover-v2.html',
        title: 'Обложка',
    },
    [FINAM_REPORT_V2_PAGE_TYPES.INTRO]: {
        fileName: 'page-intro-v2.html',
        title: 'Введение',
    },
    [FINAM_REPORT_V2_PAGE_TYPES.CURRENT_STATE]: {
        fileName: 'page-current-state-v2.html',
        title: 'Текущее состояние',
    },
    [FINAM_REPORT_V2_PAGE_TYPES.GOALS]: {
        fileName: 'page-goals-v2.html',
        title: 'Портфель целей',
    },
    [FINAM_REPORT_V2_PAGE_TYPES.EXECUTIVE_SUMMARY]: {
        fileName: 'page-executive-summary-v2.html',
        title: 'Управленческий вывод',
    },
    [FINAM_REPORT_V2_PAGE_TYPES.GOAL_FIN_RESERVE]: {
        fileName: 'page-goal-fin-reserve-v2.html',
        title: 'Финансовый резерв',
        goalPage: true,
    },
    [FINAM_REPORT_V2_PAGE_TYPES.GOAL_LIFE]: {
        fileName: 'page-goal-life-v2.html',
        title: 'Защита жизни',
        goalPage: true,
    },
    [FINAM_REPORT_V2_PAGE_TYPES.GOAL_PENSION]: {
        fileName: 'page-goal-pension-v2.html',
        title: 'Пенсионная цель',
        goalPage: true,
    },
    [FINAM_REPORT_V2_PAGE_TYPES.GOAL_PASSIVE_INCOME]: {
        fileName: 'page-goal-passive-income-v2.html',
        title: 'Пассивный доход',
        goalPage: true,
    },
    [FINAM_REPORT_V2_PAGE_TYPES.GOAL_SAVE_GROW]: {
        fileName: 'page-goal-save-grow-v2.html',
        title: 'Сохранить и приумножить',
        goalPage: true,
    },
    [FINAM_REPORT_V2_PAGE_TYPES.GOAL_OTHER]: {
        fileName: 'page-goal-other-v2.html',
        title: 'Крупная цель',
        goalPage: true,
    },
    [FINAM_REPORT_V2_PAGE_TYPES.PORTFOLIO_SUMMARY]: {
        fileName: 'page-portfolio-summary-v2.html',
        title: 'Итоговый портфель',
    },
    [FINAM_REPORT_V2_PAGE_TYPES.TAX_PLANNING]: {
        fileName: 'page-tax-planning-v2.html',
        title: 'Налоговое планирование',
    },
    [FINAM_REPORT_V2_PAGE_TYPES.COMON_AUTOFOLLOW]: {
        fileName: 'page-comon-autofollow-v2.html',
        title: 'Автоследование Comon',
    },
    [FINAM_REPORT_V2_PAGE_TYPES.IDU_STRATEGIES]: {
        fileName: 'page-idu-strategies-v2.html',
        title: 'Стратегии ДУ',
    },
    [FINAM_REPORT_V2_PAGE_TYPES.FINAM_OFFERS]: {
        fileName: 'page-finam-offers-v2.html',
        title: 'Предложения Финам',
    },
    [FINAM_REPORT_V2_PAGE_TYPES.INFLATION]: {
        fileName: 'page-inflation-v2.html',
        title: 'Макроконтур',
    },
    [FINAM_REPORT_V2_PAGE_TYPES.ROADMAP]: {
        fileName: 'page-roadmap-v2.html',
        title: 'Дорожная карта',
    },
    [FINAM_REPORT_V2_PAGE_TYPES.DETAILED_PLAN]: {
        fileName: 'page-detailed-plan-v2.html',
        title: 'Подробный план',
    },
    [FINAM_REPORT_V2_PAGE_TYPES.RISK_DECLARATION]: {
        fileName: 'page-risk-declaration-v2.html',
        title: 'Декларация о рисках',
    },
    [FINAM_REPORT_V2_PAGE_TYPES.PARTNER_VALUE]: {
        fileName: 'page-partner-value-v2.html',
        title: 'Партнёрская ценность',
    },
});

const FINAM_V2_SUMMARY_PAGE_ORDER = Object.freeze([
    FINAM_REPORT_V2_PAGE_TYPES.INTRO,
    FINAM_REPORT_V2_PAGE_TYPES.CURRENT_STATE,
    FINAM_REPORT_V2_PAGE_TYPES.GOALS,
    FINAM_REPORT_V2_PAGE_TYPES.EXECUTIVE_SUMMARY,
]);

const FINAM_V2_TAIL_PAGE_ORDER = Object.freeze([
    FINAM_REPORT_V2_PAGE_TYPES.PORTFOLIO_SUMMARY,
    FINAM_REPORT_V2_PAGE_TYPES.TAX_PLANNING,
    FINAM_REPORT_V2_PAGE_TYPES.COMON_AUTOFOLLOW,
    FINAM_REPORT_V2_PAGE_TYPES.IDU_STRATEGIES,
    FINAM_REPORT_V2_PAGE_TYPES.FINAM_OFFERS,
    FINAM_REPORT_V2_PAGE_TYPES.INFLATION,
    FINAM_REPORT_V2_PAGE_TYPES.ROADMAP,
    FINAM_REPORT_V2_PAGE_TYPES.DETAILED_PLAN,
    FINAM_REPORT_V2_PAGE_TYPES.RISK_DECLARATION,
]);

module.exports = {
    FINAM_V2_TEMPLATE_MANIFEST,
    FINAM_V2_SUMMARY_PAGE_ORDER,
    FINAM_V2_TAIL_PAGE_ORDER,
};
