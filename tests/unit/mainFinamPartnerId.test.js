const test = require('node:test');
const assert = require('node:assert/strict');
const {
    getMainFinamPartnerIdFromEnv,
    isFamilyOfficeSelfRegisterAgent,
    getFamilyOfficeSelfRegisterProjectIdsFromEnv,
    assertFamilyOfficeProjectAllowed,
    FAMILY_OFFICE_SELF_REGISTER_UTM_MEDIUM,
} = require('../../src/utils/mainFinamPartnerId');

test('isFamilyOfficeSelfRegisterAgent detects utm_medium', () => {
    const agent = {
        registration_attribution: JSON.stringify({
            utm_medium: FAMILY_OFFICE_SELF_REGISTER_UTM_MEDIUM,
        }),
    };
    assert.equal(isFamilyOfficeSelfRegisterAgent(agent), true);
    assert.equal(isFamilyOfficeSelfRegisterAgent({ registration_attribution: '{}' }), false);
});

test('getMainFinamPartnerIdFromEnv trims value', () => {
    const prev = process.env.PFP_MAIN_FINAM_AGENT_ID;
    process.env.PFP_MAIN_FINAM_AGENT_ID = '  CM99  ';
    assert.equal(getMainFinamPartnerIdFromEnv(), 'CM99');
    if (prev === undefined) delete process.env.PFP_MAIN_FINAM_AGENT_ID;
    else process.env.PFP_MAIN_FINAM_AGENT_ID = prev;
});

test('assertFamilyOfficeProjectAllowed passes when whitelist unset', () => {
    const prev = process.env.FAMILY_OFFICE_SELF_REGISTER_PROJECT_IDS;
    delete process.env.FAMILY_OFFICE_SELF_REGISTER_PROJECT_IDS;
    assert.doesNotThrow(() => assertFamilyOfficeProjectAllowed(14));
    if (prev !== undefined) process.env.FAMILY_OFFICE_SELF_REGISTER_PROJECT_IDS = prev;
});

test('assertFamilyOfficeProjectAllowed rejects unknown project', () => {
    const prev = process.env.FAMILY_OFFICE_SELF_REGISTER_PROJECT_IDS;
    process.env.FAMILY_OFFICE_SELF_REGISTER_PROJECT_IDS = '14,28';
    assert.throws(
        () => assertFamilyOfficeProjectAllowed(99),
        (err) => err.status === 400
    );
    if (prev === undefined) delete process.env.FAMILY_OFFICE_SELF_REGISTER_PROJECT_IDS;
    else process.env.FAMILY_OFFICE_SELF_REGISTER_PROJECT_IDS = prev;
});

test('getFamilyOfficeSelfRegisterProjectIdsFromEnv parses list', () => {
    const prev = process.env.FAMILY_OFFICE_SELF_REGISTER_PROJECT_IDS;
    process.env.FAMILY_OFFICE_SELF_REGISTER_PROJECT_IDS = '14, 28 ,bad';
    assert.deepEqual(getFamilyOfficeSelfRegisterProjectIdsFromEnv(), [14, 28]);
    if (prev === undefined) delete process.env.FAMILY_OFFICE_SELF_REGISTER_PROJECT_IDS;
    else process.env.FAMILY_OFFICE_SELF_REGISTER_PROJECT_IDS = prev;
});
