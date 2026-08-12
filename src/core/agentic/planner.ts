import { Logger } from '../../utils/logger.js';

export interface ExecutionPlanStep {
    step: number;
    title: string;
    description: string;
    suggestedTool?: string;
    status: 'pending' | 'in_progress' | 'completed' | 'failed';
}

export interface ExecutionPlan {
    goal: string;
    totalSteps: number;
    steps: ExecutionPlanStep[];
    createdAt: string;
}

export function parsePlanFromResponse(goal: string, text: string): ExecutionPlan {
    const steps: ExecutionPlanStep[] = [];
    const lines = text.split('\n');
    let stepCount = 0;

    for (const line of lines) {
        const match = line.match(/^(\d+)[\.\)]\s*(.+)$/);
        if (match) {
            stepCount++;
            const title = match[2].trim();
            steps.push({
                step: stepCount,
                title,
                description: title,
                status: 'pending'
            });
        }
    }

    if (steps.length === 0) {
        steps.push({
            step: 1,
            title: 'Eksekusi Tugas Utama',
            description: goal,
            status: 'pending'
        });
    }

    return {
        goal,
        totalSteps: steps.length,
        steps,
        createdAt: new Date().toISOString()
    };
}

export function renderPlanSummary(plan: ExecutionPlan): string {
    let output = `\n📋 **[HTN EXECUTION PLAN] Goal:** ${plan.goal}\n`;
    for (const s of plan.steps) {
        const icon = s.status === 'completed' ? '✓' : s.status === 'in_progress' ? '►' : s.status === 'failed' ? '✗' : '○';
        output += `  ${icon} Step ${s.step}: ${s.title}\n`;
    }
    return output;
}
