const { parseProjectSettings } = require('../../utils/projectSettings');

/**
 * Расчёт «Добра наживешь» только при projects.settings.report_brand = psb.
 * Голый projectId 2 этим не включается: на Immers это тестовый Finam.
 * @param {object} context
 * @returns {Promise<boolean>}
 */
async function projectUsesPsbLife(context) {
    if (context && Object.prototype.hasOwnProperty.call(context, '_psbLife')) {
        return context._psbLife === true;
    }
    let yes = context?.reportBrand === 'psb';
    if (!yes) {
        const pid = Number(context?.projectId ?? context?.client?.project_id);
        if (Number.isFinite(pid) && pid > 0) {
            try {
                const projectService = require('../../services/projectService');
                const project = await projectService.getProjectById(pid);
                yes = parseProjectSettings(project?.settings).report_brand === 'psb';
            } catch (_) {
                yes = false;
            }
        }
    }
    if (context && typeof context === 'object') context._psbLife = yes;
    return yes;
}

module.exports = { projectUsesPsbLife };
