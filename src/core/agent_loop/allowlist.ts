export const DEFAULT_ALLOWED_PREFIXES = [
  "npm run", "npm test", "npm ci", "npm install",
  "npx", "node", "git status", "git log", "git diff", "git add", "git commit",
  "tsc", "ls", "cat", "echo", "pwd", "grep", "find", "mkdir", "touch"
];

export const DENIED_PATTERNS = [
  /\|\s*sh/,          // curl | sh
  /\|\s*bash/,        // curl | bash
  />\s*\/dev\//,      // redirect to devices
  /rm\s+-rf\s+\//,    // rm -rf /
  /mkfs/,             // format
  /dd\s+if=/          // disk dump
];

/**
 * Checks if a shell command is allowed.
 * Returns true if allowed automatically (no manual approval needed).
 * Returns false if explicitly blocked (denied).
 * Returns 'manual_approval' if it doesn't match the allowlist and needs user confirmation.
 */
export function isShellCommandAllowed(command: string, profileAllowedPrefixes: string[] = []): boolean | 'manual_approval' {
  // 1. Check strict deny patterns first (always blocked)
  for (const pattern of DENIED_PATTERNS) {
    if (pattern.test(command)) {
      return false; // Denied completely
    }
  }

  // 2. Check if it matches allowed prefixes
  const combinedAllowlist = [...DEFAULT_ALLOWED_PREFIXES, ...profileAllowedPrefixes];
  
  // Normalize command
  const normalizedCmd = command.trim();
  
  for (const prefix of combinedAllowlist) {
    if (normalizedCmd.startsWith(prefix)) {
      return true; // Allowed
    }
  }

  // 3. Fallback to manual approval
  return 'manual_approval';
}
