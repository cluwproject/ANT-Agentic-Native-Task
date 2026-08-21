import fs from 'fs/promises';
import path from 'path';
import type { MissionBlackboard, FindingCard } from './swarm_orchestrator.js';

export interface SwarmReportV1 {
  schema_version: '1.0';
  mission_id: string;
  generated_at: string;          // ISO-8601
  goal: string;
  target_paths: string[];
  status: 'completed' | 'partial' | 'failed' | 'clean';
  duration_ms: number | null;
  units: {
    id: string;                  // gray-1 … gray-5
    name?: string;
    status: 'pending' | 'running' | 'done' | 'failed';
  }[];
  summary: {
    total_findings: number;
    by_risk: { CRITICAL: number; HIGH: number; MEDIUM: number; LOW: number; INFO: number };
    by_unit: Record<string, number>;
  };
  findings: Array<{
    unit: string;
    target_file: string;
    threat_type: string;
    risk_level: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
    evidence_sha256?: string;
    suggested_patch?: string;
    action_decision?: string;
    timestamp?: string;
  }>;
  artifacts: {
    blackboard: string;          // path rel: workspace/missions/<id>.json
    markdown_report?: string;    // path rel jika WHITE unit sudah jalan
    json_report: string;         // path rel: workspace/reports/<id>_report.json
  };
}

export function buildSwarmReportFromBoard(
    board: MissionBlackboard,
    duration_ms: number | null = null,
    markdownReportRelPath?: string
): SwarmReportV1 {
    const rawFindings = board.findings || [];
    const validFindings = rawFindings.filter(f => f.risk_level !== 'CLEAN');

    const by_risk = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0 };
    const by_unit: Record<string, number> = {};

    const formattedFindings = validFindings.map(f => {
        const rawRisk = (f.risk_level || '').toUpperCase();
        const risk_level: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO' =
            ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'].includes(rawRisk)
                ? (rawRisk as any)
                : 'INFO';

        by_risk[risk_level] = (by_risk[risk_level] || 0) + 1;
        if (f.unit) {
            by_unit[f.unit] = (by_unit[f.unit] || 0) + 1;
        }

        return {
            unit: f.unit,
            target_file: f.target_file,
            threat_type: f.threat_type,
            risk_level,
            evidence_sha256: f.evidence_sha256,
            suggested_patch: f.suggested_patch,
            action_decision: f.action_decision,
            timestamp: f.timestamp
        };
    });

    const assignedUnits = board.assigned_units || {};
    const unitEntries = Object.entries(assignedUnits);

    const units = unitEntries.map(([id, status]) => ({
        id,
        status: status as 'pending' | 'running' | 'done' | 'failed'
    }));

    let status: 'completed' | 'partial' | 'failed' | 'clean' = 'completed';
    const totalUnits = units.length;
    const failedUnits = units.filter(u => u.status === 'failed').length;
    const doneUnits = units.filter(u => u.status === 'done').length;

    if (totalUnits > 0 && failedUnits === totalUnits) {
        status = 'failed';
    } else if (failedUnits > 0 || doneUnits < totalUnits) {
        status = 'partial';
    } else if (formattedFindings.length === 0) {
        status = 'clean';
    } else {
        status = 'completed';
    }

    const blackboardRel = path.join('workspace', 'missions', `${board.mission_id}.json`).replace(/\\/g, '/');
    const jsonReportRel = path.join('workspace', 'reports', `${board.mission_id}_report.json`).replace(/\\/g, '/');

    const report: SwarmReportV1 = {
        schema_version: '1.0',
        mission_id: board.mission_id,
        generated_at: new Date().toISOString(),
        goal: board.goal,
        target_paths: board.target_paths || [],
        status,
        duration_ms,
        units,
        summary: {
            total_findings: formattedFindings.length,
            by_risk,
            by_unit
        },
        findings: formattedFindings,
        artifacts: {
            blackboard: blackboardRel,
            ...(markdownReportRelPath ? { markdown_report: markdownReportRelPath.replace(/\\/g, '/') } : {}),
            json_report: jsonReportRel
        }
    };

    return report;
}

export async function writeSwarmReportJson(
    report: SwarmReportV1,
    baseDir: string = process.cwd()
): Promise<string> {
    const reportsDir = path.join(baseDir, 'workspace', 'reports');
    await fs.mkdir(reportsDir, { recursive: true });
    
    const filePath = path.join(reportsDir, `${report.mission_id}_report.json`);
    await fs.writeFile(filePath, JSON.stringify(report, null, 2), 'utf-8');
    return filePath;
}

export async function readSwarmReportJson(
    missionId: string,
    baseDir: string = process.cwd()
): Promise<SwarmReportV1 | null> {
    const filePath = path.join(baseDir, 'workspace', 'reports', `${missionId}_report.json`);
    try {
        const content = await fs.readFile(filePath, 'utf-8');
        return JSON.parse(content) as SwarmReportV1;
    } catch {
        return null;
    }
}

export async function getOrBuildSwarmReport(
    missionId: string,
    baseDir: string = process.cwd()
): Promise<SwarmReportV1 | null> {
    // 1. Try reading existing JSON report
    const existing = await readSwarmReportJson(missionId, baseDir);
    if (existing) return existing;

    // 2. Fallback: Build on-the-fly from blackboard JSON
    const blackboardPath = path.join(baseDir, 'workspace', 'missions', `${missionId}.json`);
    try {
        const content = await fs.readFile(blackboardPath, 'utf-8');
        const board: MissionBlackboard = JSON.parse(content);

        // Check if markdown report already exists
        const mdRelPath = path.join('workspace', 'reports', `${missionId}_audit_report.md`).replace(/\\/g, '/');
        const mdFullPath = path.join(baseDir, mdRelPath);
        const mdExists = await fs.stat(mdFullPath).then(() => true).catch(() => false);

        const report = buildSwarmReportFromBoard(board, null, mdExists ? mdRelPath : undefined);
        await writeSwarmReportJson(report, baseDir);
        return report;
    } catch {
        return null;
    }
}
