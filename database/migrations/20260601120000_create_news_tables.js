/**
 * Financial news feed for Agent LK — sources, articles, read state.
 */

const NEWS_SOURCES = [
    {
        slug: 'cbr',
        name: 'Банк России',
        trust_weight: 100,
        rss_url: 'https://www.cbr.ru/rss/RssPress',
        is_active: true,
    },
    {
        slug: 'interfax',
        name: 'Интерфакс',
        trust_weight: 90,
        rss_url: 'https://www.interfax.ru/rss.asp',
        is_active: true,
    },
    {
        slug: 'rbc',
        name: 'РБК',
        trust_weight: 90,
        rss_url: 'https://rssexport.rbc.ru/rbcnews/news/30/full.rss',
        is_active: true,
    },
    {
        slug: 'tass',
        name: 'ТАСС',
        trust_weight: 85,
        rss_url: 'https://tass.ru/rss/v2.xml',
        is_active: true,
    },
];

exports.up = async function (knex) {
    if (!(await knex.schema.hasTable('news_sources'))) {
        await knex.schema.createTable('news_sources', (table) => {
            table.increments('id').primary();
            table.string('slug', 50).notNullable().unique();
            table.string('name', 255).notNullable();
            table.integer('trust_weight').notNullable().defaultTo(50);
            table.string('rss_url', 512).notNullable();
            table.boolean('is_active').notNullable().defaultTo(true);
            table.timestamp('last_fetched_at').nullable();
            table.timestamps(true, true);
        });
    }

    if (!(await knex.schema.hasTable('news_articles'))) {
        await knex.schema.createTable('news_articles', (table) => {
            table.bigIncrements('id').primary();
            table.integer('source_id').unsigned().notNullable()
                .references('id').inTable('news_sources').onDelete('CASCADE');
            table.string('external_id', 128).notNullable();
            table.string('title', 512).notNullable();
            table.text('description').nullable();
            table.string('url', 768).notNullable().unique();
            table.timestamp('published_at').notNullable();
            table.timestamp('fetched_at').notNullable().defaultTo(knex.fn.now());
            table
                .enu('event_type', [
                    'RATE_CHANGE',
                    'INFLATION',
                    'SANCTIONS',
                    'TAX_CHANGE',
                    'OIL',
                    'BANKING',
                    'STOCK_MARKET',
                    'CURRENCY',
                    'OTHER',
                ])
                .notNullable()
                .defaultTo('OTHER');
            table.integer('score').notNullable().defaultTo(0);
            table
                .enu('status', ['candidate', 'rejected', 'published', 'expired'])
                .notNullable()
                .defaultTo('candidate');
            table.string('cluster_key', 64).nullable();
            table.bigInteger('cluster_id').unsigned().nullable();
            table.text('agent_takeaway').nullable();
            table.json('tags_json').nullable();
            table.json('also_reported_by_json').nullable();
            table.timestamps(true, true);

            table.unique(['source_id', 'external_id']);
            table.index(['status', 'published_at']);
            table.index(['cluster_key']);
            table.index(['score']);
        });
    }

    if (!(await knex.schema.hasTable('agent_news_reads'))) {
        await knex.schema.createTable('agent_news_reads', (table) => {
            table.bigIncrements('id').primary();
            table.bigInteger('agent_id').unsigned().notNullable()
                .references('id').inTable('agents').onDelete('CASCADE');
            table.bigInteger('article_id').unsigned().notNullable()
                .references('id').inTable('news_articles').onDelete('CASCADE');
            table.timestamp('read_at').notNullable().defaultTo(knex.fn.now());

            table.unique(['agent_id', 'article_id']);
            table.index(['agent_id']);
        });
    }

    for (const src of NEWS_SOURCES) {
        const existing = await knex('news_sources').where({ slug: src.slug }).first();
        if (!existing) {
            await knex('news_sources').insert(src);
        }
    }
};

exports.down = async function (knex) {
    await knex.schema.dropTableIfExists('agent_news_reads');
    await knex.schema.dropTableIfExists('news_articles');
    await knex.schema.dropTableIfExists('news_sources');
};
