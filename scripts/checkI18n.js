const { SUPPORTED_LANGS, getTranslator } = require('../config/i18n');
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const source = fs.readFileSync(path.join(__dirname, '..', 'config', 'i18n.js'), 'utf8').replace('module.exports = {', 'module.exports = { translations,');
const sandbox = { module: { exports: {} }, exports: {}, require, console };
vm.runInNewContext(source, sandbox, { filename: 'config/i18n.js' });
const translations = sandbox.module.exports.translations;
const baseKeys = Object.keys(translations.it || {}).sort();
let ok = true;
for (const lang of SUPPORTED_LANGS) {
  const keys = Object.keys(translations[lang] || {}).sort();
  const missing = baseKeys.filter((key) => !keys.includes(key));
  const extra = keys.filter((key) => !baseKeys.includes(key));
  if (missing.length || extra.length) {
    ok = false;
    console.error(`[${lang}] missing: ${missing.join(', ') || '-'}; extra: ${extra.join(', ') || '-'}`);
  }
}
if (!SUPPORTED_LANGS.includes('uk')) {
  ok = false;
  console.error('uk is not included in SUPPORTED_LANGS');
}
if (getTranslator('uk')('save') !== 'Зберегти') {
  ok = false;
  console.error('uk translator did not load the expected save translation');
}
if (!ok) process.exit(1);
console.log(`i18n check passed for ${SUPPORTED_LANGS.length} languages and ${baseKeys.length} keys.`);
