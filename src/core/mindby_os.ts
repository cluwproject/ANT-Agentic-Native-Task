/**
 * @deprecated (Fase 3 audit) Modul ini tidak memiliki importer aktif dari entry point
 * (cli/index.ts -> boot -> agent loop). Akan DIHAPUS pada release berikutnya.
 * mindby_os / mindby_habitat hanyalah alias dari ant_os / ant_habitat.
 * Jika Anda membutuhkan modul ini, laporkan sebelum v0.5.
 */
import { AntOS } from './ant_os.js';
export * from './ant_os.js';
export const MindByOS = AntOS;
