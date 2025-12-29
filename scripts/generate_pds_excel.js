const XLSX = require('xlsx');
const path = require('path');

// Constants for formula simulation
const COFINANCING_MONTH_INDEX = 7; // August (0-based)
const MAX_COFINANCING_YEARS = 10;
const BASE_ANNUAL_LIMIT = 36000;

async function generateExcel() {
    console.log('Generating PDS Monthly Breakdown Excel...');

    // 1. INPUT PARAMETERS (The Case Study)
    const INPUTS = {
        age: 45,
        income: 120000,
        termYears: 15,
        monthlyContribution: 6000,
        yieldPercent: 10, // 10% annual
        startYear: 2025
    };

    // Calculate derived params
    const totalMonths = INPUTS.termYears * 12;
    const monthlyYieldRate = Math.pow(1 + (INPUTS.yieldPercent / 100), 1 / 12) - 1;

    // Determine co-financing coefficient based on income
    let cofinCoef = 1; // Default category 1 (<80k)
    let cofinLimit = 36000;

    if (INPUTS.income > 150000) {
        cofinCoef = 0.25; // 1:4
    } else if (INPUTS.income >= 80000) {
        cofinCoef = 0.5; // 1:2
    }
    // Limit is always 36k max per year (technically capped at calculation)

    console.log(`Inputs: Income=${INPUTS.income}, Coef=${cofinCoef}, Limit=${cofinLimit}`);

    // 2. GENERATE ROWS FOR "CALCULATION" SHEET
    // Columns: [A:Month, B:Year, C:MonthName, D:CapitalStart, E:ClientContrib, F:Cofinancing, G:Interest, H:CapitalEnd]

    const rows = [];
    let currentCapital = 0;

    // Track yearly client contributions for co-financing calc
    const yearlyContribs = {};
    let accumulatedClientParams = 0; // Just for visuals

    for (let m = 0; m < totalMonths; m++) {
        const currentYear = INPUTS.startYear + Math.floor(m / 12);
        const currentMonthIndex = m % 12; // 0=Jan, 11=Dec
        const monthNames = ["Янв", "Фев", "Март", "Апр", "Май", "Июнь", "Июль", "Авг", "Сен", "Окт", "Ноя", "Дек"];

        // 1. Start Capital
        const startCap = currentCapital;

        // 2. Client Contribution (Indexed monthly by 0.33%)
        // Formula: Base * (1 + 0.0033)^m
        const MONTHLY_INDEXATION = 0.0033; // 0.33%
        const clientContrib = INPUTS.monthlyContribution * Math.pow(1 + MONTHLY_INDEXATION, m);

        // Track for next year's payout
        if (!yearlyContribs[currentYear]) yearlyContribs[currentYear] = 0;
        yearlyContribs[currentYear] += clientContrib;

        // 3. Cofinancing Payout (in August)
        let cofinPayout = 0;
        // Check if August AND within 10 years AND not the very first year (payout is for previous year)
        // Years logic: Year 1 (2025) -> Payout in Aug 2026.
        // Last payout for Year 10 (2034) -> Payout in Aug 2035.
        // So payouts happen from Year 2 to Year 11.

        const yearIndex = currentYear - INPUTS.startYear; // 0 for 2025, 1 for 2026...

        if (currentMonthIndex === COFINANCING_MONTH_INDEX && yearIndex > 0 && yearIndex <= MAX_COFINANCING_YEARS) {
            const prevYear = currentYear - 1;
            const contribPrevYear = yearlyContribs[prevYear] || 0;

            // Calc logic similar to documentation
            let calculatedCofin = contribPrevYear * cofinCoef;
            if (calculatedCofin > BASE_ANNUAL_LIMIT) calculatedCofin = BASE_ANNUAL_LIMIT;

            cofinPayout = calculatedCofin;
        }

        // 4. Interest
        // Formula: (Start + Contrib + Cofin) * yield OR similar. 
        // Accurate: Start * yield + (Contrib+Cofin) * yield? 
        // Let's use simple logic: Interest is calculated on the balance BEFORE current month flows? 
        // OR usually: (Start + flows) * rate? 
        // Let's assume flows happen at BEGINNING of month for max interest, or END?
        // Standard banking: average daily balance. 
        // Simplified PFP logic: usually flows at beginning.
        // Let's stick to PFP logic: Capital grows by yield, then flows added? Or flows added then grow?
        // Service code: clientCapital *= (1 + pdsYieldMonthly); then add contribution. (So contrib doesn't earn in current month)
        // Let's duplicate Service logic:
        // Interest = StartCap * rate
        const interest = startCap * monthlyYieldRate;

        // 5. End Capital
        // End = Start + Interest + Client + Cofin
        const endCap = startCap + interest + clientContrib + cofinPayout;
        currentCapital = endCap;

        // ROW DATA for Excel (Values)
        // We will ALSO inject Formulas for specific columns to make it "Live" somewhat
        // Row index in Excel (1-based): Header is 1. Data starts 2.
        // For iteration m=0 (Row 2), m=1 (Row 3)...
        const rowIdx = m + 2;

        // Construct Row Object with Formulas
        // A: Num, B: Year, C: Month, D: Start, E: Client, F: Cofin, G: Interest, H: End

        // D (Start) = Previous H (End). Special case first row.
        const cellStart = (m === 0) ? { t: 'n', v: 0 } : { t: 'n', v: startCap, f: `H${rowIdx - 1}` };

        // E (Client) = Fixed value (could be formula link to Inputs)
        const cellClient = { t: 'n', v: clientContrib }; // Hardcode value for simplicity or link to 'Входные данные'!B5

        // F (Cofin) = Complex conditional. Hard to put full IF formula without helpers. 
        // We will put VALUE but add a comment or keep it value-based for simplicity as requested "formulas calculation" might be complex for "IF August".
        // Let's keep Value for Cofin to avoid massive Excel formula complexity, but make Interest and End formulas.
        const cellCofin = { t: 'n', v: cofinPayout };

        // G (Interest) = D * rate. Rate is in Inputs Sheet (B6). But B6 is "10%".
        // Let's calculate factor in script and put value, OR link.
        // Formula: =D2 * ((1+'Входные данные'!B6)^ (1/12) - 1)
        // Hard to parse '10%' string in Excel formula easily without formatting.
        // Let's simpler: =D2 * 0.00797 (approx). 
        // Better: Just Value for precision consistency with JS, OR simple formula for End.
        // User asked "formulas for calculation".
        // Let's try: End = Sum(D:G).
        const cellInterest = { t: 'n', v: interest, f: `D${rowIdx}*${monthlyYieldRate.toFixed(8)}` }; // Hardcoded rate in formula for simplicity

        const cellEnd = { t: 'n', v: endCap, f: `SUM(D${rowIdx}:G${rowIdx})` };

        rows.push([
            m + 1,              // A
            currentYear,        // B
            monthNames[currentMonthIndex], // C
            cellStart,          // D
            cellClient,         // E
            cellCofin,          // F
            cellInterest,       // G
            cellEnd             // H
        ]);
    }


    // 3. GENERATE "INPUT" SHEET
    const inputData = [
        ['Параметр', 'Значение'],
        ['Возраст', INPUTS.age],
        ['Доход (руб)', INPUTS.income],
        ['Категория софин.', cofinCoef === 0.5 ? '1:2' : (cofinCoef === 1 ? '1:1' : '1:4')],
        ['Взнос (руб/мес)', INPUTS.monthlyContribution],
        ['Ставка (% год)', INPUTS.yieldPercent],
        ['Срок (лет)', INPUTS.termYears]
    ];

    // 4. GENERATE "OUTPUT" SHEET
    const totalClient = rows.reduce((acc, r) => acc + r[4].v, 0); // Col E
    const totalCofin = rows.reduce((acc, r) => acc + r[5].v, 0); // Col F
    const totalInterest = rows.reduce((acc, r) => acc + r[6].v, 0); // Col G
    const finalCap = rows[rows.length - 1][7].v; // Last Col H

    const outputData = [
        ['Итоговые показатели', 'Значение'],
        ['Всего внесено клиентом', totalClient],
        ['Всего получено от государства', totalCofin],
        ['Начисленный доход', totalInterest],
        ['Итоговый капитал', finalCap],
        ['Эффективная доходность', ((finalCap - totalClient) / totalClient * 100).toFixed(2) + '% (абсолютная)']
    ];


    // 5. ASSEMBLE WORKBOOK
    const wb = XLSX.utils.book_new();

    const wsInput = XLSX.utils.aoa_to_sheet(inputData);
    XLSX.utils.book_append_sheet(wb, wsInput, "Входные данные");

    // Custom build for Calculation sheet to handle stored Cells with formulas
    const wsCalc = XLSX.utils.aoa_to_sheet([
        ['Месяц №', 'Год', 'Месяц', 'Капитал на начало', 'Взнос', 'Софинансирование', 'Доход (%)', 'Капитал на конец']
    ]);

    // Append rows manually to ensure formulas preserved? 
    // utils.sheet_add_aoa works with Cell Objects {v, t, f}
    XLSX.utils.sheet_add_aoa(wsCalc, rows, { origin: "A2" });

    // Set column widths
    wsCalc['!cols'] = [
        { wch: 8 }, { wch: 6 }, { wch: 8 }, { wch: 15 }, { wch: 12 }, { wch: 18 }, { wch: 12 }, { wch: 15 }
    ];

    XLSX.utils.book_append_sheet(wb, wsCalc, "Помесячный расчет");

    const wsOutput = XLSX.utils.aoa_to_sheet(outputData);
    XLSX.utils.book_append_sheet(wb, wsOutput, "Итоги");


    const filename = path.join(__dirname, '../docs/pds_monthly_breakdown_indexed.xlsx');
    XLSX.writeFile(wb, filename);

    console.log(`✅ Excel generated: ${filename}`);
}

generateExcel().catch(console.error);
