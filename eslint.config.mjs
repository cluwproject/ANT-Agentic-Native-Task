// ANT — ESLint Flat Config (Fase 4 Quality Gates)
// Prinsip: gate yang menahan merge harus deterministik.
//
// Aturan yang diturunkan ke 'warn' adalah pola INTENSIONAL dari CLI terminal:
//   - no-control-regex      : deteksi \x1b (ANSI), \x00 (NUL-guard allowlist)
//                             adalah FUNGSI INTI ANT, bukan bug.
//   - no-useless-escape     : escaping backtick/dot di regex ANSI string.
//   - prefer-const          : legacy style, migrasi bertahap.
//   - ban-ts-comment        : @ts-ignore legacy, migrasi ke @ts-expect-error.
//   - no-case-declarations  : pola switch-case lama.
//   - no-useless-catch      : wrapper try/catch untuk logging terpusat.
// Semua bisa ditingkatkan ke 'error' setelah pembersihan bertahap.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    {
        ignores: [
            'dist/**',
            'node_modules/**',
            'brain/**',
            'workspace/**',
            'coverage/**',
            'scripts/**',
            'examples/**',
            'tools/**',
            'bin/**'
        ]
    },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        rules: {
            // Basis kode masih memakai any di banyak tempat — warn dulu,
            // targetkan 'error' setelah pembersihan bertahap.
            '@typescript-eslint/no-explicit-any': 'warn',
            '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
            '@typescript-eslint/ban-ts-comment': 'warn',

            // Pola intensional CLI terminal (lihat catatan header).
            'no-control-regex': 'off',
            'no-useless-escape': 'warn',
            'prefer-const': 'warn',
            'no-case-declarations': 'warn',
            'no-useless-catch': 'warn',

            // catch kosong adalah pola defensif yang disengaja di ANT
            'no-empty': ['error', { allowEmptyCatch: true }]
        }
    }
);