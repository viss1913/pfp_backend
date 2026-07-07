const path = require('path');
const { resolveGoalCardImageSrc } = require('../../summary/buildSummaryOverviewHtml');
const { resolveReportRasterRef } = require('../../../utils/reportRasterSrc');
const { resolveRostechStyleReportBranding } = require('./rostechStyleReportBranding');

function esc(v) {
    if (v == null) return '';
    return String(v)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function money(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return '—';
    return `${Math.round(n).toLocaleString('ru-RU')} руб.`;
}

function moneyPerMonth(v) {
    const m = money(v);
    return m === '—' ? m : `${m}/мес.`;
}

function moneyWithPrecision(v, digits = 2) {
    const n = Number(v);
    if (!Number.isFinite(n)) return '—';
    return `${n.toLocaleString('ru-RU', {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
    })} руб.`;
}

function getCofinancingRateTextByIncome(monthlyIncome) {
    const income = Number(monthlyIncome);
    if (!Number.isFinite(income) || income <= 0) return '50 коп.';
    if (income < 80000) return '1 руб.';
    if (income <= 150000) return '50 коп.';
    return '25 коп.';
}

function pickPositive(primary, fallback) {
    const p = Number(primary);
    if (Number.isFinite(p) && p > 0) return p;
    const f = Number(fallback);
    if (Number.isFinite(f) && f > 0) return f;
    return 0;
}

function calculateAugNextYearEffectivenessPercent(monthlySchedule) {
    const schedule = Array.isArray(monthlySchedule)
        ? monthlySchedule
              .filter((row) => row && row.date)
              .slice()
              .sort((a, b) => new Date(a.date) - new Date(b.date))
        : [];
    if (!schedule.length) return { percent: null, startYear: null };

    const toDate = (value) => new Date(`${value}T00:00:00Z`);
    const toNum = (value) => {
        const n = Number(value);
        return Number.isFinite(n) ? n : 0;
    };
    const first = schedule[0];
    const startDate = toDate(first.date);
    const endDate = new Date(Date.UTC(startDate.getUTCFullYear() + 1, 7, 1)); // 1 August of next year
    const rows = schedule.filter((row) => toDate(row.date) <= endDate);
    if (!rows.length) return { percent: null, startYear: startDate.getUTCFullYear() };

    const monthsBetween = (from, to) =>
        (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth());
    const totalMonths = Math.max(monthsBetween(startDate, endDate) + 1, 1);

    const k0 =
        toNum(first.total_capital) -
        toNum(first.replenishment) -
        toNum(first.cofinancing);
    const kEnd = toNum(rows[rows.length - 1].total_capital);
    const replenishmentSum = rows.reduce((sum, row) => sum + toNum(row.replenishment), 0);
    const taxSum = rows.reduce((sum, row) => sum + toNum(row.tax_deduction), 0);
    const cofinancingSum = rows.reduce((sum, row) => sum + toNum(row.cofinancing), 0);
    const investmentIncome = kEnd - k0 - replenishmentSum - cofinancingSum;

    const weightedReplenishments = rows.reduce((sum, row) => {
        const monthsLeft = Math.max(monthsBetween(toDate(row.date), endDate) + 1, 0);
        return sum + toNum(row.replenishment) * (monthsLeft / totalMonths);
    }, 0);
    const avgBase = k0 + weightedReplenishments;
    if (!(avgBase > 0)) return { percent: null, startYear: startDate.getUTCFullYear() };

    const totalEffectiveness = (investmentIncome + taxSum + cofinancingSum) / avgBase;
    return {
        percent: totalEffectiveness * 100,
        startYear: startDate.getUTCFullYear(),
    };
}

function isScheduleInitialLumpRow(row) {
    return Boolean(row && String(row.schedule_row_kind || '').toUpperCase() === 'INITIAL_LUMP');
}

function extractPensionPlanFacts(monthlySchedule, fallback = {}) {
    const schedule = Array.isArray(monthlySchedule)
        ? monthlySchedule
              .filter((row) => row && row.date)
              .slice()
              .sort((a, b) => new Date(a.date) - new Date(b.date))
        : [];
    const toNum = (value) => {
        const n = Number(value);
        return Number.isFinite(n) ? n : 0;
    };

    const first = schedule[0] || null;
    let initialFromSchedule = NaN;
    if (first && isScheduleInitialLumpRow(first)) {
        initialFromSchedule = toNum(first.replenishment);
    } else if (first) {
        initialFromSchedule =
            toNum(first.total_capital) -
            toNum(first.replenishment) -
            toNum(first.cofinancing);
    }
    const firstRegular = schedule.find((row) => row && row.date && !isScheduleInitialLumpRow(row)) || null;
    const monthlyFromSchedule = firstRegular ? toNum(firstRegular.replenishment) : NaN;

    const firstTaxRow = schedule.find((row) => toNum(row.tax_deduction) > 0) || null;
    const firstCofRow = schedule.find((row) => toNum(row.cofinancing) > 0) || null;
    const taxYear = firstTaxRow ? new Date(`${firstTaxRow.date}T00:00:00Z`).getUTCFullYear() : null;
    const cofinYear = firstCofRow ? new Date(`${firstCofRow.date}T00:00:00Z`).getUTCFullYear() : null;

    return {
        initialCapital: Number.isFinite(initialFromSchedule)
            ? initialFromSchedule
            : toNum(fallback.initialCapital),
        monthlyContribution: Number.isFinite(monthlyFromSchedule)
            ? monthlyFromSchedule
            : toNum(fallback.monthlyContribution),
        taxDeductionAmount: firstTaxRow ? toNum(firstTaxRow.tax_deduction) : toNum(fallback.taxDeductionAmount),
        taxDeductionYear: taxYear || fallback.taxDeductionYear || null,
        cofinancingAmount: firstCofRow ? toNum(firstCofRow.cofinancing) : toNum(fallback.cofinancingAmount),
        cofinancingYear: cofinYear || fallback.cofinancingYear || null,
    };
}

function calculateOwnFundsFromSchedule(monthlySchedule, fallbackOwnFunds = 0) {
    const schedule = Array.isArray(monthlySchedule)
        ? monthlySchedule
              .filter((row) => row && row.date)
              .slice()
              .sort((a, b) => new Date(a.date) - new Date(b.date))
        : [];
    if (!schedule.length) return Number(fallbackOwnFunds) || 0;

    const toNum = (value) => {
        const n = Number(value);
        return Number.isFinite(n) ? n : 0;
    };
    const first = schedule[0];
    const initialFromSchedule =
        toNum(first.total_capital) -
        toNum(first.replenishment) -
        toNum(first.cofinancing);
    const replenishmentSum = schedule.reduce((sum, row) => sum + toNum(row.replenishment), 0);
    return Math.max(initialFromSchedule + replenishmentSum, 0);
}

function formatMonthYearRu(value) {
    if (!value) return '—';
    const d = new Date(`${value}T00:00:00Z`);
    if (Number.isNaN(d.getTime())) return '—';
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const yyyy = d.getUTCFullYear();
    return `${mm}.${yyyy} г.`;
}

function buildMonthlyPlanBodyHtml({ rows, isFirstPage, avatarSrc }) {
    const tableTop = isFirstPage ? 210 : 80;
    const tableHeight = isFirstPage ? 510 : 640;
    const rowCells = rows
        .map(
            (row) => `
            <div style="display:grid;grid-template-columns:78px 96px 90px 104px 109px;column-gap:16px;align-items:center;">
              <div style="font-size:10px;line-height:20px;color:#000;white-space:nowrap;">${esc(formatMonthYearRu(row.date))}</div>
              <div style="font-size:10px;line-height:20px;color:#000;white-space:nowrap;">${esc(money(row.replenishment || 0))}</div>
              <div style="font-size:10px;line-height:20px;color:#000;white-space:nowrap;">${esc(money(row.tax_deduction || 0))}</div>
              <div style="font-size:10px;line-height:20px;color:#000;white-space:nowrap;">${esc(money(row.cofinancing || 0))}</div>
              <div style="font-size:10px;line-height:20px;color:#000;white-space:nowrap;">${esc(money(row.total_capital || 0))}</div>
            </div>
        `
        )
        .join('');

    return `
      <div style="position:relative;width:535px;height:790px;background:#fff;">
        <div style="position:absolute;left:0;top:30px;font-size:18px;font-weight:400;line-height:20px;color:#000;">
          График достижения целей${isFirstPage ? '' : ' (продолжение)'}
        </div>
        ${
            isFirstPage
                ? `<div style="position:absolute;left:0;top:80px;width:535px;display:flex;align-items:flex-start;justify-content:space-between;">
          <div style="position:relative;width:60px;height:68px;border-radius:8px;background:linear-gradient(152.116deg, rgb(252, 237, 242) 0%, rgb(229, 239, 248) 120.41%);overflow:hidden;flex-shrink:0;">
            <img src="${esc(avatarSrc)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:8px;" />
          </div>
          <div style="flex:1;margin-left:17px;padding:10px 27px 10px 10px;border:1px solid #f1f1f1;border-radius:8px;">
            <div style="font-size:12px;line-height:15px;color:#000;">
              Это Ваш график достижения целей. Обратите внимание, что в реальности цифры будут отличаться от тех, что Вы видите в таблице. Точно посчитать будущее очень и очень сложно. Но если составлять финансовый план хотя бы раз в год и корректировать его с учетом новых данных по доходностям, инфляции, стоимости цели, то достижение целей становится гораздо более вероятным!
            </div>
          </div>
        </div>`
                : ''
        }
        <div style="position:absolute;left:0;top:${tableTop}px;width:535px;height:${tableHeight}px;">
          <svg viewBox="0 0 535 410" preserveAspectRatio="none" style="position:absolute;top:0;left:0;width:535px;height:${tableHeight}px;">
            <path d="M0 7.99999C0 3.58171 3.58172 0 8 0H527C531.418 0 535 3.58172 535 8V402C535 406.418 531.418 410 527 410H7.99999C3.58171 410 0 406.418 0 402V7.99999Z" fill="#F3F3F4"/>
          </svg>
          <div style="position:absolute;top:15px;left:20px;width:495px;display:grid;grid-template-columns:78px 96px 90px 104px 109px;column-gap:16px;">
            <div style="font-size:10px;font-weight:600;line-height:12px;color:#000;">Дата</div>
            <div style="font-size:10px;font-weight:600;line-height:12px;color:#000;">Пополнение</div>
            <div style="font-size:10px;font-weight:600;line-height:12px;color:#000;">Налоговый вычет</div>
            <div style="font-size:10px;font-weight:600;line-height:12px;color:#000;">Софинансирование</div>
            <div style="font-size:10px;font-weight:600;line-height:12px;color:#000;">Итоговый капитал</div>
          </div>
          <svg viewBox="0 0 495 1" preserveAspectRatio="none" style="position:absolute;top:45px;left:20px;width:495px;height:1px;">
            <line x1="0" y1="0.5" x2="495" y2="0.5" stroke="white"/>
          </svg>
          <div style="position:absolute;top:55px;left:20px;width:495px;display:flex;flex-direction:column;">
            ${rowCells}
          </div>
        </div>
      </div>
    `;
}

function buildShell({
    title,
    subtitle,
    bodyHtml,
    logoSrc,
    bgSrc,
    useBackground = false,
    footerText = 'НПФ Ростех • Госпенсия',
    footerLogoSrc = '',
    pagePaddingTop = 30,
    showTop = true,
}) {
    return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <style>
    @page { size: 595px 842px; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body { font-family: 'DejaVu Sans', sans-serif; color: #212121; }
    .page {
      position: relative;
      width: 595px;
      height: 842px;
      overflow: hidden;
      background: #fff;
      padding: ${Number(pagePaddingTop)}px 30px 30px;
    }
    .bg {
      position: absolute;
      inset: 0;
      z-index: 0;
      background: #ffffff;
    }
    .bg img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      opacity: 0.16;
      filter: grayscale(100%);
    }
    .inner { position: relative; z-index: 1; }
    .top {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 12px;
      margin-bottom: 18px;
    }
    .h1 { font-size: 26px; line-height: 1.15; font-weight: 700; margin: 0; }
    .sub { margin-top: 6px; font-size: 14px; color: #4b5563; }
    .logo { height: 24px; width: auto; object-fit: contain; }
    .card {
      border: 1px solid #d7d7d7;
      border-radius: 12px;
      background: #fff;
      padding: 14px;
      margin-bottom: 12px;
    }
    .muted { font-size: 12px; color: #4b5563; }
    .pill {
      display: inline-block;
      border: 1px solid #722257;
      color: #722257;
      border-radius: 8px;
      padding: 8px 10px;
      font-weight: 700;
      font-size: 13px;
      margin-top: 10px;
    }
    .footer {
      position: absolute;
      left: 30px;
      right: 30px;
      bottom: 16px;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      gap: 16px;
      font-size: 11px;
      color: #6b7280;
    }
    .footer__left {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 10px;
      max-width: 420px;
    }
    .footer__disclaimer {
      font-size: 10px;
      line-height: 1.25;
      color: #212121;
    }
    .footer__logo {
      height: 19px;
      width: auto;
      max-width: 120px;
      object-fit: contain;
      display: block;
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="bg">${useBackground && bgSrc ? `<img src="${esc(bgSrc)}" alt="" />` : ''}</div>
    <div class="inner">
      ${
          showTop
              ? `<div class="top">
        <div>
          <h1 class="h1">${esc(title)}</h1>
          ${subtitle ? `<div class="sub">${esc(subtitle)}</div>` : ''}
        </div>
        ${logoSrc ? `<img class="logo" src="${esc(logoSrc)}" alt="" />` : ''}
      </div>`
              : ''
      }
      ${bodyHtml}
    </div>
    <div class="footer">
      <div class="footer__left">
        ${
            footerText
                ? `<div class="footer__disclaimer">${esc(footerText).replace(/\n/g, '<br/>')}</div>`
                : ''
        }
        ${footerLogoSrc ? `<img class="footer__logo" src="${esc(footerLogoSrc)}" alt="" />` : ''}
      </div>
      <div style="white-space:nowrap;">Страница PDF</div>
    </div>
  </div>
</body>
</html>`;
}

const { isRostechReportV2Project } = require('../themeResolver');

async function buildRostechPensionPagesHtml(args) {
    if (isRostechReportV2Project(args?.options?.projectId)) {
        return require('./v2/rostechV2Composer').buildRostechV2PensionPagesHtml(args);
    }
    const { buildRostechPensionPagesHtmlLegacy } = require('./buildRostechPensionPagesHtmlLegacy');
    return buildRostechPensionPagesHtmlLegacy(args);
}

function buildRostechStandardTailHtmlPages({
    goal,
    brand,
    logoFromSettings,
    bgSrc,
    rostechAvatar59Src,
    cardImg,
    footerText,
}) {
    const resolvedFooterText = footerText || brand?.footerPension || 'НПФ Ростех • Госпенсия';
    const inflationRiskIntro =
        brand?.inflationRiskIntro ||
        'План объединяет решения в контурах НПФ «Ренессанс Накопления», инвестиционной платформы «Финам» и страховых продуктов «СК Ренессанс Жизнь». Во всех контурах используется прогноз инфляции, но фактическая динамика цен может отличаться от сценария. Это создает следующие риски:';
    const npfBankruptcyIntro =
        brand?.npfBankruptcyIntro ||
        'Для пенсионной части плана используется НПФ «Ренессанс Накопления». Теоретически риск финансовой нестабильности фонда может привести к:';
    const riskNotebookBgHtml = `
      <div style="position:absolute;inset:0;border-radius:12px;overflow:hidden;z-index:0;">
        <div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(248,241,247,0.55) 0%,rgba(244,248,255,0.55) 100%);"></div>
        <div style="position:absolute;inset:0;background-image:linear-gradient(to right, rgba(114,34,87,0.09) 1px, transparent 1px),linear-gradient(to bottom, rgba(114,34,87,0.09) 1px, transparent 1px);background-size:22px 22px;"></div>
      </div>`;
    return [
        // 59:657
        buildShell({
            footerText: resolvedFooterText,
            title: 'Важная Информация. Инфляция',
            subtitle: '',
            logoSrc: logoFromSettings,
            bgSrc,
            showTop: false,
            pagePaddingTop: 0,
            bodyHtml: `
              <div style="position:relative;width:535px;height:790px;background:#fff;">
                <div style="position:absolute;left:0;top:30px;font-size:18px;font-weight:400;line-height:20px;color:#212121;">
                  Важная Информация. Инфляция
                </div>

                <div style="position:absolute;left:0;top:80px;width:535px;display:flex;gap:17px;align-items:flex-start;">
                  <div style="width:60px;height:68px;flex-shrink:0;border-radius:8px;background:linear-gradient(152.116deg, rgb(252, 237, 242) 0%, rgb(229, 239, 248) 120.41%);overflow:hidden;border:1px solid #f1f1f1;">
                    <img src="${esc(rostechAvatar59Src || cardImg)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:8px;" />
                  </div>
                  <div style="flex:1;border:1px solid #f1f1f1;border-radius:8px;padding:10px 27px 10px 10px;">
                    <div style="font-size:13px;line-height:14px;color:#212121;">
                      Как Вы можете видеть на графике ниже, ставка по депозитам коррелирует с наблюдаемой инфляцией Росстата. Я считаю, что в ближайшем будущем тренд сменится на снижение инфляции, а значит и начнут снижаться ставки по депозитам. Поэтому в моих расчетах инфляция и доходность зависят от срока достижения цели.
                    </div>
                  </div>
                </div>

                <div style="position:absolute;left:50%;top:235px;transform:translateX(-50%);font-size:16px;font-weight:400;line-height:18px;color:#212121;">
                  Годовая инфляция
                </div>

                <div style="position:absolute;left:0;top:273px;width:524px;height:170px;display:flex;gap:4px;">
                  <div style="display:flex;flex-direction:column;justify-content:space-between;align-items:flex-end;width:34px;height:170px;padding-right:4px;font-size:8px;line-height:13px;color:#212121;">
                    <span>18,00</span><span>16,00</span><span>14,00</span><span>12,00</span><span>10,00</span><span>8,00</span><span>6,00</span><span>4,00</span><span>2,00</span><span>0,00</span>
                  </div>
                  <div style="position:relative;flex:1;height:170px;">
                    <div style="position:absolute;top:6px;left:0;width:100%;height:154px;background-image:repeating-linear-gradient(to top,#c4c4c4 0px,#c4c4c4 1px,transparent 1px,transparent 17px);"></div>
                    <svg viewBox="0 0 460 160" preserveAspectRatio="none" style="position:absolute;top:14px;left:2px;width:460px;height:140px;">
                      <path d="M0 106L7 102H13H19L22 106H36L46 102L53 95C53 92 55 89 60 95C65 101 74 102 78 102L86 95L92 83L98 79H115L120 83L131 18L147 1L157 18L161 28V38L180 43H187L199 53V61H208H223L230 118L238 123L242 134H252L260 118L258 112L271 95H291L304 83L310 70L322 61L329 70L340 61L397 90L418 100" stroke="#722257" stroke-width="1.5" fill="none"/>
                      <path d="M0 118L115 81L143 1L217 101L326 32L354 65L421 100" stroke="#21282B" stroke-width="1.5" fill="none"/>
                      <path d="M418 100L456 117" stroke="#722257" stroke-width="1.5" fill="none" stroke-dasharray="3 3"/>
                      <path d="M421 100L458 118" stroke="#21282B" stroke-width="1.5" fill="none" stroke-dasharray="3 3"/>
                    </svg>
                    <div style="position:absolute;bottom:0;left:27px;display:flex;gap:6px;align-items:center;">
                      ${['2016г.','2017г.','2018г.','июл.21','сен.21','нояб.21','янв.22','мар.22','май 22','июл.22','сен.22','нояб.22','янв.23','мар.23','май 23','июл.23','сен.23','нояб.23','янв.24','мар.24','май 24','июл.24','2025г.','2030г.','2035г.'].map((x)=>`<span style="font-size:8px;line-height:13px;color:#212121;white-space:nowrap;writing-mode:vertical-rl;transform:rotate(180deg);text-align:right;width:13px;">${x}</span>`).join('')}
                    </div>
                  </div>
                </div>

                <div style="position:absolute;left:0;top:495px;display:flex;gap:60px;">
                  <div style="display:flex;flex-direction:column;gap:0;">
                    <div style="display:flex;gap:8px;align-items:center;min-height:14px;"><span style="width:28.5px;height:1px;background:#722257;display:inline-block;"></span><span style="font-size:8px;line-height:14px;color:#212121;">годовая инфляция в зависимости от времени</span></div>
                    <div style="display:flex;gap:8px;align-items:center;min-height:14px;"><span style="width:28.5px;height:1px;background:#21282B;display:inline-block;"></span><span style="font-size:8px;line-height:14px;color:#212121;">средняя максимальная ставка по вкладам</span></div>
                  </div>
                  <div style="display:flex;flex-direction:column;gap:0;">
                    <div style="display:flex;gap:8px;align-items:center;min-height:14px;"><span style="width:28.5px;height:1px;display:inline-block;background:repeating-linear-gradient(to right,#722257 0px,#722257 2px,transparent 2px,transparent 4px);"></span><span style="font-size:8px;line-height:14px;color:#212121;">прогноз годовой инфляции</span></div>
                    <div style="display:flex;gap:8px;align-items:center;min-height:14px;"><span style="width:28.5px;height:1px;display:inline-block;background:repeating-linear-gradient(to right,#21282B 0px,#21282B 2px,transparent 2px,transparent 4px);"></span><span style="font-size:8px;line-height:14px;color:#212121;">прогноз доходности депозитов</span></div>
                  </div>
                </div>

                <div style="position:absolute;left:0;top:553px;font-size:12px;line-height:15px;color:#212121;">
                  Поэтому мы рекомендуем использовать следующие значения инфляции:
                </div>

                <div style="position:absolute;left:0;top:588px;width:535px;">
                  <table style="width:100%;border-collapse:collapse;background:#F3F3F4;border-radius:8px;overflow:hidden;">
                    <thead>
                      <tr>
                        <th style="font-size:10px;line-height:20px;font-weight:400;color:#212121;text-align:left;padding:10px 10px 10px 20px;border-bottom:1px solid #fff;">Срок цели</th>
                        <th style="font-size:10px;line-height:20px;font-weight:400;color:#212121;text-align:left;padding:10px;border-bottom:1px solid #fff;">Прогнозное значение инфляции</th>
                        <th style="font-size:10px;line-height:20px;font-weight:400;color:#212121;text-align:left;padding:10px;border-bottom:1px solid #fff;">Доходность капитала</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${[
                          ['До 1 года', '10%', '16%'],
                          ['От 1 года до 2 лет', '9,5%', '14%'],
                          ['От 2 лет до 3 лет', '8,5%', '14%'],
                          ['От 3 лет до 5 лет', '7,4%', '12%'],
                          ['От 5 лет до 10 лет', '5,7%', '10%'],
                          ['От 10 лет', '5,7%', '10%'],
                      ]
                          .map(
                              (row, idx) => `<tr style="${idx < 5 ? 'border-bottom:1px solid #fff;' : ''}">
                        <td style="font-size:8px;line-height:14px;font-weight:400;color:#212121;padding:10px 10px 10px 20px;">${row[0]}</td>
                        <td style="font-size:8px;line-height:14px;font-weight:400;color:#212121;padding:10px;">${row[1]}</td>
                        <td style="font-size:8px;line-height:14px;font-weight:400;color:#212121;padding:10px;">${row[2]}</td>
                      </tr>`
                          )
                          .join('')}
                    </tbody>
                  </table>
                </div>
              </div>
            `,
        }),
        // 59:1303
        buildShell({
            footerText: resolvedFooterText,
            title: 'Декларация о рисках финансового планирования',
            subtitle: '',
            logoSrc: logoFromSettings,
            bgSrc,
            showTop: false,
            pagePaddingTop: 0,
            bodyHtml: `
              <div style="position:relative;width:535px;height:770px;">
                ${riskNotebookBgHtml}
                <div style="position:absolute;top:30px;left:0;width:520px;font-size:18px;line-height:20px;color:#212121;">
                  Декларация о рисках финансового планирования
                </div>
                <div style="position:absolute;top:100px;left:0;background:#722257;color:#fff;padding:12px;border-radius:8px 8px 0 0;font-size:16px;line-height:1.2;z-index:1;">
                  1. Инфляционный риск
                </div>
                <div style="position:absolute;top:143px;left:0;width:535px;border:1px solid rgba(114,34,87,0.75);background:rgba(255,255,255,0.90);border-radius:0 8px 8px 8px;padding:16px 12px;font-size:12px;line-height:1.24;color:#212121;z-index:1;">
                  <p style="font-size:14px;margin-bottom:12px;">Суть риска:</p>
                  <p style="margin-bottom:12px;">${esc(inflationRiskIntro)}</p>
                  <ul style="padding-left:24px;margin-bottom:12px;">
                    <li>Если инфляция выше ожидаемой: реальная доходность снижается, покупательная способность капитала падает, расходная часть целей растет быстрее плана.</li>
                    <li>Если инфляция ниже ожидаемой: возможно перераспределение капитала не в оптимальные цели и избыточная ликвидность в консервативной части портфеля.</li>
                  </ul>
                  <p style="font-size:14px;margin-bottom:12px;">Меры снижения риска:</p>
                  <p style="margin-bottom:12px;">Регулярный пересмотр плана (не реже 1 раза в 6 месяцев) с корректировкой:</p>
                  <ul style="padding-left:24px;margin:0;">
                    <li>Прогноза инфляции с учетом актуальных данных.</li>
                    <li>Стоимости каждой цели и сроков достижения.</li>
                    <li>Индексации пополнений и структуры портфеля.</li>
                  </ul>
                </div>
              </div>
            `,
        }),
        // 59:1335
        buildShell({
            footerText: resolvedFooterText,
            title: '2. Риск банкротства НПФ',
            subtitle: '',
            logoSrc: logoFromSettings,
            bgSrc,
            showTop: false,
            pagePaddingTop: 0,
            bodyHtml: `
              <div style="position:relative;width:535px;height:770px;">
                ${riskNotebookBgHtml}
                <div style="position:absolute;top:30px;left:0;background:#722257;color:#fff;padding:12px;border-radius:8px 8px 0 0;font-size:16px;line-height:1.2;z-index:1;">
                  2. Риск банкротства НПФ
                </div>
                <div style="position:absolute;top:73px;left:0;width:535px;border:1px solid rgba(114,34,87,0.75);background:rgba(255,255,255,0.90);border-radius:0 8px 8px 8px;padding:16px 12px;font-size:12px;line-height:1.24;color:#212121;z-index:1;">
                  <p style="font-size:14px;margin-bottom:12px;">Суть риска:</p>
                  <p style="margin-bottom:12px;">${esc(npfBankruptcyIntro)}</p>
                  <ul style="padding-left:24px;margin-bottom:12px;">
                    <li>Заморозке или задержке выплат пенсионных накоплений.</li>
                    <li>Переоформлению пенсионных прав в другой фонд при регуляторных процедурах.</li>
                    <li>Частичной потере инвестиционного дохода при неблагоприятном рынке.</li>
                  </ul>
                  <p style="font-size:14px;margin-bottom:12px;">Факторы, снижающие вероятность риска:</p>
                  <p style="margin-bottom:12px;">1. Жесткий государственный контроль:</p>
                  <ul style="padding-left:24px;margin-bottom:12px;">
                    <li>ЦБ РФ регулирует деятельность НПФ, устанавливает требования к капиталу и инвестиционным портфелям.</li>
                    <li>Обязательное размещение резервов в консервативные активы (гособлигации, высоконадежные корпоративные облигации).</li>
                    <li>Система гарантирования пенсионных накоплений.</li>
                  </ul>
                  <p style="margin-bottom:12px;">2. Система гарантирования пенсионных накоплений:</p>
                  <ul style="padding-left:24px;margin-bottom:12px;">
                    <li>Действует механизм гарантирования пенсионных накоплений в рамках действующего законодательства.</li>
                    <li>При изменении статуса фонда пенсионные права переводятся в установленном порядке.</li>
                  </ul>
                  <p style="margin-bottom:12px;">3. Ограничения на рискованные инвестиции:</p>
                  <ul style="padding-left:24px;margin-bottom:12px;">
                    <li>НПФ не могут вкладывать средства в высокорисковые активы (акции с низкой ликвидностью, криптовалюты, производные инструменты).</li>
                    <li>Основная часть портфеля — ОФЗ, корпоративные облигации 1-2 эшелона, банковские депозиты.</li>
                  </ul>
                  <p style="font-size:14px;margin-bottom:12px;">Меры снижения риска:</p>
                  <ul style="padding-left:24px;margin:0;">
                    <li>Выбор фонда с устойчивыми показателями и прозрачной отчетностью.</li>
                    <li>Контроль изменений в регулировании и инвестиционной декларации НПФ.</li>
                    <li>Диверсификация накоплений между разными инструментами плана (НПФ, брокерский контур, страховые решения).</li>
                  </ul>
                </div>
              </div>
            `,
        }),
        // 59:1419
        buildShell({
            footerText: resolvedFooterText,
            title: '3. Риск дефолта государства по облигациям федерального займа (ОФЗ)',
            subtitle: '',
            logoSrc: logoFromSettings,
            bgSrc,
            showTop: false,
            pagePaddingTop: 0,
            bodyHtml: `
              <div style="position:relative;width:535px;height:770px;">
                ${riskNotebookBgHtml}
                <div style="position:absolute;top:30px;left:0;background:#722257;color:#fff;padding:10px 12px;border-radius:8px 8px 0 0;font-size:16px;line-height:1.2;z-index:1;">
                  3. Риск дефолта государства<br/>по облигациям федерального займа (ОФЗ)
                </div>
                <div style="position:absolute;top:88px;left:0;width:535px;border:1px solid rgba(114,34,87,0.75);background:rgba(255,255,255,0.90);border-radius:0 8px 8px 8px;padding:16px 12px;font-size:12px;line-height:1.1;color:#212121;z-index:1;">
                  <p style="font-size:14px;margin-bottom:12px;">Суть риска:</p>
                  <p style="margin-bottom:12px;">Дефолт по ОФЗ — это отказ Министерства финансов РФ исполнять обязательства по выплате купонного дохода или погашению номинала облигаций.</p>
                  <p style="font-size:14px;margin-bottom:12px;">Факторы, влияющие на вероятность дефолта:</p>
                  <p style="margin-bottom:12px;">1. Уровень госдолга:</p>
                  <ul style="padding-left:24px;margin-bottom:12px;"><li>Отношение госдолга к ВВП России (~20% в 2024 г.) существенно ниже критических уровней (для сравнения: США — ~120%, Япония — ~260%).</li></ul>
                  <p style="margin-bottom:12px;">2. Платежеспособность государства:</p>
                  <ul style="padding-left:24px;margin-bottom:12px;"><li>Основные источники погашения: нефтегазовые доходы, налоговые поступления.</li><li>Наличие золотовалютных резервов.</li></ul>
                  <p style="margin-bottom:12px;">3. Регуляторные ограничения для институциональных инвесторов:</p>
                  <ul style="padding-left:24px;margin-bottom:12px;"><li>Для НПФ и страховых компаний действуют ограничения на рискованные активы и требования по качеству портфеля.</li><li>Это снижает вероятность концентрации капитала в спекулятивных инструментах.</li></ul>
                  <p style="font-size:14px;margin-bottom:12px;">Факторы снижения риска:</p>
                  <p style="margin-bottom:12px;">1. Суверенная денежная эмиссия:</p>
                  <ul style="padding-left:24px;margin-bottom:12px;"><li>Россия выпускает ОФЗ в национальной валюте (рубли).</li><li>Технически может всегда напечатать деньги для погашения долга (риск — гиперинфляция, но не дефолт).</li></ul>
                  <p style="margin-bottom:12px;">2. Структура держателей ОФЗ:</p>
                  <ul style="padding-left:24px;margin-bottom:12px;"><li>Основные владельцы — российские банки, НПФ, страховые компании и ЦБ РФ (>70%).</li><li>Низкая зависимость от иностранных кредиторов.</li></ul>
                  <p style="margin-bottom:12px;">3. Политические факторы:</p>
                  <ul style="padding-left:24px;margin-bottom:12px;"><li>Дефолт разрушит доверие к финансовой системе.</li><li>Власти будут любой ценой избегать формального дефолта.</li></ul>
                  <p style="font-size:14px;margin-bottom:12px;">Вывод:</p>
                  <ul style="padding-left:24px;margin-bottom:12px;"><li>Вероятность формального дефолта по рублевым ОФЗ оценивается как низкая.</li><li>Ключевой риск для инвестора чаще связан не с дефолтом, а с инфляцией и рыночной переоценкой.</li></ul>
                  <p style="margin:0;">ОФЗ остаются базовым защитным инструментом рублевого контура, но итоговая доходность зависит от горизонта, уровня ставки и динамики инфляции.</p>
                </div>
              </div>
            `,
        }),
        // 59:1363
        buildShell({
            footerText: resolvedFooterText,
            title: '4. Риски инвестирования в акции российских компаний',
            subtitle: '',
            logoSrc: logoFromSettings,
            bgSrc,
            showTop: false,
            pagePaddingTop: 0,
            bodyHtml: `
              <div style="position:relative;width:535px;height:770px;">
                ${riskNotebookBgHtml}
                <div style="position:absolute;top:30px;left:0;background:#722257;color:#fff;padding:12px;border-radius:8px 8px 0 0;font-size:16px;line-height:1.2;z-index:1;">
                  4. Риски инвестирования<br/>в акции российских компаний
                </div>
                <div style="position:absolute;top:92px;left:0;width:535px;border:1px solid rgba(114,34,87,0.75);background:rgba(255,255,255,0.90);border-radius:0 8px 8px 8px;padding:16px 12px;font-size:12px;line-height:1.24;color:#212121;z-index:1;">
                  <p style="font-size:14px;margin-bottom:12px;">Суть риска:</p>
                  <p style="margin-bottom:12px;">Акционный риск возникает в части портфеля, инвестируемой через рыночные инструменты (в том числе в брокерском контуре Финам) и/или в рамках допустимых долей институциональных портфелей.</p>
                  <p style="margin-bottom:12px;">Основные риски:</p>
                  <ul style="padding-left:24px;margin-bottom:12px;">
                    <li>Рыночная волатильность — стоимость акций может резко снижаться из-за экономических кризисов, санкций или ухудшения финансовых показателей компаний.</li>
                    <li>Ограниченная диверсификация — из-за регуляторных ограничений НПФ не могут свободно распределять активы между разными секторами.</li>
                    <li>Низкая ликвидность отдельных бумаг — некоторые акции могут быть труднореализуемыми при необходимости срочного выхода.</li>
                  </ul>
                  <p style="font-size:14px;margin-bottom:12px;">Факторы, снижающие риск:</p>
                  <ul style="padding-left:24px;margin-bottom:12px;"><li>Лимиты по риску и требования к качеству активов в институциональном контуре (НПФ/СК).</li></ul>
                  <ul style="padding-left:24px;margin-bottom:12px;"><li>Диверсификация по эмитентам, секторам и срокам инвестирования.</li></ul>
                  <ul style="padding-left:24px;margin-bottom:12px;"><li>Пошаговый вход в рынок и регулярная ребалансировка вместо единовременного размещения крупной суммы.</li></ul>
                  <p style="font-size:14px;margin-bottom:12px;">Вывод:</p>
                  <p style="margin:0;">Акции дают потенциал роста, но сопровождаются повышенной волатильностью. Контроль риска достигается через диверсификацию, лимиты долей, регулярный пересмотр портфеля и соответствие риск-профилю клиента.</p>
                </div>
              </div>
            `,
        }),
        // 59:1391
        buildShell({
            footerText: resolvedFooterText,
            title: '5. Риски инвестирования НПФ в корпоративные облигации',
            subtitle: '',
            logoSrc: logoFromSettings,
            bgSrc,
            showTop: false,
            pagePaddingTop: 0,
            bodyHtml: `
              <div style="position:relative;width:535px;height:770px;">
                ${riskNotebookBgHtml}
                <div style="position:absolute;top:30px;left:0;background:#722257;color:#fff;padding:12px;border-radius:8px 8px 0 0;font-size:16px;line-height:1.2;z-index:1;">
                  5. Риски инвестирования НПФ<br/>в корпоративные облигации
                </div>
                <div style="position:absolute;top:92px;left:0;width:535px;border:1px solid rgba(114,34,87,0.75);background:rgba(255,255,255,0.90);border-radius:0 8px 8px 8px;padding:16px 12px;font-size:12px;line-height:1.24;color:#212121;z-index:1;">
                  <p style="font-size:14px;margin-bottom:12px;">Основные риски:</p>
                  <ul style="padding-left:24px;margin-bottom:12px;">
                    <li>Кредитный риск — вероятность дефолта эмитента и невыплаты купонов/номинала.</li>
                    <li>Риск ликвидности — сложность продажи бумаг без потери стоимости.</li>
                    <li>Процентный риск — снижение рыночной цены облигаций при росте ключевой ставки.</li>
                  </ul>
                  <p style="font-size:14px;margin-bottom:12px;">Факторы снижения риска (НПФ/СК/брокерский контур):</p>
                  <ul style="padding-left:24px;margin-bottom:12px;">
                    <li>Отбор эмитентов с высоким кредитным рейтингом.</li>
                    <li>Диверсификация по секторам/эмитентам.</li>
                    <li>Контроль дюрации (сроков погашения).</li>
                    <li>Соблюдение нормативов ЦБ РФ.</li>
                    <li>Мониторинг ликвидности и макроэкономической ситуации.</li>
                  </ul>
                  <p style="font-size:14px;margin-bottom:12px;">Вывод:</p>
                  <p style="margin:0 0 10px 0;">Корпоративные облигации обычно дают премию к ОФЗ, но требуют контроля кредитного качества эмитентов. В плане этот риск снижается за счет диверсификации, лимитов и регулярного мониторинга макроданных.</p>
                  <div style="margin-top:8px;padding:8px 10px;border:1px dashed #9ca3af;border-radius:8px;background:#f8fafc;font-size:9px;line-height:1.35;color:#334155;">
                    Материалы декларации носят информационный характер и не являются индивидуальной инвестиционной рекомендацией (ИИР). Прошлая доходность не гарантирует будущие результаты. Финансовые и страховые условия, порядок гарантий и возможные ограничения определяются действующим законодательством РФ, правилами соответствующих программ НПФ, условиями брокерского обслуживания и страховыми документами продукта.
                  </div>
                </div>
              </div>
            `,
        }),
        ...(() => {
            const scheduleRows = Array.isArray(goal?.details?.monthly_schedule)
                ? goal.details.monthly_schedule
                      .filter((row) => row && row.date)
                      .slice()
                      .sort((a, b) => new Date(a.date) - new Date(b.date))
                : [];
            const firstPageRows = 22;
            const nextPageRows = 28;
            const chunks = [];
            if (scheduleRows.length) {
                chunks.push(scheduleRows.slice(0, firstPageRows));
                let offset = firstPageRows;
                while (offset < scheduleRows.length) {
                    chunks.push(scheduleRows.slice(offset, offset + nextPageRows));
                    offset += nextPageRows;
                }
            } else {
                chunks.push([{ date: null, replenishment: 0, tax_deduction: 0, cofinancing: 0, total_capital: 0 }]);
            }

            return chunks.map((chunk, idx) =>
                buildShell({
            footerText: resolvedFooterText,
                    title: 'График достижения целей',
                    subtitle: '',
                    logoSrc: logoFromSettings,
                    bgSrc,
                    showTop: false,
                    pagePaddingTop: 0,
                    bodyHtml: buildMonthlyPlanBodyHtml({
                        rows: chunk,
                        isFirstPage: idx === 0,
                        avatarSrc: rostechAvatar59Src || cardImg,
                    }),
                })
            );
        })(),
    ];
}

module.exports = {
    buildRostechPensionPagesHtml,
    buildRostechStandardTailHtmlPages,
        rostechInvestmentPdfUtils: {
        esc,
        money,
        moneyPerMonth,
        moneyWithPrecision,
        pickPositive,
        getCofinancingRateTextByIncome,
        calculateAugNextYearEffectivenessPercent,
        extractPensionPlanFacts,
        calculateOwnFundsFromSchedule,
        buildShell,
        isScheduleInitialLumpRow,
    },
};

