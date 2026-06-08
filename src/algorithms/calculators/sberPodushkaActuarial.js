/**
 * Актуарный расчёт «Подушка безопасности» — порт docs/partners/sber/Podushka final.py
 * Годовая премия prem_all_1, подписка prem_all_12 (k_12=1.06), округление до 5 ₽.
 */

const I_YEAR = 0.03;
const I_LOAD_MAIN = 0.15;
const I_LOAD_DOP = 0.30;
const SS_TRAUMA_RATIO = 0.3;
const K_12 = 1.06;
const LOSS_TRAUMA = 0.07;
const STEP = 12;

const DAC_RAW = [
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.6915, 0.8085, 0.9375, 1.0725, 1.2165, 1.3695, 1.5315, 1.7025, 1.872, 2.037, 2.2005, 2.361, 2.5155, 2.658, 2.787, 2.907, 3.021, 3.138, 3.261, 3.3945, 3.5475, 3.7245, 3.927, 4.146, 4.3845, 4.6485, 4.941, 5.2635, 5.6085, 5.9805, 6.384, 6.8295, 7.677, 8.208, 8.7645, 9.354, 9.9855, 10.662, 11.358, 12.0795, 12.8415, 13.659, 14.5365, 15.456, 16.422, 17.457, 18.579, 19.7835, 21.0345, 22.335, 23.7195, 25.224, 26.865, 28.6215, 30.513, 32.5815, 34.857, 37.32, 39.8685, 42.495, 45.2415, 48.1575, 51.528, 55.1355, 58.995, 63.1245, 67.5435, 72.2715],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.3225, 0.3555, 0.3915, 0.4275, 0.4695, 0.5145, 0.564, 0.618, 0.6735, 0.729, 0.7845, 0.843, 0.9015, 0.9585, 1.0155, 1.0725, 1.131, 1.1925, 1.2555, 1.3215, 1.392, 1.47, 1.554, 1.644, 1.7415, 1.8465, 1.965, 2.097, 2.241, 2.3985, 2.574, 2.772, 3.1425, 3.393, 3.663, 3.9555, 4.275, 4.617, 4.968, 5.3265, 5.7015, 6.105, 6.549, 7.029, 7.5645, 8.172, 8.8725, 9.672, 10.554, 11.5335, 12.6525, 13.9485, 15.4515, 17.1525, 19.092, 21.33, 23.9175, 26.856, 30.057, 33.54, 37.383, 41.658, 45.4065, 49.494, 53.949, 58.803, 64.0965, 69.864],
];

const TPD_RAW = [
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.216, 0.216, 0.216, 0.216, 0.216, 0.216, 0.216, 0.216, 0.216, 0.216, 0.216, 0.216, 0.216, 0.2415, 0.273, 0.3135, 0.3585, 0.408, 0.471, 0.5385, 0.6165, 0.7065, 0.813, 0.9045, 1.0185, 1.146, 1.2885, 1.4415, 1.602, 1.77, 1.944, 2.1345, 2.457, 2.6865, 2.9325, 3.1875, 3.4515, 3.7215, 4.0065, 4.3125, 4.6335, 4.986, 5.3685, 5.7795, 6.219, 6.684, 7.1835, 7.7235, 8.319, 8.9595, 9.6495, 10.392, 11.2545],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.162, 0.162, 0.162, 0.162, 0.162, 0.162, 0.162, 0.162, 0.162, 0.162, 0.162, 0.162, 0.162, 0.183, 0.21, 0.2445, 0.2835, 0.3255, 0.381, 0.441, 0.5115, 0.5925, 0.6915, 0.7785, 0.8865, 1.008, 1.146, 1.2975, 1.4565, 1.6275, 1.8075, 2.007, 2.334, 2.58, 2.844, 3.123, 3.417, 3.7215, 4.047, 4.398, 4.773, 5.1855, 5.637, 6.1275, 6.654, 7.218, 7.83, 8.496, 9.2265, 10.02, 10.8825, 11.8185, 12.918],
];

const AD_RAW = [
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05],
];

const TAD_RAW = [
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42],
];

const TRAUMA_RAW = [
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40],
];

/** Python np.transpose(np.array(table) * 1/1000) → [ageIdx][genderIdx] */
function transposeMortalityTable(raw) {
    const len = raw[0].length;
    const out = [];
    for (let i = 0; i < len; i++) {
        out.push([raw[0][i] / 1000, raw[1][i] / 1000]);
    }
    return out;
}

const DAC = transposeMortalityTable(DAC_RAW);
const TPD = transposeMortalityTable(TPD_RAW);
const AD = transposeMortalityTable(AD_RAW);
const TAD = transposeMortalityTable(TAD_RAW);
const TRAUMA = transposeMortalityTable(TRAUMA_RAW);

function intDiv(x, step) {
    return Math.trunc(x / step);
}

function it(t, ratesTable, step = 1) {
    const lenArray = ratesTable.length;
    if (intDiv(t, step) >= lenArray) {
        return Infinity;
    }
    if (lenArray === 1) {
        return (1 + ratesTable[0]) ** (1 / step) - 1;
    }
    const tInt = intDiv(t, step);
    const coef = 1 + ratesTable[tInt];
    return coef ** (1 / step) - 1;
}

function vt(t, ratesTable, step = 1) {
    return 1 / (1 + it(Math.max(0, t), ratesTable, step));
}

function vnT(t, n, ratesTable, step = 1) {
    let temp = 1;
    if (n < 0) return 1;
    for (let k = 0; k < n; k++) {
        temp *= vt(t + k, ratesTable, step);
    }
    return temp;
}

function pxTbQx(x, gender, tbQx, otn = 0, abs = 0, step = 1) {
    const lenArray = tbQx.length;
    if (intDiv(x, step) + 1 >= lenArray) return 1.0;
    if (lenArray === 1) {
        return (1 - (tbQx[0][0] * (1 + otn) + abs)) ** (1 / step);
    }
    const idx = intDiv(x, step);
    const gIdx = gender - 1;
    if (tbQx[idx][gIdx] === 1) return 0.0;
    if (x >= 0) {
        return (1 - (tbQx[idx][gIdx] * (1 + otn) + abs)) ** (1 / step);
    }
    return 1.0;
}

function qxTbQx(x, gender, tbQx, otn = 0, abs = 0, step = 1, uw = 0) {
    if (uw > 10) {
        return (1 - pxTbQx(x, gender, tbQx, otn, abs, step)) * (1 + uw / 100);
    }
    return (1 - pxTbQx(x, gender, tbQx, otn, abs, step)) + uw / 1000;
}

function npxTbQx(n, x, gender, tbQx, otn = 0, abs = 0, step = 1, uw = 0) {
    if (n <= 0) return 1;
    const lenArray = tbQx.length;
    if (lenArray > 1) {
        if (tbQx[intDiv(x, step)][gender - 1] === 1) return 0;
        if (intDiv(x, step) + 1 >= lenArray) return 1.0;
    }
    let result = 1;
    for (let i = 0; i < n; i++) {
        result *= 1 - qxTbQx(x + i, gender, tbQx, otn, abs, step, uw);
    }
    return result;
}

function nExTTbQx(t, n, x, gender, ratesTable, tbQx, otn = 0, abs = 0, step = 1, uw = 0) {
    if (n < 0) return 1;
    return npxTbQx(n, x, gender, tbQx, otn, abs, step, uw) * vnT(t, n, ratesTable, step);
}

function axnTPrenTbQx(t, n, x, gender, ratesTable, tbQx, otn = 0, abs = 0, step = 1, uw = 0, periodicity = 1) {
    let temp = 0;
    let nExTSt = 1;
    const mod = 12 / periodicity;
    for (let k = 0; k < n; k++) {
        if (k % mod === 0) {
            temp += nExTSt / step;
        }
        nExTSt *= nExTTbQx(t + k, 1, x + k, gender, ratesTable, tbQx, otn, abs, step, uw);
    }
    return temp;
}

function ax1nTTbQx(t, n, x, gender, ratesTable, tbQx, otn = 0, abs = 0, step = 1, uw = 0) {
    let temp = 0;
    let nExTSt = 1;
    for (let k = 1; k <= n; k++) {
        temp += nExTSt * qxTbQx(x + k - 1, gender, tbQx, otn, abs, step, uw) * vt(t + k - 1, ratesTable, step);
        nExTSt *= nExTTbQx(t + k - 1, 1, x + k - 1, gender, ratesTable, tbQx, otn, abs, step, uw);
    }
    return temp;
}

function ax2table1nTTbQx(t, n, x, gender, ratesTable, tbQx, dsbTb, otn = 0, abs = 0, step = 1, uw = 0) {
    let temp = 0;
    let nExTSt = 1;
    for (let k = 1; k <= n; k++) {
        temp += nExTSt * qxTbQx(x + k - 1, gender, dsbTb, otn, abs, step, uw) * vt(t + k - 1, ratesTable, step);
        nExTSt *= nExTTbQx(t + k - 1, 1, x + k - 1, gender, ratesTable, tbQx, otn, abs, step, uw);
    }
    return temp;
}

function npxTpdTbQx(n, x, gender, tbQx, dsbTb, otn = 0, abs = 0, step = 1, uw = 0) {
    if (n <= 0) return 1;
    const lenArray = Math.min(tbQx.length, dsbTb.length);
    if (lenArray > 1) {
        if (tbQx[intDiv(x, step)][gender - 1] === 1) return 0;
        if (intDiv(x, step) + 1 >= lenArray) return 1.0;
    }
    let result = 1;
    for (let i = 0; i < n; i++) {
        const xi = x + i;
        const qx1 = qxTbQx(xi, gender, tbQx, otn, abs, step, uw);
        const qx2 = qxTbQx(xi, gender, dsbTb, otn, abs, step, uw);
        const factor = 1 - qx1 - qx2 + qx1 * qx2;
        result *= factor;
    }
    return result;
}

function nExTTpdTbQx(t, n, x, gender, ratesTable, tbQx, dsbTb, otn = 0, abs = 0, step = 1, uw = 0) {
    if (n < 0) return 1;
    return npxTpdTbQx(n, x, gender, tbQx, dsbTb, otn, abs, step, uw) * vnT(t, n, ratesTable, step);
}

function axnTPrenTpdTbQx(t, n, x, gender, ratesTable, tbQx, dsbTb, otn = 0, abs = 0, step = 1, uw = 0, periodicity = 1) {
    let temp = 0;
    let nExTSt = 1;
    const mod = 12 / periodicity;
    for (let k = 0; k < n; k++) {
        if (k % mod === 0) {
            temp += nExTSt / step;
        }
        nExTSt *= nExTTpdTbQx(t + k, 1, x + k, gender, ratesTable, tbQx, dsbTb, otn, abs, step, uw);
    }
    return temp;
}

function ax2tableTpdTbQx(t, n, x, gender, ratesTable, tbQx, dsbTb, otn = 0, abs = 0, step = 1, uw = 0) {
    let temp = 0;
    let nExTSt = 1;
    for (let k = 1; k <= n; k++) {
        temp += nExTSt * qxTbQx(x + k - 1, gender, dsbTb, otn, abs, step, uw) * vt(t + k - 1, ratesTable, step);
        nExTSt *= nExTTpdTbQx(t + k - 1, 1, x + k - 1, gender, ratesTable, tbQx, dsbTb, otn, abs, step, uw);
    }
    return temp;
}

function fullRates(years) {
    return Array.from({ length: years }, () => I_YEAR);
}

function roundTo5(n) {
    return Math.round(n / 5) * 5;
}

function ceilTo5(n) {
    return Math.ceil(n / 5) * 5;
}

/**
 * years — для годовых формул и длины rates; nMonths — фактический срок из goal.term_months.
 * @param {number} termMonths
 */
function resolveActuarialTerm(termMonths) {
    const nMonths = Math.max(12, Math.round(Number(termMonths) || 72));
    const years = Math.max(1, Math.ceil(nMonths / 12));
    return { years, nMonths, termMonths: nMonths };
}

/**
 * @param {string|undefined|null} sex
 * @returns {1|2}
 */
function mapGender(sex) {
    const s = String(sex || '').trim().toLowerCase();
    if (s === 'female' || s === 'f' || s === 'женский' || s === 'ж' || s === '2') return 2;
    return 1;
}

/**
 * @param {string|Date|undefined|null} birthDate
 * @param {Date} [refDate]
 * @returns {number}
 */
function clientAgeYears(birthDate, refDate = new Date()) {
    if (!birthDate) return 40;
    const b = new Date(birthDate);
    if (Number.isNaN(b.getTime())) return 40;
    const t = refDate instanceof Date ? refDate : new Date(refDate);
    let age = t.getFullYear() - b.getFullYear();
    const m = t.getMonth() - b.getMonth();
    if (m < 0 || (m === 0 && t.getDate() < b.getDate())) age--;
    return Math.max(0, age);
}

/**
 * @param {Object} params
 * @param {number} params.age
 * @param {1|2} params.gender
 * @param {number} params.termMonths
 * @param {number} params.ss
 * @param {1|2} [params.sport] 1=да, 2=нет
 */
function calculatePodushkaPremiums({ age, gender, termMonths, ss, sport = 2 }) {
    const SS = Number(ss) || 0;
    const { years, nMonths } = resolveActuarialTerm(termMonths);
    const rates = fullRates(years);
    const xMonths = (age - 1) * 12;
    const xYears = age - 1;
    const sportMult = sport === 1 ? 1.4 : 1;

    const tariffDacAnnual = ax1nTTbQx(0, nMonths, xMonths, gender, rates, DAC, 0, 0, STEP, 0)
        / axnTPrenTbQx(0, years, xYears, gender, rates, DAC, 0, 0, 1, 0, 12)
        / (1 - I_LOAD_MAIN);
    const prenAnnual = axnTPrenTbQx(0, years, xYears, gender, rates, DAC, 0, 0, 1, 0, 12);
    const tariffAdAnnual = ax2table1nTTbQx(0, nMonths, xMonths, gender, rates, DAC, AD, 0, 0, STEP, 0)
        / prenAnnual / (1 - I_LOAD_DOP);
    const tariffTadAnnual = ax2table1nTTbQx(0, nMonths, xMonths, gender, rates, DAC, TAD, 0, 0, STEP, 0)
        / prenAnnual / (1 - I_LOAD_DOP);
    const tariffTpdAnnual = ax2tableTpdTbQx(0, nMonths, xMonths, gender, rates, DAC, TPD, 0, 0, STEP, 0)
        / axnTPrenTpdTbQx(0, years, xYears, gender, rates, DAC, TPD, 0, 0, 1, 0, 12)
        / (1 - I_LOAD_DOP);
    const tariffTraumaAnnual = SS_TRAUMA_RATIO * LOSS_TRAUMA
        * ax2table1nTTbQx(0, nMonths, xMonths, gender, rates, DAC, TRAUMA, 0, 0, STEP, 0)
        / prenAnnual / (1 - I_LOAD_DOP);
    const tariffAllAnnual = tariffDacAnnual + tariffAdAnnual + tariffTadAnnual + tariffTpdAnnual + tariffTraumaAnnual;

    const premAllAnnual = ceilTo5(SS * tariffAllAnnual * sportMult / 5) * 5;

    const prenMonthly = axnTPrenTbQx(0, nMonths, xMonths, gender, rates, DAC, 0, 0, STEP, 0, 12);
    const tariffDacMonthly = ax1nTTbQx(0, nMonths, xMonths, gender, rates, DAC, 0, 0, STEP, 0)
        / prenMonthly / (1 - I_LOAD_MAIN) * K_12;
    const tariffAdMonthly = ax2table1nTTbQx(0, nMonths, xMonths, gender, rates, DAC, AD, 0, 0, STEP, 0)
        / prenMonthly / (1 - I_LOAD_DOP) * K_12;
    const tariffTadMonthly = ax2table1nTTbQx(0, nMonths, xMonths, gender, rates, DAC, TAD, 0, 0, STEP, 0)
        / prenMonthly / (1 - I_LOAD_DOP) * K_12;
    const tariffTpdMonthly = ax2tableTpdTbQx(0, nMonths, xMonths, gender, rates, DAC, TPD, 0, 0, STEP, 0)
        / axnTPrenTpdTbQx(0, nMonths, xMonths, gender, rates, DAC, TPD, 0, 0, STEP, 0, 12)
        / (1 - I_LOAD_DOP) * K_12;
    const tariffTraumaMonthly = SS_TRAUMA_RATIO * LOSS_TRAUMA
        * ax2table1nTTbQx(0, nMonths, xMonths, gender, rates, DAC, TRAUMA, 0, 0, STEP, 0)
        / prenMonthly / (1 - I_LOAD_DOP) * K_12;
    const tariffAllMonthly = tariffDacMonthly + tariffAdMonthly + tariffTadMonthly + tariffTpdMonthly + tariffTraumaMonthly;

    const premAllMonthly = ceilTo5(SS * tariffAllMonthly * sportMult * (1 / 12) / 5) * 5;

    const limitMain = roundTo5(SS);
    const limitTrauma = roundTo5(SS * SS_TRAUMA_RATIO);

    return {
        years,
        termMonths: nMonths,
        annualPremium: premAllAnnual,
        monthlyPremium: premAllMonthly,
        tariffAllAnnual,
        tariffAllMonthly,
        limits: {
            main: limitMain,
            trauma: limitTrauma,
        },
        risks: [
            { risk_name: 'Травмы', limit_amount: limitTrauma },
            {
                risk_name: 'Инвалидность I-II группы в результате несчастного случая или болезни',
                limit_amount: limitMain,
            },
            { risk_name: 'Уход из жизни по любой причине', limit_amount: limitMain },
            { risk_name: 'Уход из жизни в результате несчастного случая', limit_amount: limitMain },
            { risk_name: 'Уход из жизни в результате ДТП', limit_amount: limitMain },
        ],
    };
}

/**
 * NSJ-shape для lifeUpfrontAmount / LifeInsuranceCalculator.
 * @param {Object} goal
 * @param {Object} client
 */
function buildSberPodushkaNsjResult(goal, client) {
    const age = clientAgeYears(client?.birth_date);
    const gender = mapGender(client?.sex || client?.gender);
    const termMonths = Number(goal?.term_months) || 72;
    const ss = Number(goal?.target_amount) || 0;
    const sport = goal?.extreme_sport === true || goal?.extreme_sport === 1 ? 1 : 2;

    const calc = calculatePodushkaPremiums({ age, gender, termMonths, ss, sport });

    return {
        success: true,
        term_years: calc.years,
        term_months: calc.termMonths,
        total_premium: calc.annualPremium,
        monthly_premium: calc.monthlyPremium,
        total_limit: calc.limits.main,
        program: 'Подушка безопасности',
        risks: calc.risks,
    };
}

module.exports = {
    calculatePodushkaPremiums,
    buildSberPodushkaNsjResult,
    clientAgeYears,
    mapGender,
    resolveActuarialTerm,
    ceilTo5,
    roundTo5,
};
