const DEFAULT_THEME_KEY = 'default';
const ROSTECH_THEME_KEY = 'rostech';

/**
 * Возвращает ключ темы отчёта по projectId.
 * Пока что роутим по конкретному projectId=22 (Ростех).
 */
function resolveReportThemeKey(projectId) {
    const pid = projectId == null ? null : Number(projectId);
    if (pid === 22) return ROSTECH_THEME_KEY;
    return DEFAULT_THEME_KEY;
}

module.exports = {
    DEFAULT_THEME_KEY,
    ROSTECH_THEME_KEY,
    resolveReportThemeKey,
};

