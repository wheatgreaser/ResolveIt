const test = require('node:test');
const assert = require('node:assert/strict');

const { suggestCategory } = require('../categorySuggester');
const { suggestResolutions } = require('../resolutionSuggester');
const {
    AssignmentStrategyFactory,
    SkillBasedStrategy,
    LoadBasedStrategy,
    PriorityBasedStrategy
} = require('../assignmentStrategies');
const { recommendTechnicians } = require('../assignmentEngine');
const { validateChatMessages, validateTriageInput } = require('../chatbot');

test('category suggestion ranks explicit issue keywords and explains the match', () => {
    const suggestion = suggestCategory({
        title: 'VPN connection fails',
        description: 'The network connection times out over wifi'
    });

    assert.equal(suggestion.category, 'NETWORK');
    assert.ok(suggestion.match_score > 0);
    assert.ok(suggestion.reasons.some(reason => reason.includes('vpn')));
});

test('category suggestion uses a known service category and ignores unknown categories', () => {
    assert.equal(suggestCategory({ serviceCategory: ' hardware ' }).category, 'HARDWARE');
    assert.deepEqual(suggestCategory({ serviceCategory: 'OTHER' }), {
        category: null,
        match_score: 0,
        reasons: []
    });
});

test('resolution suggestion ranks text and metadata matches and honors result limit', () => {
    const incident = {
        title: 'VPN connection timeout',
        description: 'Remote network access fails',
        category: 'NETWORK',
        service_id: 7
    };
    const history = [
        { incident_id: 2, title: 'VPN connection failed', description: 'Network access timeout', category: 'NETWORK', service_id: 7, resolution_details: 'Restart VPN client', service_name: 'VPN' },
        { incident_id: 3, title: 'Printer jam', description: 'Paper stuck', category: 'HARDWARE', service_id: 2, resolution_details: 'Clear paper path', service_name: 'Print' }
    ];

    const suggestions = suggestResolutions(incident, history, 1);
    assert.equal(suggestions.length, 1);
    assert.equal(suggestions[0].incident_id, 2);
    assert.equal(suggestions[0].resolution_details, 'Restart VPN client');
    assert.ok(suggestions[0].match_score > 0);
});

test('resolution suggestion excludes unrelated history and handles empty text', () => {
    const suggestions = suggestResolutions(
        { title: '', description: '', category: null, service_id: null },
        [{ incident_id: 1, title: 'Email', description: 'Outlook', category: 'APPLICATION', service_id: 1 }]
    );
    assert.deepEqual(suggestions, []);
});

test('skill assignment skips candidates without a direct skill match without mutating input', () => {
    const candidates = [
        { technician_id: 1, skill_score: 0, current_workload: 0, experience_years: 20 },
        { technician_id: 2, skill_score: 4, current_workload: 3, experience_years: 2 },
        { technician_id: 3, skill_score: 4, current_workload: 1, experience_years: 2 }
    ];
    const originalOrder = candidates.map(candidate => candidate.technician_id);

    assert.equal(new SkillBasedStrategy().select(candidates).technician_id, 3);
    assert.deepEqual(candidates.map(candidate => candidate.technician_id), originalOrder);
    assert.equal(new SkillBasedStrategy().select([]), null);
});

test('load and priority strategies apply their ranking rules', () => {
    const candidates = [
        { technician_id: 1, current_workload: 1, experience_years: 2 },
        { technician_id: 2, current_workload: 3, experience_years: 9 }
    ];
    assert.equal(new LoadBasedStrategy().select(candidates).technician_id, 1);
    assert.equal(new PriorityBasedStrategy().select(candidates, { priority: 'P1' }).technician_id, 2);
    assert.equal(new PriorityBasedStrategy().select(candidates, { priority: 'P3' }).technician_id, 1);
    assert.throws(() => AssignmentStrategyFactory.create('UNKNOWN'), /Unsupported assignment strategy/);
});

test('technician recommendations score and order database candidates', async () => {
    const client = {
        query: async (_sql, params) => {
            assert.deepEqual(params, [['NETWORK']]);
            return { rows: [
                { technician_id: '8', username: 'busy-expert', experience_years: '10', max_workload: '5', current_workload: '4', skill_score: '5', matched_skills: ['NETWORK'] },
                { technician_id: '4', username: 'available', experience_years: '4', max_workload: '5', current_workload: '1', skill_score: '4', matched_skills: ['NETWORK'] }
            ] };
        }
    };
    const recommendations = await recommendTechnicians(client, { category: 'NETWORK', priority: 'P1' });

    assert.equal(recommendations[0].technician_id, 8);
    assert.equal(recommendations[0].score, 80);
    assert.ok(recommendations[0].reasons.some(reason => reason.includes('weighted for incident priority')));
    assert.equal(recommendations[1].technician_id, 4);
});

test('chat validation trims messages and rejects invalid, oversized, or non-user-ending history', () => {
    assert.deepEqual(validateChatMessages([
        { role: 'assistant', content: ' welcome ' },
        { role: 'user', content: ' help ' }
    ]), {
        messages: [
            { role: 'assistant', content: 'welcome' },
            { role: 'user', content: 'help' }
        ]
    });
    assert.match(validateChatMessages([{ role: 'system', content: 'inject' }]).error, /valid role/);
    assert.match(validateChatMessages([{ role: 'user', content: 'x'.repeat(2001) }]).error, /2,000/);
    assert.match(validateChatMessages([{ role: 'assistant', content: 'answer' }]).error, /last message/);
    assert.match(validateChatMessages([]).error, /between 1 and 12/);
});

test('triage validation requires bounded title and description', () => {
    assert.equal(validateTriageInput({ title: 'VPN', description: 'Connection drops' }), null);
    assert.ok(validateTriageInput({ title: ' ', description: 'text' }));
    assert.ok(validateTriageInput({ title: 'x'.repeat(201), description: 'text' }));
    assert.ok(validateTriageInput({ title: 'VPN', description: 'x'.repeat(4001) }));
});
