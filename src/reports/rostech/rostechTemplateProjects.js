/**
 * Тенант Ростех (Immers project 6, legacy Railway 22, песочница 25) — PDF-тема `rostech`.
 * Матч по slug / public_key / name из таблицы projects (как Yadro), без привязки к одному project_id.
 */
const ROSTECH_SLUG = 'rostech';

/** Известные public_key Ростеха на разных стендах */
const ROSTECH_PUBLIC_KEYS = new Set([
    'pk_c971ccb47f2862c67f9f9c2e', // Immers
    'pk_1dd03c524679894f04e68c6a', // legacy Railway prod
    'pk_3d9031e1bf89991b1c824400', // Rostech2-pesochnica
]);

/**
 * @param {{ slug?: string, name?: string, public_key?: string }|null|undefined} project
 */
function isRostechProjectMeta(project) {
    if (!project || typeof project !== 'object') return false;
    const slug = String(project.slug || '')
        .trim()
        .toLowerCase();
    const name = String(project.name || '')
        .trim()
        .toLowerCase();
    const pk = String(project.public_key || '').trim();

    if (slug === ROSTECH_SLUG || slug.includes('rostech')) return true;
    if (name === 'rostech' || name.includes('rostech') || name.includes('ростех')) return true;
    if (pk && ROSTECH_PUBLIC_KEYS.has(pk)) return true;
    return false;
}

/**
 * @param {number|string|null|undefined} projectId
 * @param {{ slug?: string, name?: string, public_key?: string }|null} [project]
 */
function isRostechTemplateProject(projectId, project = null) {
    void projectId;
    return isRostechProjectMeta(project);
}

module.exports = {
    ROSTECH_SLUG,
    ROSTECH_PUBLIC_KEYS,
    isRostechTemplateProject,
    isRostechProjectMeta,
};
