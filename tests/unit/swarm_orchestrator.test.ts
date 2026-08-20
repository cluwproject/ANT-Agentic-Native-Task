import { parseFindingCardText, GrayUnit, FindingCard } from '../../src/core/agentic/swarm_orchestrator';

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
        expect(findings.length).toBe(1);
        expect(findings[0].threat_type).toBe('Hardcoded API Key | LOCATION: line 42');
        expect(findings[0].risk_level).toBe('CRITICAL');
        expect(findings[0].suggested_patch).toBe('Use environment variables');
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
        expect(findings.length).toBe(2);
        expect(findings[0].threat_type).toBe('Issue 1');
        expect(findings[0].risk_level).toBe('HIGH');
        expect(findings[1].threat_type).toBe('Issue 2');
        expect(findings[1].risk_level).toBe('LOW');
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
        expect(findings.length).toBe(1);
        expect(findings[0].threat_type).toBe('Multi line\nissue here');
        expect(findings[0].suggested_patch).toBe('Multi line\nfix here');
    });

    it('should ignore text without TEMUAN keyword', () => {
        const text = "Aman boss tidak ada celah.";
        const findings = parseFindingCardText(text, mockUnit, missionId, targetFile);
        expect(findings.length).toBe(0);
    });
});
