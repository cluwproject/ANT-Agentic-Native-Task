import { CLUW_Bus } from '../core/events.js';
import fs from 'fs/promises';
import path from 'path';

const LOG_FILE = path.join(process.cwd(), 'workspace', 'activity.log');

export const Logger = {
  async log(level: 'INFO' | 'WARN' | 'ERROR' | 'AI' | 'DEBUG', message: string, details?: any, tag?: string) {
    const timestamp = new Date().toISOString();
    const model = details?.model ? ` [MODEL: ${details.model}]` : '';
    const channel = details?.channel ? ` [CHANNEL: ${details.channel}]` : '';
    const getCircularReplacer = () => {
      const seen = new WeakSet();
      return (key: string, value: any) => {
        if (typeof value === "object" && value !== null) {
          if (seen.has(value)) {
            return "[Circular]";
          }
          seen.add(value);
        }
        return value;
      };
    };

    const detailsStr = details ? JSON.stringify(details, getCircularReplacer()) : '';
    const logEntry = `[${timestamp}] [${level}]${tag ? ' [' + tag + ']' : ''}${channel}${model} ${message} ${detailsStr}\n`;
    
    // Neural Bus Broadcast
    CLUW_Bus.emit('system.log', { level, message, timestamp, tag, details, model: details?.model, channel: details?.channel });
    if (level === 'ERROR') CLUW_Bus.emit('system.error', { message, timestamp });

    // Console output with professional formatting
    const colors: any = { INFO: '\x1b[32m', WARN: '\x1b[33m', ERROR: '\x1b[31m', AI: '\x1b[36m', DEBUG: '\x1b[90m', reset: '\x1b[0m' };
    const tagPrefix = tag ? `\x1b[90m[${tag}]\x1b[0m ` : '';
    const channelPrefix = details?.channel ? `\x1b[35m[${details.channel}]\x1b[0m ` : '';
    const modelPrefix = details?.model ? `\x1b[34m[${details.model}]\x1b[0m ` : '';
    console.log(`${colors.reset}${timestamp} ${colors[level]}${level}${colors.reset} | ${channelPrefix}${modelPrefix}${tagPrefix}${message}`);
    
    try {
      // Split log files based on category to prevent buffer bloat and allow AI context-reading
      let targetFile = LOG_FILE;
      if (tag === 'CHAT' || tag === 'SESSION' || tag === 'USER_INTENT' || tag === 'AGENT') {
        targetFile = path.join(process.cwd(), 'workspace', 'interactions.log');
      } else if (tag === 'TASK' || tag === 'SCHEDULE') {
        targetFile = path.join(process.cwd(), 'workspace', 'tasks.log');
      } else if (tag === 'SECURITY' || tag === 'APPROVAL') {
        targetFile = path.join(process.cwd(), 'workspace', 'security.log');
      }
      
      await fs.appendFile(targetFile, logEntry);
    } catch (e) {
      console.error('Failed to write to log file', e);
    }
  },

  async api(method: string, path: string, status: number, duration?: number) {
    const msg = `${method} ${path} - ${status} (${duration || 0}ms)`;
    return this.log(status >= 400 ? 'WARN' : 'INFO', msg, { method, path, status, duration }, 'API');
  },

  async task(action: string, id: string) {
    return this.log('INFO', `Task ${id}: ${action}`, { id, action }, 'TASK');
  },

  async approval(action: string, resource: string) {
    return this.log('WARN', `Approval ${action}: ${resource}`, { action, resource }, 'APPROVAL');
  },

  async chat(userMsg: string, aiMsg: string, provider: string) {
    return this.log('AI', `Chat via ${provider}`, { user: userMsg, ai: aiMsg, provider }, 'CHAT');
  }
};
