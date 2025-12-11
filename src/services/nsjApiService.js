const https = require('https');
const http = require('http');

/**
 * Сервис для работы с внешним API НСЖ (Накопительное страхование жизни)
 */
class NSJApiService {
    constructor() {
        this.apiUrl = process.env.NSJ_API_URL || 'https://demo.avinfors.ru/api-life/api/flow/';
        this.apiKey = process.env.NSJ_API_KEY || 'ede88df2c022e810fedc09d4';
    }

    /**
     * Вызов внешнего API НСЖ
     * @param {string} operation - Код операции (например, "Contract.LifeEndowment.calculate")
     * @param {Object} data - Данные для запроса
     * @returns {Promise<Object>} Ответ от API
     */
    async callApi(operation, data) {
        console.log('=== NSJ API CALL START ===');
        console.log('API URL:', this.apiUrl);
        console.log('API Key:', this.apiKey ? `${this.apiKey.substring(0, 10)}...` : 'NOT SET');
        console.log('Operation:', operation);
        
        return new Promise((resolve, reject) => {
            const requestData = JSON.stringify({
                operation,
                data
            });

            const url = new URL(this.apiUrl);
            const isHttps = url.protocol === 'https:';
            const client = isHttps ? https : http;

            console.log('Request URL:', url.href);
            console.log('Request hostname:', url.hostname);
            console.log('Request path:', url.pathname);
            console.log('Request method: POST');
            console.log('Request body:', requestData);

            const options = {
                hostname: url.hostname,
                port: url.port || (isHttps ? 443 : 80),
                path: url.pathname,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Length': Buffer.byteLength(requestData)
                }
            };
            
            console.log('Request options:', JSON.stringify({
                hostname: options.hostname,
                port: options.port,
                path: options.path,
                method: options.method,
                headers: {
                    'Content-Type': options.headers['Content-Type'],
                    'Authorization': options.headers['Authorization'] ? 'Bearer ***' : 'NOT SET',
                    'Content-Length': options.headers['Content-Length']
                }
            }, null, 2));

            console.log('Sending HTTP request...');
            const req = client.request(options, (res) => {
                console.log('Response received. Status:', res.statusCode, res.statusMessage);
                console.log('Response headers:', JSON.stringify(res.headers, null, 2));
                
                let responseData = '';

                res.on('data', (chunk) => {
                    responseData += chunk;
                });

                res.on('end', () => {
                    console.log('Response body received, length:', responseData.length);
                    console.log('Response body (first 500 chars):', responseData.substring(0, 500));
                    try {
                        // Извлекаем JSON из ответа (может содержать PHP warnings)
                        let jsonData = responseData;
                        const jsonStart = responseData.indexOf('{');
                        if (jsonStart > 0) {
                            jsonData = responseData.substring(jsonStart);
                        }
                        
                        const parsed = JSON.parse(jsonData);
                        if (res.statusCode >= 200 && res.statusCode < 300) {
                            resolve(parsed);
                        } else {
                            reject({
                                status: res.statusCode,
                                message: parsed.errors || 'API request failed',
                                data: parsed
                            });
                        }
                    } catch (e) {
                        reject({
                            status: res.statusCode,
                            message: 'Failed to parse response',
                            rawResponse: responseData
                        });
                    }
                });
            });

            req.on('error', (e) => {
                console.error('=== NSJ API REQUEST ERROR ===');
                console.error('Error message:', e.message);
                console.error('Error code:', e.code);
                console.error('Error stack:', e.stack);
                reject({
                    status: 500,
                    message: `Request failed: ${e.message}`,
                    error_code: e.code,
                    error_stack: e.stack
                });
            });

            req.write(requestData);
            req.end();
        });
    }

    /**
     * Расчет страховой суммы и рисков по жизни
     * @param {Object} params - Параметры расчета
     * @param {number} params.target_amount - Целевая сумма (страховая сумма)
     * @param {number} params.term_months - Срок в месяцах
     * @param {Object} params.client - Данные клиента (birth_date, sex, phone, email, fio)
     * @param {string} params.payment_variant - Вариант оплаты (0, 1, 2, 4, 12)
     * @param {string} params.program - Код продукта НСЖ (по умолчанию "base")
     * @returns {Promise<Object>} Результат расчета
     */
    async calculateLifeInsurance(params) {
        console.log('=== calculateLifeInsurance called ===');
        console.log('Params:', JSON.stringify(params, null, 2));
        console.log('API URL from env:', process.env.NSJ_API_URL || 'NOT SET (using default)');
        console.log('API Key from env:', process.env.NSJ_API_KEY ? `${process.env.NSJ_API_KEY.substring(0, 10)}...` : 'NOT SET (using default)');
        
        const {
            target_amount,
            term_months,
            client = {},
            payment_variant = 0, // 0 - единовременно, 12 - ежемесячно
            program = process.env.NSJ_DEFAULT_PROGRAM || 'test'
        } = params;

        // Преобразуем срок из месяцев в годы
        const term = Math.floor(term_months / 12);

        // Форматируем дату начала (сегодня)
        const beginDate = this.formatDate(new Date());

        // Форматируем дату рождения клиента
        let dob = null;
        let age = null;
        if (client.birth_date) {
            dob = this.formatDateOnly(new Date(client.birth_date)); // Для dob нужен формат без времени
            age = this.calculateAge(client.birth_date);
        } else if (client.age) {
            age = client.age;
        }

        // Преобразуем пол
        let sex = null;
        if (client.sex) {
            sex = client.sex.toLowerCase() === 'male' || client.sex.toLowerCase() === 'm' ? 'male' : 'female';
        }

        // Форматируем телефон
        let phone = client.phone;
        if (phone && !phone.startsWith('+7')) {
            phone = phone.replace(/[^0-9]/g, '');
            if (phone.length === 10) {
                phone = '+7' + phone;
            } else if (phone.length === 11 && phone.startsWith('7')) {
                phone = '+' + phone;
            }
        }

        // Собираем данные для запроса
        const requestData = {
            beginDate,
            insConditions: {
                program,
                currency: 'RUR',
                paymentVariant: parseInt(payment_variant),
                term
            },
            calcData: {
                valuationType: 'byLimit',
                limit: parseFloat(target_amount.toFixed(2))
            }
        };

        // Добавляем данные страхователя, если есть
        if (dob || age) {
            requestData.policyHolder = {};
            if (dob) requestData.policyHolder.dob = dob;
            if (age) requestData.policyHolder.age = age;
            if (sex) requestData.policyHolder.sex = sex;
        }

        // Добавляем данные застрахованного
        requestData.insuredPerson = {
            isPolicyHolder: true // По умолчанию застрахованный = страхователь
        };

        // Если есть отдельные данные для застрахованного
        if (client.insured_person) {
            if (client.insured_person.is_policy_holder === false) {
                requestData.insuredPerson.isPolicyHolder = false;
                if (client.insured_person.birth_date) {
                    requestData.insuredPerson.dob = this.formatDateOnly(new Date(client.insured_person.birth_date)); // Для dob нужен формат без времени
                    requestData.insuredPerson.age = this.calculateAge(client.insured_person.birth_date);
                }
                if (client.insured_person.sex) {
                    requestData.insuredPerson.sex = client.insured_person.sex.toLowerCase() === 'male' || client.insured_person.sex.toLowerCase() === 'm' ? 'male' : 'female';
                }
            }
        }

        // Добавляем данные клиента, если есть
        if (client.fio || phone || client.email) {
            requestData.client = {};
            if (client.fio) requestData.client.name = client.fio;
            if (phone) requestData.client.phone = phone;
            if (client.email) requestData.client.email = client.email;
        }

        try {
            // Логируем запрос для отладки
            console.log('NSJ API Request:', JSON.stringify(requestData, null, 2));
            
            const response = await this.callApi('Contract.LifeEndowment.calculate', requestData);
            
            // Логируем ответ для отладки
            console.log('NSJ API Response:', JSON.stringify(response, null, 2));

            if (!response.success) {
                throw {
                    status: 400,
                    message: 'NSJ API returned error',
                    errors: response.errors || []
                };
            }

            // В новой версии API структура ответа может быть другой - data содержит результаты напрямую
            let results = response.data;
            if (response.data && response.data.results) {
                results = response.data.results;
            }
            
            if (!results) {
                throw {
                    status: 500,
                    message: 'Invalid response format from NSJ API'
                };
            }

            // Проверяем успешность: либо есть поле success=true, либо есть данные (risks или premium)
            const hasData = results.risks && results.risks.length > 0 || results.premium !== undefined;
            if (results.success === false || (!results.success && !hasData)) {
                // Логируем детали ошибки
                console.error('NSJ calculation failed. Results:', JSON.stringify(results, null, 2));
                console.error('Response data:', JSON.stringify(response.data, null, 2));
                
                throw {
                    status: 400,
                    message: 'NSJ calculation failed',
                    warnings: results.warnings || [],
                    errors: response.data?.errors || [],
                    full_response: response.data // Полный ответ для отладки
                };
            }
            
            // Если success не указан, но есть данные - считаем успешным
            if (!results.success && hasData) {
                console.log('NSJ API returned data without success field, treating as successful');
            }

            // Форматируем ответ для нашего API со всеми данными из NSJ API
            return {
                success: true,
                term: results.term,
                term_years: results.term,
                garantProfit: results.garantProfit || 0,
                risks: results.risks || [],
                total_premium: results.premiumRUR || results.premium,
                total_premium_rur: results.premiumRUR || results.premium,
                total_limit: results.limit,
                payTerm: results.payTerm,
                payEndDate: results.payEndDate,
                comission: results.comission || null,
                rvd: results.rvd || null,
                cashSurrenderValues: results.cashSurrenderValues || null,
                payments_list: results.paymentsList || results.payments_list || [],
                warnings: response.data?.warnings || [],
                calculation_date: response.data?.date || Date.now(),
                // Полный ответ для отладки
                raw_response: response.data
            };
        } catch (error) {
            console.error('NSJ API error:', error);
            throw error;
        }
    }

    /**
     * Форматирует дату в формат DD.MM.YYYY hh:mm:ss
     * @param {Date} date
     * @returns {string}
     */
    formatDate(date) {
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        return `${day}.${month}.${year} 00:00:00`;
    }

    /**
     * Форматирует дату в формат DD.MM.YYYY (без времени, для dob)
     * @param {Date} date
     * @returns {string}
     */
    formatDateOnly(date) {
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        return `${day}.${month}.${year}`;
    }

    /**
     * Вычисляет возраст по дате рождения
     * @param {string|Date} birthDate
     * @returns {number}
     */
    calculateAge(birthDate) {
        const birth = new Date(birthDate);
        const today = new Date();
        let age = today.getFullYear() - birth.getFullYear();
        const monthDiff = today.getMonth() - birth.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
            age--;
        }
        return age;
    }
}

module.exports = new NSJApiService();

