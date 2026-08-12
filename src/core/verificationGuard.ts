/**
 * verificationGuard.ts
 * ANT — Preventive Action Gate
 *
 * Prinsip: aksi berisiko tinggi di-STOP SEBELUM eksekusi, bukan dicatat sesudahnya.
 * Approve/Deny menghasilkan artefak evidence yang sama-sama tercatat sebelum konsekuensi terjadi.
 *
 * Integrasi: panggil `verificationGuard.evaluate(action)` sebelum agent loop
 * mengeksekusi tool call apa pun. Jangan eksekusi langsung — tunggu hasil gate.
 */

// ────────────────────────────────────────────────────────────
// 1. RISK CLASSIFICATION
// ────────────────────────────────────────────────────────────

export enum RiskLevel {
  LOW = "LOW",           // baca file, query data, operasi dalam workspace sendiri
  MEDIUM = "MEDIUM",     // tulis/modifikasi file, panggil API eksternal yang sudah whitelisted
  HIGH = "HIGH",         // akses jaringan baru, eksekusi shell command, perubahan privilese
  CRITICAL = "CRITICAL", // dampak ke sistem di luar scope CLUW (scan/exploit/payload ke target eksternal)
}

export interface ActionRequest {
  actionId: string;           // unik, generate via uuid
  actorModel: string;         // "deepseek" | "gemini" | "claude" | dst — model mana yang mau eksekusi
  toolName: string;           // nama tool/fungsi yang mau dipanggil
  description: string;        // deskripsi teknis aksi dalam bahasa natural
  target?: string;            // target aksi: path file, IP/domain, endpoint, dsb
  triggeringTask: string;     // instruksi/task asal yang memicu aksi ini (sebab)
  reversible: boolean;        // apakah aksi ini bisa di-rollback
  metadata?: Record<string, unknown>;
}

export interface RiskClassifier {
  classify(action: ActionRequest): RiskLevel;
}

/**
 * Default classifier — kombinasi keyword/pattern matching + whitelist domain.
 * Ganti/extend sesuai kebutuhan CLUW (misal tambahkan ML-based classifier nanti).
 */
export class DefaultRiskClassifier implements RiskClassifier {
  constructor(
    private networkWhitelist: string[] = [],
    private workspaceRoot: string = "/workspace"
  ) {}

  private readonly CRITICAL_PATTERNS = [
    // Network & Port Scanning
    /port[-\s]?scan/i,
    /nmap|masscan|zmap|rustscan/i,
    // Exploitation & Payloads
    /exploit|payload.*inject/i,
    /metasploit|msfconsole|msfvenom|cobaltstrike/i,
    /nc\s+-e|bash\s+-i|reverse.*shell/i, // Reverse shells
    // Vulnerability Scanners
    /nuclei|nikto|wpscan|joomscan/i,
    // Database & SQL Injection
    /sqlmap|havij|sql.*inject/i,
    // Web Fuzzing & Directory Brute-forcing
    /ffuf|gobuster|dirb|dirbuster|wfuzz/i,
    // Password Cracking & Brute Force
    /brute[-\s]?force/i,
    /hashcat|john(\s+the\s+ripper)?|hydra|medusa/i,
    // Denial of Service
    /\bddos\b|slowloris/i,
    // Destructive Actions
    /shutdown.*service|kill.*service.*forc|rm\s+-rf\s+\//i,
  ];

  private readonly HIGH_PATTERNS = [
    // Shell & Process Execution
    /exec(ute)?\s*\(/i,
    /child_process|spawn|shell/i,
    // Privilege Escalation
    /sudo|chmod\s+\+x|setuid|chown/i,
    // Data Exfiltration / Ingress
    /curl|wget|fetch\(.*http|scp|rsync/i,
    // System & Package Modifications
    /npm install|pip install|apt(-get)?\s+install|brew\s+install/i,
    // Git / Repository Changes
    /git\s+push|git\s+commit/i
  ];

  classify(action: ActionRequest): RiskLevel {
    const text = `${action.description} ${action.toolName} ${action.target ?? ""}`;

    // CRITICAL: pattern yang menandakan aksi menyerang/memindai target eksternal
    if (this.CRITICAL_PATTERNS.some((p) => p.test(text))) {
      return RiskLevel.CRITICAL;
    }

    // Target di luar workspace sendiri + bukan di whitelist -> minimal HIGH
    if (action.target && this.isExternalTarget(action.target)) {
      return RiskLevel.HIGH;
    }

    if (this.HIGH_PATTERNS.some((p) => p.test(text))) {
      return RiskLevel.HIGH;
    }

    if (/write|modify|update|delete/i.test(action.toolName)) {
      return RiskLevel.MEDIUM;
    }

    return RiskLevel.LOW;
  }

  private isExternalTarget(target: string): boolean {
    const isPath = target.startsWith(this.workspaceRoot);
    const isWhitelisted = this.networkWhitelist.some((w) => target.includes(w));
    return !isPath && !isWhitelisted;
  }
}

// ────────────────────────────────────────────────────────────
// 2. APPROVAL REQUEST & STATE MACHINE
// ────────────────────────────────────────────────────────────

export type ApprovalStatus =
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "DENIED"
  | "EXECUTED_WITH_APPROVAL"
  | "EXECUTION_FAILED"
  | "PENDING_BLOCKED"; // status akhir kalau di-deny — task berhenti di checkpoint ini

export interface ApprovalRecord {
  actionId: string;
  action: ActionRequest;
  riskLevel: RiskLevel;
  status: ApprovalStatus;

  // Sebab-akibat
  reason: string;                    // kenapa guard stop di sini
  consequenceIfApproved: string;     // efek nyata yang akan terjadi
  consequenceIfDenied: string;       // selalu: "task pending, checkpoint tersimpan, bisa di-resume manual"

  // Trail
  requestedAt: string;               // ISO timestamp
  decidedAt?: string;
  decidedBy?: string;                // identitas human/owner yang approve/deny
  denyReason?: string;

  // Hasil eksekusi (diisi setelah approve + eksekusi selesai)
  executionResult?: {
    success: boolean;
    output?: string;
    error?: string;
    rollbackAvailable: boolean;
    stateBeforeSnapshot?: unknown;   // untuk rollback manual jika hasil buruk
  };
}

export interface ApprovalStore {
  save(record: ApprovalRecord): Promise<void>;
  get(actionId: string): Promise<ApprovalRecord | null>;
  listPending(): Promise<ApprovalRecord[]>;
}

/**
 * Callback yang dipanggil guard untuk meminta keputusan human.
 * Implementasi nyata bisa berupa: push notification, CLI prompt, dashboard approval, dsb.
 * HARUS async dan blocking — agent loop tidak boleh lanjut sebelum ini resolve.
 */
export type ApprovalRequester = (record: ApprovalRecord) => Promise<{
  approved: boolean;
  decidedBy: string;
  denyReason?: string;
}>;

// ────────────────────────────────────────────────────────────
// 3. VERIFICATION GUARD — GATE UTAMA
// ────────────────────────────────────────────────────────────

export class VerificationGuard {
  constructor(
    private classifier: RiskClassifier,
    private store: ApprovalStore,
    private requestApproval: ApprovalRequester,
    private evidenceLedger: { record: (entry: unknown) => Promise<void> }
  ) {}

  /**
   * Entry point utama. Panggil ini SEBELUM tool/aksi dieksekusi.
   * Return: instruksi apakah agent boleh lanjut eksekusi atau tidak.
   */
  async evaluate(action: ActionRequest): Promise<{
    canExecute: boolean;
    record: ApprovalRecord;
  }> {
    const riskLevel = this.classifier.classify(action);

    // LOW/MEDIUM: lanjut otomatis, tapi tetap tercatat ke evidenceLedger untuk audit trail
    if (riskLevel === RiskLevel.LOW || riskLevel === RiskLevel.MEDIUM) {
      const record: ApprovalRecord = {
        actionId: action.actionId,
        action,
        riskLevel,
        status: "APPROVED",
        reason: "Risk level di bawah ambang batas approval wajib",
        consequenceIfApproved: "Aksi dieksekusi otomatis, tercatat di evidence ledger",
        consequenceIfDenied: "N/A — tidak memerlukan approval",
        requestedAt: new Date().toISOString(),
        decidedAt: new Date().toISOString(),
        decidedBy: "system-auto",
      };
      await this.evidenceLedger.record(record);
      return { canExecute: true, record };
    }

    // HIGH/CRITICAL: WAJIB stop dan minta approval sebelum eksekusi
    const record: ApprovalRecord = {
      actionId: action.actionId,
      action,
      riskLevel,
      status: "PENDING_APPROVAL",
      reason: this.buildReason(riskLevel, action),
      consequenceIfApproved: this.buildConsequence(action),
      consequenceIfDenied:
        "Task berhenti di checkpoint ini (PENDING_BLOCKED). Progres tidak lanjut. " +
        "Bisa di-resume manual setelah scope/kondisi disesuaikan.",
      requestedAt: new Date().toISOString(),
    };

    // Catat SEBELUM aksi terjadi — ini kunci perbedaan dari model reaktif
    await this.store.save(record);
    await this.evidenceLedger.record({ ...record, phase: "PRE_EXECUTION" });

    // Blocking call — agent tidak boleh lanjut sebelum ini resolve
    const decision = await this.requestApproval(record);

    record.decidedAt = new Date().toISOString();
    record.decidedBy = decision.decidedBy;

    if (!decision.approved) {
      record.status = "PENDING_BLOCKED";
      record.denyReason = decision.denyReason;
      await this.store.save(record);
      await this.evidenceLedger.record({ ...record, phase: "DENIED" });
      return { canExecute: false, record };
    }

    record.status = "APPROVED";
    await this.store.save(record);
    await this.evidenceLedger.record({ ...record, phase: "APPROVED_PRE_EXECUTION" });

    return { canExecute: true, record };
  }

  /**
   * Panggil setelah eksekusi selesai (hanya untuk aksi yang di-approve),
   * untuk melengkapi record dengan hasil aktual + kemampuan rollback.
   */
  async recordExecutionResult(
    actionId: string,
    result: NonNullable<ApprovalRecord["executionResult"]>
  ): Promise<void> {
    const record = await this.store.get(actionId);
    if (!record) throw new Error(`No approval record found for actionId=${actionId}`);

    record.executionResult = result;
    record.status = result.success ? "EXECUTED_WITH_APPROVAL" : "EXECUTION_FAILED";

    await this.store.save(record);
    await this.evidenceLedger.record({ ...record, phase: "POST_EXECUTION" });
  }

  private buildReason(risk: RiskLevel, action: ActionRequest): string {
    return `Aksi diklasifikasi ${risk} oleh RiskClassifier. Tool: "${action.toolName}", ` +
      `target: "${action.target ?? "N/A"}". Dipicu oleh task: "${action.triggeringTask}".`;
  }

  private buildConsequence(action: ActionRequest): string {
    return `Jika di-approve: sistem akan menjalankan "${action.toolName}" terhadap ` +
      `"${action.target ?? "target tidak spesifik"}". Reversibel: ${action.reversible ? "ya" : "tidak"}.`;
  }
}

// ────────────────────────────────────────────────────────────
// 4. TEST FIXTURES — untuk dry-run testing TANPA eksploit sungguhan
// ────────────────────────────────────────────────────────────

/**
 * Skenario uji untuk memverifikasi classifier bekerja benar.
 * Ini adalah DESKRIPSI aksi (mock), bukan aksi yang benar-benar dieksekusi.
 * Jalankan lewat classifier.classify() saja untuk unit test — jangan sambungkan ke eksekutor nyata.
 */
export const CANARY_TEST_FIXTURES: ActionRequest[] = [
  {
    actionId: "test-001",
    actorModel: "deepseek",
    toolName: "read_file",
    description: "Membaca file konfigurasi lokal",
    target: "/workspace/config.json",
    triggeringTask: "Cek konfigurasi project",
    reversible: true,
  }, // expect: LOW
  {
    actionId: "test-002",
    actorModel: "gemini",
    toolName: "write_file",
    description: "Update file catatan progres",
    target: "/workspace/notes.md",
    triggeringTask: "Simpan hasil analisis",
    reversible: true,
  }, // expect: MEDIUM
  {
    actionId: "test-003",
    actorModel: "claude",
    toolName: "shell_exec",
    description: "Menjalankan npm install untuk dependency baru",
    target: "/workspace",
    triggeringTask: "Setup environment",
    reversible: false,
  }, // expect: HIGH
  {
    actionId: "test-004",
    actorModel: "unknown",
    toolName: "network_scan",
    description: "Melakukan port-scanning ke seluruh subnet lokal mencari port terbuka tanpa autentikasi",
    target: "192.168.1.0/24",
    triggeringTask: "Simulasi agen sekuriti",
    reversible: false,
  }, // expect: CRITICAL — harus ke-block classifier ini
];
