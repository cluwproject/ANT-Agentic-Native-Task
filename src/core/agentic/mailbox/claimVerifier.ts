// claimVerifier.ts
// v1.1 — patch: ganti raw substring matching dengan word-boundary regex match.

export interface EvidenceRecord {
  evidenceId: string;
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  structured?: Record<string, unknown>;
}

export type ClaimStatus =
  | 'VERIFIED'
  | 'UNVERIFIED'
  | 'CONTRADICTED'
  | 'NEEDS_INDEPENDENT_CHECK';

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export class ClaimVerifier {
  private evidenceLedger: Map<string, EvidenceRecord>;

  constructor(evidenceData: EvidenceRecord[]) {
    this.evidenceLedger = new Map(evidenceData.map(e => [e.evidenceId, e]));
  }

  private matchesEvidence(claimText: string, evidence: EvidenceRecord): boolean {
    if (evidence.exitCode !== 0) return false;

    const normalizedClaim = claimText.trim().toLowerCase();
    if (!normalizedClaim) return false;

    const normalizedOutput = evidence.stdout.trim().toLowerCase();

    const pattern = new RegExp(`\\b${escapeRegExp(normalizedClaim)}\\b`);
    return pattern.test(normalizedOutput);
  }

  public resolveClaimStatus(
    claim: { text: string; evidenceRef?: string; topicKey: string },
    otherClaimsOnTopic: Array<{ text: string; modelId: string }>
  ): ClaimStatus {
    if (!claim.evidenceRef) {
      return 'UNVERIFIED';
    }

    const evidence = this.evidenceLedger.get(claim.evidenceRef);
    if (!evidence) {
      return 'UNVERIFIED';
    }

    if (this.matchesEvidence(claim.text, evidence)) {
      return 'VERIFIED';
    }

    const hasConflictingClaim = otherClaimsOnTopic.some(
      c => c.text.trim().toLowerCase() !== claim.text.trim().toLowerCase()
    );

    return hasConflictingClaim ? 'CONTRADICTED' : 'NEEDS_INDEPENDENT_CHECK';
  }
}
