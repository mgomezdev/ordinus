// Renders a vitest json-summary as a Markdown table for $GITHUB_STEP_SUMMARY.
// Usage: node coverage-summary.mjs <coverage-summary.json> <label>
import { existsSync, readFileSync } from 'node:fs';

const [file, label = 'Coverage'] = process.argv.slice(2);

if (!existsSync(file)) {
  console.log(`### ${label} coverage\n\n_No coverage report produced._`);
  process.exit(0);
}

const { total } = JSON.parse(readFileSync(file, 'utf8'));
const rows = ['statements', 'branches', 'functions', 'lines']
  .map((key) => `| ${key} | ${total[key].pct}% | ${total[key].covered}/${total[key].total} |`);

console.log([`### ${label} coverage`, '', '| metric | % | covered |', '| --- | --- | --- |', ...rows, ''].join('\n'));
