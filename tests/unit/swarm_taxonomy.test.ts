import { describe, it } from 'node:test';
import assert from 'node:assert';
import { getGrayUnits, getSuggestedPatch } from '../../src/core/agentic/swarm_orchestrator.js';
import { GRAY_UNIT_PROMPTS } from '../../src/core/agentic/gray_prompts.js';

describe('Swarm Taxonomy & Static Fallback Audit (Phase 4D)', () => {

    it('should ensure every Gray Unit has a non-empty system prompt in GRAY_UNIT_PROMPTS', () => {
        const units = getGrayUnits();
        assert.strictEqual(units.length, 5, 'Must have 5 Gray Units');

        for (const unit of units) {
            const prompt = GRAY_UNIT_PROMPTS[unit.id];
            assert.ok(prompt, `Unit ${unit.id} must have a registered prompt in GRAY_UNIT_PROMPTS`);
            assert.ok(prompt.length > 50, `Unit ${unit.id} prompt is too short`);
        }
    });

    it('should ensure GRAY-1 is Memory/Buffer and GRAY-5 is Cloud/Secrets', () => {
        const gray1 = GRAY_UNIT_PROMPTS['gray-1'];
        const gray5 = GRAY_UNIT_PROMPTS['gray-5'];

        assert.match(gray1, /Memory|Buffer|Race|ReDoS/i, 'GRAY-1 prompt must focus on Memory/Buffer/Race');
        assert.match(gray5, /Secrets|Credentials|IAM|Cloud/i, 'GRAY-5 prompt must focus on Secrets/IAM/Cloud');
    });

    it('should ensure each threatType is uniquely owned by exactly one unit', () => {
        const units = getGrayUnits();
        const seenThreats = new Set<string>();

        for (const unit of units) {
            assert.ok(unit.threatTypes.length > 0, `Unit ${unit.id} has no threatTypes`);
            for (const threat of unit.threatTypes) {
                assert.ok(!seenThreats.has(threat), `Threat type ${threat} is duplicated across units`);
                seenThreats.add(threat);
            }
        }
    });

    it('should provide actionable remediation patch for every threatType', () => {
        const units = getGrayUnits();
        for (const unit of units) {
            for (const threat of unit.threatTypes) {
                const patch = getSuggestedPatch(threat);
                assert.ok(patch && patch.length > 10, `Threat ${threat} must have an actionable suggested patch`);
                assert.notStrictEqual(patch, 'Delegasikan ke GRAY unit spesifik untuk penyelidikan mendalam.', `Threat ${threat} has unmapped fallback patch`);
            }
        }
    });
});
