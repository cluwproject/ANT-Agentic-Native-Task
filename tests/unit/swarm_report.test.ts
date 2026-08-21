import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import {
    buildSwarmReportFromBoard,
    writeSwarmReportJson,
    readSwarmReportJson,
    getOrBuildSwarmReport,
    type SwarmReportV1
} from '../../src/core/agentic/swarm_report.js';
import type { MissionBlackboard } from '../../src/core/agentic/swarm_orchestrator.js';

describe('Swarm Report Generator (SwarmReportV1)', () => {

    it('should generate a valid SwarmReportV1 with accurate risk counts', () => {
        const mockBoard: MissionBlackboard = {
            mission_id: 'mission-test-123',
            goal: 'Security audit of src/',
            target_paths: ['src/'],
            assigned_units: {
                'gray-1': 'done',
                'gray-2': 'done',
                'gray-3': 'done'
            },
            findings: [
                {
                    unit: 'gray-1',
                    mission_id: 'mission-test-123',
                    target_file: 'src/core/auth.ts',
                    threat_type: 'Hardcoded Secret',
                    risk_level: 'CRITICAL',
                    action_decision: '[PERBAIKI]',
                    suggested_patch: 'Use env',
                    timestamp: new Date().toISOString()
                },
                {
                    unit: 'gray-2',
                    mission_id: 'mission-test-123',
                    target_file: 'src/core/db.ts',
                    threat_type: 'SQL Injection',
                    risk_level: 'HIGH',
                    action_decision: '[PERBAIKI]',
                    suggested_patch: 'Parametrize query',
                    timestamp: new Date().toISOString()
                },
                {
                    unit: 'gray-3',
                    mission_id: 'mission-test-123',
                    target_file: 'src/utils/clean.ts',
                    threat_type: 'No threat',
                    risk_level: 'CLEAN',
                    action_decision: '[ABAIKAN]',
                    timestamp: new Date().toISOString()
                }
            ],
            created_at: new Date().toISOString()
        };

        const report = buildSwarmReportFromBoard(mockBoard, 8421, 'workspace/reports/mission-test-123_audit_report.md');

        assert.strictEqual(report.schema_version, '1.0');
        assert.strictEqual(report.mission_id, 'mission-test-123');
        assert.strictEqual(report.status, 'completed');
        assert.strictEqual(report.duration_ms, 8421);
        assert.strictEqual(report.summary.total_findings, 2); // Excludes CLEAN
        assert.strictEqual(report.summary.by_risk.CRITICAL, 1);
        assert.strictEqual(report.summary.by_risk.HIGH, 1);
        assert.strictEqual(report.summary.by_risk.MEDIUM, 0);
        assert.strictEqual(report.summary.by_unit['gray-1'], 1);
        assert.strictEqual(report.summary.by_unit['gray-2'], 1);
        assert.strictEqual(report.artifacts.markdown_report, 'workspace/reports/mission-test-123_audit_report.md');
        assert.strictEqual(report.artifacts.blackboard, 'workspace/missions/mission-test-123.json');
        assert.strictEqual(report.artifacts.json_report, 'workspace/reports/mission-test-123_report.json');
    });

    it('should set status to clean when there are 0 findings', () => {
        const mockBoard: MissionBlackboard = {
            mission_id: 'mission-clean-456',
            goal: 'Clean repo check',
            target_paths: ['tests/'],
            assigned_units: {
                'gray-1': 'done',
                'gray-2': 'done'
            },
            findings: [],
            created_at: new Date().toISOString()
        };

        const report = buildSwarmReportFromBoard(mockBoard, 1200);
        assert.strictEqual(report.status, 'clean');
        assert.strictEqual(report.summary.total_findings, 0);
        assert.strictEqual(report.findings.length, 0);
    });

    it('should set status to partial when any unit failed', () => {
        const mockBoard: MissionBlackboard = {
            mission_id: 'mission-partial-789',
            goal: 'Partial check',
            target_paths: ['src/'],
            assigned_units: {
                'gray-1': 'done',
                'gray-2': 'failed'
            },
            findings: [],
            created_at: new Date().toISOString()
        };

        const report = buildSwarmReportFromBoard(mockBoard, 500);
        assert.strictEqual(report.status, 'partial');
    });

    it('should write and read report JSON correctly', async () => {
        const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ant-report-test-'));
        try {
            const sampleReport: SwarmReportV1 = {
                schema_version: '1.0',
                mission_id: 'mission-roundtrip',
                generated_at: new Date().toISOString(),
                goal: 'Roundtrip test',
                target_paths: ['src/'],
                status: 'clean',
                duration_ms: 100,
                units: [{ id: 'gray-1', status: 'done' }],
                summary: {
                    total_findings: 0,
                    by_risk: { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0 },
                    by_unit: {}
                },
                findings: [],
                artifacts: {
                    blackboard: 'workspace/missions/mission-roundtrip.json',
                    json_report: 'workspace/reports/mission-roundtrip_report.json'
                }
            };

            const writtenPath = await writeSwarmReportJson(sampleReport, tempDir);
            assert.ok(writtenPath.endsWith('mission-roundtrip_report.json'));

            const readReport = await readSwarmReportJson('mission-roundtrip', tempDir);
            assert.ok(readReport);
            assert.strictEqual(readReport?.mission_id, 'mission-roundtrip');
            assert.strictEqual(readReport?.schema_version, '1.0');
        } finally {
            await fs.rm(tempDir, { recursive: true, force: true });
        }
    });
});
