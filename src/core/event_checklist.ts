/**
 * ═══════════════════════════════════════════════════════════════
 * ANT & MINDBY — AUTOMATED EVENT CHECKLIST ENGINE
 * ═══════════════════════════════════════════════════════════════
 * Menghasilkan matriks persyaratkan event (misal Devpost/XPRIZE) 
 * secara otomatis di awal sesi kerja, memastikan arah pembangunan
 * terukur sejak Hari 1 dan tidak disusun ulang di akhir.
 * ═══════════════════════════════════════════════════════════════
 */

export interface EventChecklistItem {
    id: string;
    requirement: string;
    mandatory: boolean;
    status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';
    evidenceId?: string;
}

export class EventChecklistEngine {
    private checklist: EventChecklistItem[] = [];

    constructor() {
        this.initializeDefaultXprizeChecklist();
    }

    private initializeDefaultXprizeChecklist() {
        this.checklist = [
            { id: 'REQ-01', requirement: 'Working Codebase & Repository', mandatory: true, status: 'IN_PROGRESS' },
            { id: 'REQ-02', requirement: '3-Minute Live Video Demo', mandatory: true, status: 'NOT_STARTED' },
            { id: 'REQ-03', requirement: 'Live in Production / Working MVP', mandatory: true, status: 'IN_PROGRESS' },
            { id: 'REQ-04', requirement: 'Revenue Evidence or Transparent Prototype Status', mandatory: true, status: 'NOT_STARTED' },
            { id: 'REQ-05', requirement: 'Technical Architecture Documentation (README/ARCHITECTURE.md)', mandatory: true, status: 'COMPLETED' }
        ];
    }

    public updateStatus(id: string, status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED', evidenceId?: string) {
        const item = this.checklist.find(c => c.id === id);
        if (item) {
            item.status = status;
            if (evidenceId) item.evidenceId = evidenceId;
        }
    }

    public renderXml(): string {
        let xml = `<event_requirements_checklist>\n`;
        for (const item of this.checklist) {
            xml += `  <item id="${item.id}" mandatory="${item.mandatory}" status="${item.status}">\n`;
            xml += `    <requirement>${item.requirement}</requirement>\n`;
            if (item.evidenceId) xml += `    <evidence_id>${item.evidenceId}</evidence_id>\n`;
            xml += `  </item>\n`;
        }
        xml += `</event_requirements_checklist>\n`;
        return xml;
    }
}
