/**
 * Проект YADRO на Immers — как Rostech (projectId=22), без env.
 * Матч по slug / public_key / name из таблицы projects.
 */
const YADRO_PUBLIC_KEY = 'pk_2a19a53a1c58b4756817f35b';
const YADRO_SLUG = 'yadro';

/**
 * @param {{ slug?: string, name?: string, public_key?: string }|null|undefined} project
 */
function isYadroProjectMeta(project) {
    if (!project || typeof project !== 'object') return false;
    const slug = String(project.slug || '')
        .trim()
        .toLowerCase();
    const name = String(project.name || '')
        .trim()
        .toLowerCase();
    const pk = String(project.public_key || '').trim();

    if (slug === YADRO_SLUG || slug.includes('yadro')) return true;
    if (name === 'yadro' || name.includes('yadro')) return true;
    if (pk === YADRO_PUBLIC_KEY) return true;
    return false;
}

/**
 * @param {number|string|null|undefined} projectId
 * @param {{ slug?: string, name?: string, public_key?: string }|null} [project]
 */
function isYadroTemplateProject(projectId, project = null) {
    void projectId;
    return isYadroProjectMeta(project);
}

module.exports = {
    YADRO_PUBLIC_KEY,
    YADRO_SLUG,
    isYadroTemplateProject,
    isYadroProjectMeta,
};
