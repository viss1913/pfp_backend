const https = require('https');

/**
 * Сервис для работы с внешним API НСЖ (Накопительное страхование жизни)
 */
class NSJService {
    constructor() {
        // URL тестовой среды API НСЖ
        this.apiUrl = process.env.NSJ_API_URL || 'https://demo.avinfors.ru/api-life/api/flow/';
        // API ключ для авторизации
        this.apiKey = process.env.NSJ_API_KEY || 'ede88df2c022e810fedc09d4';
    }

    /**
     * Форматирует дату в формат DD.MM.YYYY hh:mm:ss
     * @param {Date|string} date - Дата для форматирования
     * @returns {string} Отформатированная дата
     */
    formatDate(date) {
        let d;
        if (date instanceof Date) {
            d = date;
        } else if (typeof date === 'string') {
            d = new Date(date);
        } else {
            d = new Date(); // Текущая дата по умолчанию
        }

        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        return `${day}.${month}.${year} 00:00:00`;
    }

    /**
     * Вычисляет возраст по дате рождения
     * @param {Date|string} birthDate - Дата рождения
     * @returns {number} Возраст
     */
    calculateAge(birthDate) {
        const birth = birthDate instanceof Date ? birthDate : new Date(birthDate);
        const today = new Date();
        let age = today.getFullYear() - birth.getFullYear();
        const monthDiff = today.getMonth() - birth.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
            age--;
        }
        return age;
    }

    /**
     * Нормализует пол (male/female)
     * @param {string} sex - Пол (может быть "M", "F", "male", "female" и т.д.)
     * @returns {string} "male" или "female"
     */
    normalizeSex(sex) {
        if (!sex) return 'male'; // По умолчанию
        const normalized = String(sex).toLowerCase();
        if (normalized === 'm' || normalized === 'male' || normalized === 'мужской') {
            return 'male';
        }
        if (normalized === 'f' || normalized === 'female' || normalized === 'женский') {
            return 'female';
        }
        return 'male'; // По умолчанию
    }

    /**
     * Нормализует телефон в формат +79999999999
     * @param {string} phone - Телефон
     * @returns {string} Нормализованный телефон
     */
    normalizePhone(phone) {
        if (!phone) return '';
        // Удаляем все нецифровые символы кроме +
        let cleaned = phone.replace(/[^\d+]/g, '');
        // Если начинается с 8, заменяем на +7
        if (cleaned.startsWith('8')) {
            cleaned = '+7' + cleaned.substring(1);
        }
        // Если начинается с 7, добавляем +
        if (cleaned.startsWith('7') && !cleaned.startsWith('+7')) {
            cleaned = '+' + cleaned;
        }
        // Если не начинается с +, добавляем +7
        if (!cleaned.startsWith('+')) {
            cleaned = '+7' + cleaned;
        }
        return cleaned;
    }

    /**
     * Выполняет HTTP POST запрос к API НСЖ
     * @param {Object} requestData - Данные запроса
     * @returns {Promise<Object>} Ответ от API
     */
    async makeRequest(requestData) {
        return new Promise((resolve, reject) => {
            const url = new URL(this.apiUrl);
            const postData = JSON.stringify(requestData);

            const options = {
                hostname: url.hostname,
                port: url.port || 443,
                path: url.pathname,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Length': Buffer.byteLength(postData)
                }
            };

            const req = https.request(options, (res) => {
                let data = '';

                res.on('data', (chunk) => {
                    data += chunk;
                });

                res.on('end', () => {
                    try {
                        // Извлекаем JSON из ответа (может содержать PHP warnings)
                        let jsonData = data;
                        const jsonStart = data.indexOf('{');
                        if (jsonStart > 0) {
                            jsonData = data.substring(jsonStart);
                        }
                        
                        const parsed = JSON.parse(jsonData);
                        if (res.statusCode >= 200 && res.statusCode < 300) {
                            resolve(parsed);
                        } else {
                            reject({
                                statusCode: res.statusCode,
                                response: parsed,
                                message: `API returned status ${res.statusCode}`
                            });
                        }
                    } catch (e) {
                        reject({
                            statusCode: res.statusCode,
                            response: data,
                            message: `Failed to parse response: ${e.message}`
                        });
                    }
                });
            });

            req.on('error', (e) => {
                reject({
                    message: `Request failed: ${e.message}`,
                    error: e
                });
            });

            req.write(postData);
            req.end();
        });
    }

    /**
     * Получает список доступных продуктов НСЖ
     * @returns {Promise<Array>} Список продуктов
     */
    async getProducts() {
        try {
            const requestData = {
                operation: 'Contract.LifeEndowment.getProducts',
                data: {}
            };
            const response = await this.makeRequest(requestData);
            if (response.success && response.data) {
                return response.data;
            }
            throw new Error('Failed to get products list');
        } catch (error) {
            console.error('NSJ getProducts Error:', error);
            throw error;
        }
    }

    /**
     * Выполняет расчет НСЖ для цели типа LIFE
     * @param {Object} goal - Данные цели из запроса расчета
     * @param {Object} client - Данные клиента (опционально)
     * @returns {Promise<Object>} Результат расчета НСЖ
     */
    async calculateLifeInsurance(goal, client = null) {
        try {
            // Преобразуем срок из месяцев в годы
            const termYears = Math.floor(goal.term_months / 12);

            // Формируем дату начала страхования (сегодня)
            const beginDate = this.formatDate(new Date());

            // Формируем данные для запроса
            const requestData = {
                operation: 'Contract.LifeEndowment.calculate',
                data: {
                    beginDate: beginDate,
                    insConditions: {
                        program: goal.program || process.env.NSJ_DEFAULT_PROGRAM || 'test', // Используем 'test' как программу по умолчанию
                        currency: 'RUR',
                        paymentVariant: goal.payment_variant || 0, // 0 - единовременно, можно сделать настраиваемым
                        term: termYears
                    },
                    calcData: {
                        valuationType: 'byLimit',
                        limit: parseFloat(goal.target_amount.toFixed(2))
                    }
                }
            };

            // Добавляем данные страхователя и застрахованного, если есть данные клиента
            if (client) {
                if (client.birth_date) {
                    const dob = this.formatDate(client.birth_date);
                    const age = this.calculateAge(client.birth_date);
                    const sex = this.normalizeSex(client.sex);

                    requestData.data.policyHolder = {
                        dob: dob,
                        age: age,
                        sex: sex
                    };

                    // Застрахованный - тот же, что и страхователь
                    requestData.data.insuredPerson = {
                        isPolicyHolder: true
                    };
                }

                // Добавляем данные клиента (контакты)
                if (client.fio || client.name || client.phone || client.email) {
                    requestData.data.client = {};
                    if (client.fio || client.name) {
                        requestData.data.client.name = client.fio || client.name;
                    }
                    if (client.phone) {
                        requestData.data.client.phone = this.normalizePhone(client.phone);
                    }
                    if (client.email) {
                        requestData.data.client.email = client.email;
                    }
                }
            } else {
                // Если нет данных клиента, создаем минимальные данные
                requestData.data.insuredPerson = {
                    isPolicyHolder: true
                };
            }

            // Выполняем запрос
            const response = await this.makeRequest(requestData);

            // Проверяем успешность ответа
            if (!response.success) {
                throw new Error(`NSJ API returned success: false. Errors: ${JSON.stringify(response.errors || [])}`);
            }

            // Проверяем успешность расчета
            // В новой версии API структура ответа может быть другой - data содержит результаты напрямую
            let results = response.data;
            if (response.data && response.data.results) {
                results = response.data.results;
            }
            
            if (!results || !results.success) {
                throw new Error(`NSJ calculation failed. Warnings: ${JSON.stringify(response.data?.warnings || [])}`);
            }
            return {
                success: true,
                term: results.term || termYears,
                term_years: results.term || termYears,
                risks: results.risks || [],
                total_premium: results.premium || results.premiumRUR || 0,
                total_premium_rur: results.premiumRUR || results.premium || 0,
                total_limit: results.limit || 0,
                payments_list: results.paymentsList || results.payments_list || [],
                warnings: response.data?.warnings || [],
                calculation_date: response.data?.date || Date.now(),
                raw_response: response.data // Полный ответ для отладки
            };
        } catch (error) {
            console.error('NSJ API Error:', error);
            throw {
                success: false,
                error: error.message || 'Unknown error',
                details: error.response || error
            };
        }
    }
}

module.exports = new NSJService();

