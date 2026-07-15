const fs = require('fs');
const path = require('path');
const vm = require('vm');

const configPath = path.join(__dirname, '..', 'config', 'i18n.js');
const source = fs.readFileSync(configPath, 'utf8').replace('module.exports = {', 'module.exports = { translations,');
const sandbox = { module: { exports: {} }, exports: {}, console };
vm.runInNewContext(source, sandbox, { filename: 'config/i18n.js' });

const { SUPPORTED_LANGS, translations } = sandbox.module.exports;
const detectedLanguages = Object.keys(translations || {}).filter((lang) => SUPPORTED_LANGS.includes(lang)).sort();
const keySet = (obj) => new Set(Object.keys(obj || {}));
const baseLang = detectedLanguages
  .slice()
  .sort((a, b) => keySet(translations[b]).size - keySet(translations[a]).size || a.localeCompare(b))[0];
const baseKeys = [...keySet(translations[baseLang])].sort();

let hasErrors = false;
console.log('Lingue rilevate:');
for (const lang of detectedLanguages) console.log(`- ${lang}`);
console.log(`Lingua base: ${baseLang}`);

for (const lang of detectedLanguages) {
  const values = translations[lang] || {};
  const keys = keySet(values);
  const missing = baseKeys.filter((key) => !keys.has(key));
  const empty = [...keys].filter((key) => values[key] === '' || values[key] === null || values[key] === undefined);
  const extra = [...keys].filter((key) => !baseKeys.includes(key)).sort();
  if (missing.length) {
    hasErrors = true;
    console.error(`Missing keys in ${lang}:`);
    missing.forEach((key) => console.error(`- ${key}`));
  }
  if (empty.length) {
    hasErrors = true;
    console.error(`Empty values in ${lang}:`);
    empty.forEach((key) => console.error(`- ${key}`));
  }
  if (extra.length) {
    console.warn(`Extra keys in ${lang}: ${extra.join(', ')}`);
  }
}

if (hasErrors) process.exit(1);
console.log(`i18n check passed. Languages checked: ${detectedLanguages.join(', ')}`);
