const db = require('../config/database');

class PensionPayoutCoefficientsRepository {
    async findAll(projectId = null) {
        const query = db('pension_payout_coefficients').select('*');

        query.where((builder) => {
            if (projectId) {
                builder.where('project_id', projectId).orWhereNull('project_id');
            } else {
                builder.whereNull('project_id');
            }
        });

        return query.orderBy('gender', 'asc').orderBy('age', 'asc');
    }

    async findById(id, projectId = null) {
        const query = db('pension_payout_coefficients').where({ id });
        if (projectId) {
            query.where((builder) => {
                builder.where('project_id', projectId).orWhereNull('project_id');
            });
        } else {
            query.whereNull('project_id');
        }
        return query.first();
    }

    async findByGenderAndAge(gender, age, projectId = null) {
        if (projectId) {
            const projectRow = await db('pension_payout_coefficients')
                .where({ gender, age, project_id: projectId })
                .first();
            if (projectRow) return projectRow;
        }

        return db('pension_payout_coefficients')
            .where({ gender, age })
            .whereNull('project_id')
            .first();
    }

    async findDuplicate(gender, age, projectId = null, excludeId = null) {
        const query = db('pension_payout_coefficients')
            .where({ gender, age });

        if (projectId) {
            query.where('project_id', projectId);
        } else {
            query.whereNull('project_id');
        }

        if (excludeId != null) {
            query.whereNot('id', excludeId);
        }

        return query.first();
    }

    async create(data, projectId = null) {
        const [id] = await db('pension_payout_coefficients').insert({
            gender: data.gender,
            age: parseInt(data.age, 10),
            coefficient: data.coefficient,
            project_id: projectId,
        });
        return id;
    }

    async update(id, data, projectId = null) {
        const updateData = { updated_at: new Date() };

        if (data.gender !== undefined) updateData.gender = data.gender;
        if (data.age !== undefined) updateData.age = parseInt(data.age, 10);
        if (data.coefficient !== undefined) updateData.coefficient = data.coefficient;

        const query = db('pension_payout_coefficients').where({ id });
        if (projectId) {
            query.where('project_id', projectId);
        } else {
            query.whereNull('project_id');
        }

        return query.update(updateData);
    }

    async delete(id, projectId = null) {
        const query = db('pension_payout_coefficients').where({ id });
        if (projectId) {
            query.where('project_id', projectId);
        } else {
            query.whereNull('project_id');
        }
        return query.del();
    }
}

module.exports = new PensionPayoutCoefficientsRepository();
