const resolutService = require('./resolutService');

const RESOLUT_ASSET_CODE = process.env.RESOLUT_NSJ_PFP_CODE || 'assetShort';

function formatDobDdMmYyyy(birthDate) {
    const d = birthDate instanceof Date ? birthDate : new Date(birthDate);
    if (Number.isNaN(d.getTime())) return '01.01.1985';
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}.${month}.${year}`;
}

function normalizeSex(client) {
    const clientSex = client.gender || client.sex;
    if (!clientSex) return 'male';
    const s = String(clientSex).toLowerCase();
    if (s === 'm' || s === 'male' || s === 'мужской') return 'male';
    if (s === 'f' || s === 'female' || s === 'женский') return 'female';
    return 'male';
}

/**
 * Котировка НСЖ через Резолют PFP API (assetShort), ответ в форме, совместимой с LifeInsuranceCalculator / nsjApiService.
 */
async function quoteLifeAsNsjShape(params, projectId, userId) {
    const {
        target_amount,
        term_months,
        client = {},
        payment_variant = 12
    } = params;

    const termYears = Math.max(1, Math.floor(Number(term_months || 120) / 12));
    const limit = parseFloat(Number(target_amount).toFixed(2));
    if (!Number.isFinite(limit) || limit <= 0) {
        throw new Error('Resolut quote requires positive target_amount (insurance limit)');
    }
    const pv = Number.isFinite(Number(payment_variant)) ? Number(payment_variant) : 12;
    const pType = Number.isFinite(parseInt(String(pv), 10)) ? parseInt(String(pv), 10) : 12;
    const dob = client.birth_date
        ? formatDobDdMmYyyy(client.birth_date)
        : formatDobDdMmYyyy(new Date('1985-01-01'));

    const body = {
        code: RESOLUT_ASSET_CODE,
        parameters: {
            currency: 'RUR',
            pType,
            term: termYears,
            insuredPerson: { dob, sex: normalizeSex(client) },
            calcData: { valuationType: 'byLimit', limit }
        }
    };

    const norm = await resolutService.quote(projectId, body, { userId });
    if (!norm.ok || norm.err) {
        const msg = norm.err ? (norm.err.message || String(norm.err.code || 'Resolut quote error')) : 'Resolut quote failed';
        throw new Error(msg);
    }
    const d = norm.data || {};
    const premium = d.premiumFull != null ? d.premiumFull : d.premium;
    if (!Number.isFinite(Number(premium))) {
        throw new Error('Resolut quote returned no premium; check product parameters and upstream errors');
    }

    return {
        success: true,
        term: termYears,
        term_years: termYears,
        garantProfit: d.garantProfit || 0,
        risks: d.risks || [],
        total_premium: premium,
        total_premium_rur: premium,
        total_limit: d.limit,
        payTerm: d.payTerm,
        payEndDate: d.payEndDate,
        comission: d.comission || null,
        program: RESOLUT_ASSET_CODE
    };
}

module.exports = {
    quoteLifeAsNsjShape,
    RESOLUT_ASSET_CODE,
    formatDobDdMmYyyy,
    normalizeSex
};
