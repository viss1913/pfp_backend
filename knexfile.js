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

// Try MYSQL_URL first, then fall back to individual variables
const railwayConnection = parseMySQLUrl(process.env.MYSQL_URL);

// Railway also provides individual MYSQL* variables
const getConnection = () => {
    if (railwayConnection) {
        return railwayConnection;
    }

    // Check for Railway's individual variables (MYSQLHOST, MYSQLUSER, etc.)
    if (process.env.MYSQLHOST) {
        return {
            host: process.env.MYSQLHOST,
            port: Number(process.env.MYSQLPORT) || 3306,
            user: process.env.MYSQLUSER,
            password: process.env.MYSQLPASSWORD,
            database: process.env.MYSQLDATABASE
        };
    }

    // Fall back to custom DB_* variables for local development
    return {
        host: process.env.DB_HOST || '127.0.0.1',
        port: Number(process.env.DB_PORT) || 3306,
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'pfp_service'
    };
};

module.exports = {
    development: {
        client: 'mysql2',
        connection: getConnection(),
        migrations: {
            directory: './database/migrations'
        },
        seeds: {
            directory: './database/seeds'
        }
    },
    production: {
        client: 'mysql2',
        connection: getConnection(),
        migrations: {
            directory: './database/migrations'
        },
        seeds: {
            directory: './database/seeds'
        },
        pool: {
            min: 2,
            max: 10
        }
    }
};
