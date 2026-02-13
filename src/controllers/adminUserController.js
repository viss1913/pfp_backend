const db = require('../config/database');
const bcrypt = require('bcryptjs');

class AdminUserController {
    /**
     * Get all users with their project information
     */
    async getAllUsers(req, res) {
        try {
            const users = await db('users')
                .leftJoin('projects', 'users.project_id', 'projects.id')
                .select(
                    'users.id',
                    'users.email',
                    'users.name',
                    'users.role',
                    'users.is_active',
                    'users.project_id',
                    'projects.name as project_name'
                );

            const projectId = req.projectId || req.user?.projectId;
            if (projectId) {
                users.where('users.project_id', projectId);
            }
            res.json(users);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    /**
     * Create a new user and optionally assign to a project
     */
    async createUser(req, res) {
        try {
            const { email, password, name, role, projectId } = req.body;

            // Basic validation
            if (!email || !password || !role) {
                return res.status(400).json({ error: 'Email, password and role are required' });
            }

            // Check if user exists
            const existingUser = await db('users').where({ email }).first();
            if (existingUser) {
                return res.status(400).json({ error: 'User already exists' });
            }

            const passwordHash = await bcrypt.hash(password, 10);

            const [userId] = await db('users').insert({
                email,
                password_hash: passwordHash,
                name,
                role,
                project_id: projectId || null,
                is_active: true,
                created_at: new Date(),
                updated_at: new Date()
            });

            res.status(201).json({
                message: 'User created successfully',
                id: userId
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    /**
     * Update user role or project assignment
     */
    async updateUser(req, res) {
        try {
            const { id } = req.params;
            const { role, projectId, is_active, name } = req.body;

            const updateData = {
                updated_at: new Date()
            };

            if (role) updateData.role = role;
            if (projectId !== undefined) updateData.project_id = projectId;
            if (is_active !== undefined) updateData.is_active = is_active;
            if (name) updateData.name = name;

            await db('users').where({ id }).update(updateData);

            res.json({ message: 'User updated successfully' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
}

module.exports = new AdminUserController();
