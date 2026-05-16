/**
 * Partner agent ID, subagent network, commission events/accruals (all projects; behavior via settings).
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
const FINAM_PROJECT_ID = 14;

const DEFAULT_FINAM_PROJECT_SETTINGS = {
    partner_agent_id: {
        label: 'Finam ID',
        require_on_registration: true,
        require_on_admin_create: false,
        ref_parse: {
            query_params: ['utm_partner_finam', 'agent_id', 'agentId', 'consultant_id', 'id'],
            path_regex: null,
        },
    },
    partner_link_tracking: {
        enabled: true,
        domain_whitelist: ['finam.ru', 'broker.finam.ru', 'bonus.finam.ru', 'funds.finam.ru', 'comon.ru'],
        defaults: { utm_source: 'pfp', utm_medium: 'report_pdf' },
        per_link_type: {
            broker_open: { utm_campaign: 'open_account' },
            bonus: { utm_campaign: 'finam_bonus' },
            transfer: { utm_campaign: 'vygodniy_perekhod' },
            idu: { utm_campaign: 'idu' },
            comon: { utm_campaign: 'comon_autofollow' },
            pds: { utm_campaign: 'pds' },
        },
        agent_id_param: 'utm_partner_finam',
        agent_id_in: 'query',
    },
    agent_network: {
        enabled: true,
        max_depth: 1,
        allow_self_invite: false,
        parent_can_list_subagents: true,
        parent_can_see_subagent_clients: false,
        require_invite_ref: false,
    },
    commission_rules: {
        enabled: false,
        default_currency: 'RUB',
    },
};

exports.up = async function (knex) {
    await knex.schema.alterTable('agents', (table) => {
        table.string('partner_agent_id', 64).nullable();
        table
            .enu('partner_agent_id_source', ['admin', 'registration_ref', 'registration_manual'])
            .nullable();
        table.bigInteger('parent_agent_id').unsigned().nullable();
        table.string('referral_slug', 32).nullable();
        table.json('registration_attribution').nullable();

        table.foreign('parent_agent_id').references('id').inTable('agents').onDelete('SET NULL');
        table.index(['parent_agent_id']);
        table.unique(['project_id', 'partner_agent_id'], 'agents_project_partner_id_unique');
        table.unique(['project_id', 'referral_slug'], 'agents_project_referral_slug_unique');
    });

    await knex.schema.alterTable('clients', (table) => {
        table.bigInteger('referred_by_agent_id').unsigned().nullable();
        table.foreign('referred_by_agent_id').references('id').inTable('agents').onDelete('SET NULL');
        table.index(['referred_by_agent_id']);
    });

    await knex.schema.createTable('commission_events', (table) => {
        table.bigIncrements('id').primary();
        table.bigInteger('project_id').unsigned().notNullable();
        table
            .enu('event_type', [
                'subagent_registered',
                'client_created',
                'broker_email_sent',
                'partner_deal_confirmed',
            ])
            .notNullable();
        table.bigInteger('agent_id').unsigned().notNullable();
        table.bigInteger('beneficiary_agent_id').unsigned().nullable();
        table.bigInteger('client_id').unsigned().nullable();
        table.bigInteger('subagent_id').unsigned().nullable();
        table.decimal('amount_rub', 18, 2).nullable();
        table.string('external_ref', 128).nullable();
        table.json('metadata').nullable();
        table.timestamp('occurred_at').notNullable().defaultTo(knex.fn.now());
        table.timestamps(true, true);

        table.foreign('project_id').references('id').inTable('projects').onDelete('CASCADE');
        table.foreign('agent_id').references('id').inTable('agents').onDelete('CASCADE');
        table.foreign('beneficiary_agent_id').references('id').inTable('agents').onDelete('SET NULL');
        table.foreign('client_id').references('id').inTable('clients').onDelete('SET NULL');
        table.foreign('subagent_id').references('id').inTable('agents').onDelete('SET NULL');
        table.index(['project_id', 'occurred_at']);
        table.index(['beneficiary_agent_id', 'occurred_at']);
    });

    await knex.schema.createTable('commission_accruals', (table) => {
        table.bigIncrements('id').primary();
        table.bigInteger('project_id').unsigned().notNullable();
        table.bigInteger('event_id').unsigned().notNullable();
        table.bigInteger('agent_id').unsigned().notNullable();
        table.decimal('amount_rub', 18, 2).notNullable().defaultTo(0);
        table
            .enu('status', ['pending', 'approved', 'paid', 'cancelled'])
            .notNullable()
            .defaultTo('pending');
        table.string('period', 7).nullable();
        table.text('notes').nullable();
        table.timestamps(true, true);

        table.foreign('project_id').references('id').inTable('projects').onDelete('CASCADE');
        table.foreign('event_id').references('id').inTable('commission_events').onDelete('CASCADE');
        table.foreign('agent_id').references('id').inTable('agents').onDelete('CASCADE');
        table.unique(['event_id', 'agent_id'], 'commission_accruals_event_agent_unique');
        table.index(['project_id', 'period', 'status']);
    });

    const finamProject = await knex('projects').where('id', FINAM_PROJECT_ID).first();
    if (finamProject) {
        let settings = {};
        try {
            settings =
                typeof finamProject.settings === 'string'
                    ? JSON.parse(finamProject.settings || '{}')
                    : finamProject.settings || {};
        } catch (_) {
            settings = {};
        }
        const merged = { ...settings, ...DEFAULT_FINAM_PROJECT_SETTINGS };
        await knex('projects')
            .where('id', FINAM_PROJECT_ID)
            .update({ settings: JSON.stringify(merged), updated_at: knex.fn.now() });
    }
};

exports.down = async function (knex) {
    await knex.schema.dropTableIfExists('commission_accruals');
    await knex.schema.dropTableIfExists('commission_events');

    await knex.schema.alterTable('clients', (table) => {
        table.dropForeign(['referred_by_agent_id']);
        table.dropColumn('referred_by_agent_id');
    });

    await knex.schema.alterTable('agents', (table) => {
        table.dropForeign(['parent_agent_id']);
        table.dropUnique(['project_id', 'partner_agent_id'], 'agents_project_partner_id_unique');
        table.dropUnique(['project_id', 'referral_slug'], 'agents_project_referral_slug_unique');
        table.dropColumns(
            'partner_agent_id',
            'partner_agent_id_source',
            'parent_agent_id',
            'referral_slug',
            'registration_attribution'
        );
    });
};
