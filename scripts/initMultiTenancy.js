require('dotenv').config();
const db = require('../src/config/database');
const projectService = require('../src/services/projectService');
const authService = require('../src/services/authService');
const bcrypt = require('bcryptjs');

async function init() {
    try {
        console.log('🚀 Initializing Multi-Tenancy...');

        // 1. Create Default Project
        const existingProject = await db('projects').where({ slug: 'default' }).first();
        let project;
        if (!existingProject) {
            project = await projectService.createProject({
                name: 'Default Project',
                slug: 'default',
                settings: { theme: 'dark' }
            });
            console.log('✅ Created Default Project:', project.name, '| Key:', project.public_key);
        } else {
            project = existingProject;
            console.log('ℹ️ Default Project already exists:', project.name);
        }

        // 2. Create Super Admin
        const superAdminEmail = 'super@pfp.ai';
        const existingSuperUser = await db('users').where({ email: superAdminEmail }).first();

        if (!existingSuperUser) {
            const passwordHash = await bcrypt.hash('super-secret-pass', 10);
            await db('users').insert({
                email: superAdminEmail,
                password_hash: passwordHash,
                name: 'System Super Admin',
                role: 'super_admin',
                is_active: true
            });
            console.log('✅ Created Super Admin:', superAdminEmail);
        } else {
            // Update role just in case
            await db('users').where({ email: superAdminEmail }).update({ role: 'super_admin' });
            console.log('ℹ️ Super Admin already exists:', superAdminEmail);
        }

        console.log('✨ Initialization complete!');
        process.exit(0);
    } catch (err) {
        console.error('❌ Error during initialization:', err);
        process.exit(1);
    }
}

init();
