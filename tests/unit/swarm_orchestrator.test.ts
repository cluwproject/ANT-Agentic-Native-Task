import { describe, it } from 'node:test';
import assert from 'node:assert';
import { parseFindingCardText, GrayUnit } from '../../src/core/agentic/swarm_orchestrator.js';

describe('Swarm Orchestrator - parseFindingCardText', () => {
    const mockUnit: GrayUnit = { id: 'gray-1', name: 'GRAY-1', domain: '', model: '', threatTypes: [] };
    const missionId = 'mission-123';
    const targetFile = 'test.js';

    it('should parse a standard finding card correctly', () => {
        const text = `
TEMUAN: Hardcoded API Key
SEVERITY: CRITICAL
LOCATION: line 42
EVIDENCE: const key = "AKIA123..."
FIX: Use environment variables
        `;
        const findings = parseFindingCardText(text, mockUnit, missionId, targetFile);
        assert.strictEqual(findings.length, 1);
        assert.strictEqual(findings[0].threat_type, 'Hardcoded API Key | LOCATION: line 42');
        assert.strictEqual(findings[0].risk_level, 'CRITICAL');
        assert.strictEqual(findings[0].suggested_patch, 'Use environment variables');
    });

    it('should parse multiple finding cards in one response', () => {
        const text = `
TEMUAN: Issue 1
SEVERITY: HIGH
FIX: Fix 1

TEMUAN: Issue 2
SEVERITY: LOW
FIX: Fix 2
        `;
        const findings = parseFindingCardText(text, mockUnit, missionId, targetFile);
        assert.strictEqual(findings.length, 2);
        assert.strictEqual(findings[0].threat_type, 'Issue 1');
        assert.strictEqual(findings[0].risk_level, 'HIGH');
        assert.strictEqual(findings[1].threat_type, 'Issue 2');
        assert.strictEqual(findings[1].risk_level, 'LOW');
    });

    it('should handle multi-line text gracefully', () => {
        const text = `
TEMUAN: Multi line
issue here
SEVERITY: MEDIUM
FIX: Multi line
fix here
        `;
        const findings = parseFindingCardText(text, mockUnit, missionId, targetFile);
        assert.strictEqual(findings.length, 1);
        assert.strictEqual(findings[0].threat_type, 'Multi line\nissue here');
        assert.strictEqual(findings[0].suggested_patch, 'Multi line\nfix here');
    });

    it('should ignore text without TEMUAN keyword', () => {
        const text = "Aman boss tidak ada celah.";
        const findings = parseFindingCardText(text, mockUnit, missionId, targetFile);
        assert.strictEqual(findings.length, 0);
    });
});
