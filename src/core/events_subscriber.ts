import { ANT_Bus } from './events.js';
import { calibrateTrustScore } from './cognitive_architecture.js';
import { Logger } from '../utils/logger.js';

// Subscriber 1: Calibrate trust score automatically when a task state is committed
ANT_Bus.on('pes.committed', async (eventData: { taskId: string; version: number; changedFiles: string[] }) => {
  const { taskId, version, changedFiles } = eventData;
  Logger.log('INFO', `Event [pes.committed] captured. Task: ${taskId}, Version: ${version}. Files affected: ${changedFiles.join(', ') || 'none'}`, {}, 'EVENT_SUBSCRIBER');
  
  // Dynamically calibrate score for modified files (success loop simulation)
  if (changedFiles.length > 0) {
    await calibrateTrustScore('modify_file', true);
  }
});

// Subscriber 2: Log architectural decisions to system logs
ANT_Bus.on('pes.decision_recorded', (eventData: { taskId: string; decision: any }) => {
  const { taskId, decision } = eventData;
  Logger.log('INFO', `Event [pes.decision_recorded] captured. Task: ${taskId}. Decision ID: ${decision.id}. Content: ${decision.decision}. Rationale: ${decision.rationale}`, {}, 'EVENT_SUBSCRIBER');
});

// Subscriber 3: System rollback logs
ANT_Bus.on('pes.rolled_back', (eventData: { taskId: string; fromVersion: number; toVersion: number }) => {
  const { taskId, fromVersion, toVersion } = eventData;
  Logger.log('WARN', `Event [pes.rolled_back] captured. Task: ${taskId}. Rolled back from v${fromVersion} to v${toVersion}`, {}, 'EVENT_SUBSCRIBER');
});
