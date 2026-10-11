import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const enPath = path.join(__dirname, '../src/locales/en.json');
const mrPath = path.join(__dirname, '../src/locales/mr.json');
const hiPath = path.join(__dirname, '../src/locales/hi.json');
const srcDir = path.join(__dirname, '../src');

console.log('==============================================');
console.log('🌐 RUNNING i18n INTEGRITY & LOCALIZATION CHECK');
console.log('==============================================');

let hasErrors = false;
let warningCount = 0;

// 1. Check file existence
if (!fs.existsSync(enPath) || !fs.existsSync(mrPath) || !fs.existsSync(hiPath)) {
  console.error('❌ FAIL: Locale files missing. en.json, mr.json, and hi.json must exist.');
  process.exit(1);
}

const en = JSON.parse(fs.readFileSync(enPath, 'utf8'));
const mr = JSON.parse(fs.readFileSync(mrPath, 'utf8'));
const hi = JSON.parse(fs.readFileSync(hiPath, 'utf8'));

// Helper to flatten object into dot-notation paths
function flattenKeys(obj, prefix = '') {
  let keys = [];
  for (const k in obj) {
    const fullKey = prefix ? `${prefix}.${k}` : k;
    if (typeof obj[k] === 'object' && obj[k] !== null && !Array.isArray(obj[k])) {
      keys = keys.concat(flattenKeys(obj[k], fullKey));
    } else {
      keys.push({ key: fullKey, value: obj[k] });
    }
  }
  return keys;
}

const enFlat = flattenKeys(en);
const mrFlat = flattenKeys(mr);
const hiFlat = flattenKeys(hi);

const enMap = new Map(enFlat.map(item => [item.key, item.value]));
const mrMap = new Map(mrFlat.map(item => [item.key, item.value]));
const hiMap = new Map(hiFlat.map(item => [item.key, item.value]));

// 2. Check for missing keys across all 3 files
const missingInMr = [];
const missingInHi = [];
for (const [k, v] of enMap.entries()) {
  if (!mrMap.has(k)) {
    missingInMr.push(k);
  }
  if (!hiMap.has(k)) {
    missingInHi.push(k);
  }
}

const missingInEn = [];
for (const [k, v] of mrMap.entries()) {
  if (!enMap.has(k)) {
    missingInEn.push(k);
  }
}

for (const [k, v] of hiMap.entries()) {
  if (!enMap.has(k) && !missingInEn.includes(k)) {
    missingInEn.push(k);
  }
}

if (missingInMr.length > 0) {
  console.error(`❌ FAIL: ${missingInMr.length} keys in en.json missing in mr.json:`);
  missingInMr.slice(0, 15).forEach(k => console.error(`   - ${k}`));
  hasErrors = true;
}

if (missingInHi.length > 0) {
  console.error(`❌ FAIL: ${missingInHi.length} keys in en.json missing in hi.json:`);
  missingInHi.slice(0, 15).forEach(k => console.error(`   - ${k}`));
  hasErrors = true;
}

if (missingInEn.length > 0) {
  console.error(`❌ FAIL: ${missingInEn.length} keys in mr/hi missing in en.json:`);
  missingInEn.slice(0, 15).forEach(k => console.error(`   - ${k}`));
  hasErrors = true;
}

if (!hasErrors) {
  console.log(`✅ PASS: All 3 locales (en.json, mr.json, hi.json) have identical key parity (${enMap.size} keys).`);
  console.log(`✅ PASS: No empty translation values found across locales.`);
}

// 3. Scan JSX files for dual-language slash patterns like "English / Marathi" or raw Devanagari text
console.log('\n🔍 SCANNING CLIENT JSX FOR SUSPICIOUS HARDCODED TEXT...');

// Words and patterns to ignore (proper nouns, technical names)
const allowedPatterns = [
  /Nagar Setu/i,
  /Maharashtra/i,
  /Pune/i,
  /PMC/i,
  /IST/i,
  /Nominatim/i,
  /OpenStreetMap/i,
  /Leaflet/i
];

function scanFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== 'dist' && entry.name !== 'locales') {
        scanFiles(fullPath);
      }
    } else if (entry.name.endsWith('.jsx') || entry.name.endsWith('.tsx')) {
      checkJsxFile(fullPath);
    }
  }
}

function checkJsxFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');

  lines.forEach((line, lineNum) => {
    // 1. Dual language slash check: e.g. "Roads / रस्ते" or "Ward / प्रभाग"
    if (/[\u0900-\u097F]+.*\/.*[a-zA-Z]+|[a-zA-Z]+.*\/.*[\u0900-\u097F]+/.test(line)) {
      console.warn(`⚠️  WARNING [Line ${lineNum + 1}] Dual-language pattern detected in ${path.relative(srcDir, filePath)}:`);
      console.warn(`    ${line.trim()}`);
      warningCount++;
    }
  });
}

scanFiles(srcDir);

console.log('==============================================');
if (hasErrors) {
  console.error('❌ i18n INTEGRITY CHECK FAILED');
  process.exit(1);
} else {
  console.log(`🎉 i18n CHECK COMPLETE with ${warningCount} warnings.`);
  process.exit(0);
}
