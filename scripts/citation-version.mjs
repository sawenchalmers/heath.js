// Copies package.json's version, and today's date, into CITATION.cff. Run by npm as the "version"
// script, so `npm version patch --no-git-tag-version` (or minor) bumps both; CI checks they match.
import { readFileSync, writeFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
const today = new Date().toISOString().slice(0, 10);
const citation = readFileSync('CITATION.cff', 'utf8')
  .replace(/^version: .*$/m, `version: ${version}`)
  .replace(/^date-released: .*$/m, `date-released: "${today}"`);
writeFileSync('CITATION.cff', citation);
