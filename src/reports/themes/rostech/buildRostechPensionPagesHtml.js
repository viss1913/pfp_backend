const path = require('path');
const { resolveGoalCardImageSrc, GLOBAL_DEFAULTS } = require('../../summary/buildSummaryOverviewHtml');

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
    return `${Math.round(n).toLocaleString('ru-RU')} ₽`;
}

function moneyPerMonth(v) {
    const m = money(v);
    return m === '—' ? m : `${m}/мес.`;
}

function buildShell({ title, subtitle, bodyHtml, logoSrc, bgSrc }) {
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
      padding: 30px;
    }
    .bg {
      position: absolute;
      inset: 0;
      z-index: 0;
      background: #f7f7f7;
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
      align-items: center;
      font-size: 11px;
      color: #6b7280;
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="bg">${bgSrc ? `<img src="${esc(bgSrc)}" alt="" />` : ''}</div>
    <div class="inner">
      <div class="top">
        <div>
          <h1 class="h1">${esc(title)}</h1>
          ${subtitle ? `<div class="sub">${esc(subtitle)}</div>` : ''}
        </div>
        ${logoSrc ? `<img class="logo" src="${esc(logoSrc)}" alt="" />` : ''}
      </div>
      ${bodyHtml}
    </div>
    <div class="footer">
      <div>НПФ Ростех • Госпенсия</div>
      <div>Страница PDF</div>
    </div>
  </div>
</body>
</html>`;
}

function buildRostechPensionPagesHtml({ goal, clientName, options = {} }) {
    const root = path.join(__dirname, '../../..');
    const inlineLocalAssets = Boolean(options.inlineLocalAssets);
    const logoSrc = options.logoSrc || '';
    const bgSrc = options.backgroundSrc || '';
    const cardImg = resolveGoalCardImageSrc('PENSION', root, inlineLocalAssets);

    const s = goal?.summary || {};
    const yearsToPension = Number(goal?.details?.state_pension?.years_to_pension ?? 0);
    const monthly = Number(s.monthly_replenishment ?? 0);
    const initial = Number(s.initial_capital ?? 0);
    const targetPresent = Number(s.target_amount_initial ?? 0);
    const projectedPresent = Number(s.projected_pension_monthly_present ?? 0);
    const projectedFuture = Number(s.projected_pension_monthly_future ?? 0);
    const pensionGap = Number(s.pension_gap_future ?? 0);
    const totalCapital = Number(s.projected_capital_at_retirement ?? 0);
    const taxBenefit = Number(s.total_tax_benefit ?? 0);
    const cofin = Number(s.total_cofinancing ?? 0);

    const title = goal?.goal_name || 'Достойная пенсия';
    const commonIntro = `
      <div class="card">
        <div style="display:flex; gap:10px; align-items:flex-start;">
          <img src="${esc(cardImg)}" alt="" style="width:60px;height:68px;object-fit:cover;border-radius:8px;" />
          <div style="font-size:13px;line-height:1.45; flex:1;">
            <b>${esc(title)}</b><br/>
            ${esc(clientName || 'Клиент')}, до пенсии ${Number.isFinite(yearsToPension) ? yearsToPension : '—'} лет.
            Я подготовила детальный план для формирования достойной пенсии.
          </div>
        </div>
      </div>
    `;

    // 15 кадров по заданным node-id (офлайн-версия без зависимостей от Figma URLs).
    return [
        // 59:285
        buildShell({
            title: 'Достойная пенсия',
            subtitle: 'Прогноз Госпенсии',
            logoSrc,
            bgSrc,
            bodyHtml: `
              ${commonIntro}
              <div class="card">
                <div style="font-size:13px;line-height:1.5;">
                  Прогноз Госпенсии: <b>${esc(moneyPerMonth(projectedPresent))}</b> в сегодняшних деньгах,
                  и <b>${esc(moneyPerMonth(projectedFuture))}</b> на дату выхода.
                  Чтобы достичь целевого уровня <b>${esc(moneyPerMonth(targetPresent))}</b>,
                  нужен дополнительный доход <b>${esc(moneyPerMonth(pensionGap))}</b>.
                </div>
                <div class="pill">Более подробная методика расчета — на следующей странице</div>
              </div>
              <div class="card" style="border-color:#a95b8d;">
                <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-end;">
                  <div style="flex:1;text-align:center;">
                    <div style="font-size:24px;font-weight:700;">${esc(moneyPerMonth(projectedPresent))}</div>
                    <div style="height:30px;width:44px;background:#000;margin:6px auto;"></div>
                    <div class="muted">Госпенсия сейчас</div>
                  </div>
                  <div style="flex:1;text-align:center;">
                    <div style="font-size:24px;font-weight:700;">${esc(moneyPerMonth(projectedFuture))}</div>
                    <div style="height:62px;width:44px;background:#722257;margin:6px auto;"></div>
                    <div class="muted">Госпенсия в будущем</div>
                  </div>
                </div>
              </div>
            `,
        }),
        // 59:132
        buildShell({
            title: 'Предлагаемый план',
            subtitle: 'График формирования пенсионного капитала',
            logoSrc,
            bgSrc,
            bodyHtml: `
              ${commonIntro}
              <div class="card">
                <div style="font-size:13px;line-height:1.5;">
                  Первоначальный капитал: <b>${esc(money(initial))}</b><br/>
                  Ежемесячное пополнение: <b>${esc(money(monthly))}</b><br/>
                  Горизонт до пенсии: <b>${Number.isFinite(yearsToPension) ? yearsToPension : '—'} лет</b>
                </div>
              </div>
              <div class="card">
                <div style="font-size:13px;line-height:1.5;">
                  Налоговые вычеты: <b>${esc(money(taxBenefit))}</b><br/>
                  Софинансирование: <b>${esc(money(cofin))}</b><br/>
                  Итого прогнозный капитал: <b>${esc(money(totalCapital))}</b><br/>
                  Дополнительный доход к пенсии: <b>${esc(money(pensionGap))}/мес.</b>
                </div>
                <div class="pill">Расчетная доходность плана учитывает вычеты и софинансирование</div>
              </div>
            `,
        }),
        // 59:397
        buildShell({
            title: 'Структура портфеля НПФ',
            subtitle: 'Консервативный профиль с контролем риска',
            logoSrc,
            bgSrc,
            bodyHtml: `
              <div class="card">
                <div style="font-size:13px;line-height:1.55;">
                  В расчете используется консервативный подход: банковские депозиты, облигации, ОФЗ и ограниченная доля акций.
                  Это снижает вероятность резких просадок и поддерживает стабильность долгосрочного плана.
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px;font-size:12px;">
                  <div>Банковские депозиты</div><div style="text-align:right;">45%</div>
                  <div>ОФЗ</div><div style="text-align:right;">30%</div>
                  <div>Корпоративные облигации</div><div style="text-align:right;">18%</div>
                  <div>Акции</div><div style="text-align:right;">7%</div>
                </div>
                <div class="pill">Прогнозируемая доходность портфеля ~ 8.4%</div>
              </div>
              <div class="card">
                <div style="font-size:13px;line-height:1.55;">
                  Накопленный капитал на горизонте цели: <b>${esc(money(totalCapital))}</b>.<br/>
                  Расчетный дополнительный доход: <b>${esc(moneyPerMonth(pensionGap))}</b> в ценах сегодня.
                </div>
              </div>
            `,
        }),
        // 59:466
        buildShell({
            title: 'Государственное софинансирование',
            subtitle: 'Сводка по поддержке от государства и налоговым вычетам',
            logoSrc,
            bgSrc,
            bodyHtml: `
              <div class="card">
                <div style="font-size:13px;line-height:1.55;">
                  Всего софинансирование: <b>${esc(money(cofin))}</b><br/>
                  Всего налоговые вычеты: <b>${esc(money(taxBenefit))}</b>
                </div>
              </div>
              <div class="card">
                <div style="font-size:13px;line-height:1.55;">
                  Резюме плана: цель — ${esc(money(targetPresent))}/мес., капитал — <b>${esc(money(totalCapital))}</b>.
                </div>
              </div>
            `,
        }),
        // 59:1509
        buildShell({
            title: 'Юридическая оговорка',
            subtitle: '',
            logoSrc,
            bgSrc,
            bodyHtml: `
              <div class="card">
                <div style="font-size:13px;line-height:1.55;">
                  Финансовый план не является коммерческим предложением или договором и носит исключительно информационный характер.
                </div>
              </div>
            `,
        }),
        // 59:314
        buildShell({
            title: 'Методика расчета Госпенсии',
            subtitle: 'Фиксированная выплата + ИПК × стоимость ИПК',
            logoSrc,
            bgSrc,
            bodyHtml: `
              <div class="card">
                <div style="font-size:13px;line-height:1.55;">
                  Формула прогноза: <b>Госпенсия = Фиксированная выплата + (ИПК × стоимость ИПК)</b>.
                  В модели учитывается инфляция, индексация и горизонт до пенсионного возраста.
                </div>
              </div>
              <div class="card">
                <div style="font-size:13px;line-height:1.55;">
                  Прогноз Госпенсии: <b>${esc(money(projectedFuture))}/мес.</b><br/>
                  В ценах сегодня: <b>${esc(money(projectedPresent))}/мес.</b>
                </div>
              </div>
            `,
        }),
        // 59:657
        buildShell({
            title: 'Важная информация: инфляция',
            subtitle: 'Параметры инфляции и доходности по горизонту цели',
            logoSrc,
            bgSrc,
            bodyHtml: `
              <div class="card">
                <div style="font-size:13px;line-height:1.55;">
                  В расчете инфляция и ожидаемая доходность меняются в зависимости от срока достижения цели.
                  Это позволяет не завышать прогноз на длинном горизонте и удерживать консервативные допущения.
                </div>
              </div>
              <div class="card">
                <div style="font-size:13px;line-height:1.55;">
                  При актуализации плана (раз в 6–12 месяцев) параметры инфляции и доходности обновляются.
                </div>
              </div>
            `,
        }),
        // 59:1303
        buildShell({
            title: 'Декларация о рисках ПДС',
            subtitle: '1. Инфляционный риск',
            logoSrc,
            bgSrc,
            bodyHtml: `
              <div class="card">
                <div style="font-size:13px;line-height:1.55;">
                  Если фактическая инфляция выше прогноза, реальная покупательная способность капитала снижается.
                  Рекомендация: регулярный пересмотр плана и корректировка суммы пополнений.
                </div>
              </div>
            `,
        }),
        // 59:1335
        buildShell({
            title: 'Декларация о рисках ПДС',
            subtitle: '2. Риск банкротства НПФ',
            logoSrc,
            bgSrc,
            bodyHtml: `
              <div class="card">
                <div style="font-size:13px;line-height:1.55;">
                  Риск снижается за счет регулирования ЦБ, требований к структуре активов и системы гарантий.
                  Дополнительно рекомендуется контролировать рейтинг фонда и изменения регуляторики.
                </div>
              </div>
            `,
        }),
        // 59:1419
        buildShell({
            title: 'Декларация о рисках ПДС',
            subtitle: '3. Риск дефолта по ОФЗ',
            logoSrc,
            bgSrc,
            bodyHtml: `
              <div class="card">
                <div style="font-size:13px;line-height:1.55;">
                  Для рублевого сегмента ОФЗ рассматриваются как один из наиболее надежных инструментов.
                  В портфеле НПФ доля бумаг контролируется в рамках консервативной политики риска.
                </div>
              </div>
            `,
        }),
        // 59:1363
        buildShell({
            title: 'Декларация о рисках ПДС',
            subtitle: '4. Риски инвестирования в акции',
            logoSrc,
            bgSrc,
            bodyHtml: `
              <div class="card">
                <div style="font-size:13px;line-height:1.55;">
                  Акции дают потенциал роста, но несут рыночную волатильность.
                  В плане используется ограниченная доля риск-активов и диверсификация.
                </div>
              </div>
            `,
        }),
        // 59:1391
        buildShell({
            title: 'Декларация о рисках ПДС',
            subtitle: '5. Риски корпоративных облигаций',
            logoSrc,
            bgSrc,
            bodyHtml: `
              <div class="card">
                <div style="font-size:13px;line-height:1.55;">
                  Основные риски: кредитный, ликвидности и процентный.
                  Снижение риска достигается отбором эмитентов, лимитами и контролем дюрации.
                </div>
              </div>
            `,
        }),
        // 59:1189
        buildShell({
            title: 'График достижения целей',
            subtitle: 'Помесячная динамика пополнений и капитала',
            logoSrc,
            bgSrc,
            bodyHtml: `
              <div class="card">
                <div style="font-size:13px;line-height:1.55;">
                  В таблице отражаются шаги плана: ежемесячные пополнения, налоговые вычеты, софинансирование и итоговый капитал.
                  Фактические значения могут отличаться, поэтому план рекомендуется обновлять не реже 1 раза в год.
                </div>
              </div>
              <div class="pill">Целевой итоговый капитал: ${esc(money(totalCapital))}</div>
            `,
        }),
    ];
}

module.exports = { buildRostechPensionPagesHtml };

