require('dotenv').config();

// Railway provides MYSQL_URL, parse it if available
const parseMySQLUrl = (url) => {
    if (!url) return null;

    try {
        const urlObj = new URL(url);
        return {
            host: urlObj.hostname,
            port: Number(urlObj.port) || 3306,
            user: urlObj.username,
            password: urlObj.password,
            database: urlObj.pathname.slice(1) // Remove leading '/'
        };
    } catch (e) {
        return null;
    }
};

const railwayConnection = parseMySQLUrl(process.env.MYSQL_URL);

module.exports = {
    development: {
        client: 'mysql2',
        connection: railwayConnection || {
            host: process.env.DB_HOST || '127.0.0.1',
            port: Number(process.env.DB_PORT) || 3306,
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'pfp_service'
        },
        migrations: {
            directory: './database/migrations'
        },
        seeds: {
            directory: './database/seeds'
        }
    },
    production: {
        client: 'mysql2',
        connection: railwayConnection || {
            host: process.env.DB_HOST,
            port: Number(process.env.DB_PORT) || 3306,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME
        },
        migrations: {
            directory: './database/migrations'
        },
        pool: {
            min: 2,
            max: 10
        }
    }
};
