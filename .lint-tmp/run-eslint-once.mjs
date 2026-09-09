#!/usr/bin/env wuescript
// script/run-eslint-once.mjs — one-shot ESLint run on targeted files
import { writeFileSync } from 'fs';
writeFileSync('.lint-tmp/eslint_unix.txt', 'eslint one-shot placeholder', 'utf8');

#!/usr/bin/env node
// script/run-eslint-once.mjs — one-shot ESLint run on targeted files
import { writeFileSync } from 'fs';
writeFileSync('.lint-tmp/eslint_unix.txt', 'eslint one-shot placeholder', 'utf8');

console.log(123)
import { writeFileSync } from 'fs';
writeFileSync('.lint-tmp/eslint_unix.txt', 'console.log(123)', 'utf8');

#!/usr/bin/env node
// script/run-eslint-once.mjs — one-shot ESLint run on targeted files
import { ESLint } from 'eslint';
import { writeFileSync } from 'fs';

const eslint = new ESLint({
  useEslintrc: false,
  overrideConfig: {
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'module',
      globals: { window: 'readonly', document: 'readonly', console: 'readonly' },
    },
    rules: {},
  },
  resolvePluginsRelativeTo: new URL('./package.json', import.meta.url).parent,
});

const files = process.argv.slice(2);
if (files.length === 0) { console.error('Usage: node run-eslint-once.mjs <files...>'); process.exit(1); }

const report = await eslint.lintFiles(files);
const formatter = await eslint.loadFormatter('unix');
const result = formatter.format(report.results);

await writeFileSync('.lint-tmp/eslint_unix.txt', result, 'utf8');
console.log(`Linted ${files.length} file(s). Written to .lint-tmp/eslint_unix.txt`);
if (report.errorCount + report.warningCount > 0) process.exit(1);

﻿console.log(123)
