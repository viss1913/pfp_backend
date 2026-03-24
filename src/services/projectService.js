const projectRepository = require('../repositories/projectRepository');
const crypto = require('crypto');
const db = require('../config/database');

/** ID проекта-шаблона (Анна Денежная): откуда копируем настройки AI B2C в новые проекты */
const AI_B2C_TEMPLATE_PROJECT_ID = Number(process.env.AI_B2C_TEMPLATE_PROJECT_ID) || 4;

class ProjectService {
    async getAllProjects(filters = {}) {
        const list = await projectRepository.findAll(filters);
        return (Array.isArray(list) ? list : []).map((p) => {
            if (p?.settings != null) {
                try {
                    p.settings = typeof p.settings === 'string' ? JSON.parse(p.settings) : p.settings;
                } catch (_) { /* leave as is */ }
            }
            return p;
        });
    }

    async getProjectById(id) {
        const project = await projectRepository.findById(id);
        if (project?.settings != null) {
            try {
                project.settings = typeof project.settings === 'string'
                    ? JSON.parse(project.settings)
                    : project.settings;
            } catch (_) { /* leave as is */ }
        }
        return project;
    }

    async getProjectByPublicKey(publicKey) {
        return projectRepository.findByPublicKey(publicKey);
    }

    _normalizeProjectSlug(raw) {
        if (raw == null || raw === '') return '';
        return String(raw)
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
    }

    async createProject(data) {
        if (!data.public_key) {
            data.public_key = 'pk_' + crypto.randomBytes(12).toString('hex');
        }

        let slug = this._normalizeProjectSlug(data.slug);
        if (!slug) {
            slug = this._normalizeProjectSlug(data.name);
        }
        // Кириллица и прочие не-latin дают пустой slug; плейсхолдеры вида "___" / "---" тоже
        if (!slug || !/[a-z0-9]/.test(slug)) {
            slug = 'p-' + data.public_key.replace(/^pk_/, '').slice(0, 12);
        }

        const baseSlug = slug;
        let candidate = baseSlug;
        let guard = 0;
        while (await projectRepository.findBySlug(candidate)) {
            guard += 1;
            candidate = `${baseSlug}-${crypto.randomBytes(3).toString('hex')}`;
            if (guard > 50) {
                throw new Error('Could not allocate unique project slug');
            }
        }
        slug = candidate;

        const project = await projectRepository.create({
            name: data.name,
            slug,
            public_key: data.public_key,
            status: data.status || 'active',
            settings: data.settings ? JSON.stringify(data.settings) : null
        });

        await this._copyAiB2cFromTemplate(project.id);
        return project;
    }

    /**
     * Копирует настройки AI B2C (brain_contexts, stage_contexts) в новый проект.
     * Источники:
     *  - локальные настройки проекта-шаблона (project_id = AI_B2C_TEMPLATE_PROJECT_ID)
     *  - глобальные настройки (project_id IS NULL)
     */
    async _copyAiB2cFromTemplate(newProjectId) {
        try {
            const templateId = AI_B2C_TEMPLATE_PROJECT_ID;
            if (newProjectId === templateId) return;

            // 1. Brain contexts (Главный мозг)
            const brainRows = await db('ai_b2c_brain_contexts')
                .where('project_id', templateId)
                .orWhereNull('project_id');
            if (brainRows.length > 0) {
                await db('ai_b2c_brain_contexts').insert(
                    brainRows.map(({ id, created_at, updated_at, ...rest }) => ({
                        ...rest,
                        project_id: newProjectId
                    }))
                );
            }

            // 2. Stage contexts (Этапы/сценарии)
            const stageRows = await db('ai_b2c_stage_contexts')
                .where('project_id', templateId)
                .orWhereNull('project_id');
            if (stageRows.length > 0) {
                await db('ai_b2c_stage_contexts').insert(
                    stageRows.map(({ id, created_at, updated_at, ...rest }) => ({
                        ...rest,
                        project_id: newProjectId
                    }))
                );
            }
        } catch (err) {
            console.error('[ProjectService] Copy AI B2C from template failed:', err.message);
        }
    }

    async updateProject(id, data) {
        if (data.settings && typeof data.settings === 'object') {
            const existing = await projectRepository.findById(id);
            const existingSettings = (existing?.settings && typeof existing.settings === 'string')
                ? JSON.parse(existing.settings)
                : (existing?.settings && typeof existing.settings === 'object' ? existing.settings : {});
            const merged = { ...existingSettings, ...data.settings };
            data.settings = JSON.stringify(merged);
        }
        return projectRepository.update(id, data);
    }

    async suspendProject(id) {
        return projectRepository.delete(id);
    }
}

module.exports = new ProjectService();
