#!/usr/bin/env node
// Runs web-ext lint against the Firefox build and tolerates exactly one known
// validation error: FILE_TOO_LARGE for content.js. That file carries the
// inlined Draco decoder (identical to the Chromium build), which pushes it
// past the linter's 5 MB parse limit. Any other validation error still makes
// this script exit non-zero.
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

const tolerated = errors.filter(
    (issue) => issue.code === 'FILE_TOO_LARGE' && issue.file === 'content.js',
);
const blocking = errors.filter(
    (issue) => !(issue.code === 'FILE_TOO_LARGE' && issue.file === 'content.js'),
);

console.log(
    `web-ext lint (${sourceDir}): ` +
        `${blocking.length} error(s), ` +
        `${tolerated.length} tolerated, ` +
        `${warnings.length} warning(s), ` +
        `${notices.length} notice(s)`,
);
for (const issue of blocking) {
    console.log(
        `ERROR ${issue.code}: ${issue.message} (${issue.file || 'unknown'})`,
    );
}
for (const issue of tolerated) {
    console.log(
        `tolerated ${issue.code}: ${issue.file} exceeds the linter's 5MB parse ` +
            'limit (Draco decoder inlined, same as the Chromium build)',
    );
}
for (const issue of warnings) {
    console.log(`warning ${issue.code}: ${issue.description || issue.message}`);
}

process.exit(blocking.length ? 1 : 0);
