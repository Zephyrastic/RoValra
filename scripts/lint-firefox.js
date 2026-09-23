#!/usr/bin/env node
// Runs web-ext lint against the Firefox build. Every validation error is
// blocking, matching AMO: addons-linter rejects JS files past its 5 MB parse
// limit (FILE_TOO_LARGE) and AMO fails submission on any error. content.js
// stays under that limit because the Firefox build ships the Draco decoder as
// a separate content script (see build.js), so a FILE_TOO_LARGE here means a
// real regression and must fail the build.
const { spawnSync } = require('child_process');

const sourceDir = process.argv[2] || 'dist-firefox';

const result = spawnSync(
    'npx',
    ['--yes', 'web-ext', 'lint', '--source-dir', sourceDir, '--output', 'json'],
    {
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
        shell: process.platform === 'win32',
    },
);

if (result.error) {
    console.error(result.error.message);
    process.exit(1);
}

let report;
try {
    report = JSON.parse(result.stdout || '');
} catch (e) {
    // Not JSON (e.g. npx failure): show the raw output and fail.
    process.stdout.write(result.stdout || '');
    process.stderr.write(result.stderr || '');
    process.exit(result.status || 1);
}

const errors = report.errors || [];
const warnings = report.warnings || [];
const notices = report.notices || [];

console.log(
    `web-ext lint (${sourceDir}): ` +
        `${errors.length} error(s), ` +
        `${warnings.length} warning(s), ` +
        `${notices.length} notice(s)`,
);
for (const issue of errors) {
    console.log(
        `ERROR ${issue.code}: ${issue.message} (${issue.file || 'unknown'})`,
    );
}
for (const issue of warnings) {
    console.log(`warning ${issue.code}: ${issue.description || issue.message}`);
}

process.exit(errors.length ? 1 : 0);
