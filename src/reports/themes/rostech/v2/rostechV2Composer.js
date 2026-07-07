const {
    loadTemplatePages,
    applyPlaceholders,
    setBarHeight,
} = require('./rostechTemplateLoader');
const {
    buildCoverContext,
    buildPensionContext,
    buildInvestmentContext,
} = require('./rostechTemplateContext');

const PENSION_TEMPLATES = [
    'pension-01-intro.html',
    'pension-02-state-pension.html',
    'pension-03-plan.html',
    'pension-04-portfolio.html',
];

const INVESTMENT_TEMPLATES = [
    'save-multiply-01-intro.html',
    'save-multiply-02-plan.html',
    'save-multiply-03-final.html',
];

function renderTemplatePages(templateFiles, contextFactory, args, pageNumberOffset = 1) {
    const { data, barHeights = {} } = contextFactory(args);
    const pages = [];

    templateFiles.forEach((fileName, fileIdx) => {
        const templatePages = loadTemplatePages(fileName);
        templatePages.forEach((pageHtml, pageIdx) => {
            const pageNumber = pageNumberOffset + pages.length;
            let html = applyPlaceholders(pageHtml, { ...data, page_number: String(pageNumber) });

            if (fileName === 'pension-01-intro.html' && pageIdx === 0) {
                html = setBarHeight(html, 0, barHeights.pensionIntroLeft);
                html = setBarHeight(html, 1, barHeights.pensionIntroRight);
            }
            if (fileName === 'pension-02-state-pension.html' && pageIdx === 0) {
                html = setBarHeight(html, 0, barHeights.statePensionLeft);
                html = setBarHeight(html, 1, barHeights.statePensionRight);
            }
            if (fileName === 'pension-03-plan.html' && pageIdx === 0) {
                html = setBarHeight(html, 0, barHeights.planBar1);
                html = setBarHeight(html, 1, barHeights.planBar2);
                html = setBarHeight(html, 2, barHeights.planBar3);
            }
            if (fileName === 'save-multiply-01-intro.html' && pageIdx === 0) {
                html = setBarHeight(html, 0, barHeights.introLeft);
                html = setBarHeight(html, 1, barHeights.introRight);
            }
            if (fileName === 'save-multiply-02-plan.html' && pageIdx === 0) {
                html = setBarHeight(html, 0, barHeights.planBar1);
                html = setBarHeight(html, 1, barHeights.planBar2);
                html = setBarHeight(html, 2, barHeights.planBar3);
            }

            pages.push(html);
        });
    });

    return pages;
}

async function buildRostechV2CoverHtml(options = {}) {
    const [page] = loadTemplatePages('cover.html');
    const data = buildCoverContext({
        coverTitle: options.coverTitle ?? options.title,
        dateLine: options.dateLine,
    });
    return applyPlaceholders(page, data);
}

async function buildRostechV2PensionPagesHtml(args = {}) {
    return renderTemplatePages(PENSION_TEMPLATES, buildPensionContext, args, 2);
}

async function buildRostechV2InvestmentPagesHtml(args = {}) {
    return renderTemplatePages(INVESTMENT_TEMPLATES, buildInvestmentContext, args, 2);
}

module.exports = {
    buildRostechV2CoverHtml,
    buildRostechV2PensionPagesHtml,
    buildRostechV2InvestmentPagesHtml,
};
