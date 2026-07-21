const test = require("node:test");
const assert = require("node:assert/strict");
const { SUPPORTED_LANGS, getTranslator } = require("../config/i18n");

const expected = {
  it: "Inserisci codice alleanza, server e PIN.",
  en: "Enter alliance code, server and PIN.",
  fr: "Saisissez le code alliance, le serveur et le PIN.",
  es: "Introduce el código de alianza, el servidor y el PIN.",
  de: "Gib Allianzcode, Server und PIN ein.",
  ar: "أدخل رمز التحالف والخادم ورقم PIN.",
  pl: "Wprowadź kod sojuszu, serwer i PIN.",
  sv: "Ange allianskod, server och PIN-kod.",
  da: "Indtast alliancekode, server og PIN-kode.",
  uk: "Введіть код альянсу, сервер і PIN-код."
};

test("login tenant hint is localized in every supported language", () => {
  assert.deepEqual([...SUPPORTED_LANGS].sort(), Object.keys(expected).sort());
  for (const lang of SUPPORTED_LANGS) {
    assert.equal(getTranslator(lang)("login_tenant_hint"), expected[lang]);
  }
});
