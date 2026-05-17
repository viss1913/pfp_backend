/**
 * Cron scheduler for financial news RSS ingest.
 */

const cron = require('node-cron');
const { config } = require('./news/newsConfig');
const { runIngest } = require('./news/newsIngestService');

class NewsScheduler {
    initScheduler() {
        if (!config.enabled) {
            console.log('[NewsScheduler] NEWS_ENABLED=false — scheduler skipped');
            return;
        }

        if (!cron.validate(config.cron)) {
            console.error(`[NewsScheduler] Invalid NEWS_CRON: ${config.cron}`);
            return;
        }

        console.log(`[NewsScheduler] Initializing (cron: ${config.cron})`);

        cron.schedule(config.cron, async () => {
            console.log('[NewsScheduler] Running news ingest...');
            try {
                const result = await runIngest();
                console.log(
                    `[NewsScheduler] Done: sources=${result.sources} fetched=${result.fetched} published=${result.published} rejected=${result.rejected}`
                );
                if (result.errors.length) {
                    console.warn('[NewsScheduler] Errors:', result.errors.join('; '));
                }
            } catch (err) {
                console.error('[NewsScheduler] Ingest failed:', err.message);
            }
        });

        console.log('[NewsScheduler] Started');
    }
}

module.exports = new NewsScheduler();
