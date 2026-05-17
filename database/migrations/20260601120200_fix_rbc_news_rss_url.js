exports.up = async function (knex) {
    await knex('news_sources')
        .where({ slug: 'rbc' })
        .update({
            rss_url: 'https://rssexport.rbc.ru/rbcnews/news/30/full.rss',
            updated_at: knex.fn.now(),
        });
};

exports.down = async function (knex) {
    await knex('news_sources')
        .where({ slug: 'rbc' })
        .update({
            rss_url: 'https://rssexport.rbc.ru/rbcnews/economics/20/full.rss',
            updated_at: knex.fn.now(),
        });
};
