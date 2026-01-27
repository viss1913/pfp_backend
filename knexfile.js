require('dotenv').config();
const path = require('path');

// Railway provides MYSQL_URL (internal) and MYSQL_PUBLIC_URL (external)
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

// PRIORITIZE MYSQL_PUBLIC_URL for local dev, then MYSQL_URL for prod
const railwayConnection = parseMySQLUrl(process.env.MYSQL_PUBLIC_URL) || parseMySQLUrl(process.env.MYSQL_URL);

const getConnection = () => {
    let conn;

    if (process.env.MYSQL_PUBLIC_URL) {
        conn = process.env.MYSQL_PUBLIC_URL;
    } else if (process.env.MYSQLHOST) {
        conn = {
            host: process.env.MYSQLHOST,
            port: Number(process.env.MYSQLPORT) || 3306,
            user: process.env.MYSQLUSER || 'root',
            password: process.env.MYSQLPASSWORD || process.env.MYSQL_ROOT_PASSWORD,
            database: process.env.MYSQLDATABASE || 'railway'
        };
    } else if (process.env.MYSQL_URL) {
        conn = process.env.MYSQL_URL;
    } else {
        conn = {
            host: process.env.DB_HOST || '127.0.0.1',
            port: Number(process.env.DB_PORT) || 3306,
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'pfp_service'
        };
    }

    console.log('🔌 DB Connection Method:', typeof conn === 'string' ? 'URL String' : 'Config Object');
    if (typeof conn === 'object') {
        console.log('🔌 DB Config:', { ...conn, password: '****' });
    } else {
        console.log('🔌 DB URL:', conn.replace(/:[^:@]+@/, ':****@'));
    }

    // Try to ensure SSL is used for external connections
    if (typeof conn === 'object') {
        return { ...conn, ssl: { rejectUnauthorized: false } };
    }

    return conn;
};

console.log('🔌 DB Config:', {
    host: getConnection().host,
    user: getConnection().user,
    database: getConnection().database,
    port: getConnection().port
});

module.exports = {
    development: {
        client: 'mysql2',
        connection: getConnection(),
        migrations: {
            directory: path.join(__dirname, 'database', 'migrations')
        },
        seeds: {
            directory: path.join(__dirname, 'database', 'seeds')
        }
    },
    production: {
        client: 'mysql2',
        connection: getConnection(),
        migrations: {
            directory: path.join(__dirname, 'database', 'migrations')
        },
        seeds: {
            directory: path.join(__dirname, 'database', 'seeds')
        },
        pool: {
            min: 2,
            max: 10
        }
    }
};
