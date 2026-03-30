async function translateTextAuto(text, targetLang) {
  const cleanText = String(text ?? "").trim();
  const cleanTarget = String(targetLang ?? "").trim().toLowerCase();
  if (!cleanText || !["it", "en", "fr", "es", "de", "ar", "pl", "sv", "da"].includes(cleanTarget)) {
    return { ok: false, errorCode: "invalid_input" };
  }

  async function fetchJsonWithTimeout(url, options = {}, timeoutMs = 7000) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      if (!response.ok) return null;
      return await response.json();
    } finally {
      clearTimeout(timeout);
    }
  }

  function isProviderErrorText(value) {
    const textValue = String(value ?? "").trim().toLowerCase();
    if (!textValue) return true;
    return (
      textValue.includes("invalid source language") ||
      textValue.includes("invalid target language") ||
      textValue.includes("langpair=") ||
      textValue.includes("example:")
    );
  }

  const providers = [
    {
      name: "google_public",
      run: async () => {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(cleanTarget)}&dt=t&q=${encodeURIComponent(cleanText)}`;
        const data = await fetchJsonWithTimeout(url, { method: "GET" });
        if (!Array.isArray(data) || !Array.isArray(data[0])) return null;

        const translatedText = data[0].map((part) => String(part?.[0] ?? "")).join("").trim();
        const sourceLang = String(data?.[2] ?? "").trim().toLowerCase();
        if (!translatedText) return null;
        return { translatedText, sourceLang: sourceLang || null };
      }
    },
    {
      name: "mymemory",
      run: async () => {
        const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(cleanText)}&langpair=auto|${encodeURIComponent(cleanTarget)}`;
        const data = await fetchJsonWithTimeout(url, { method: "GET" });
        if (Number(data?.responseStatus) !== 200) return null;
        const translatedText = String(data?.responseData?.translatedText ?? "").trim();
        if (isProviderErrorText(translatedText)) return null;
        const sourceLang = String(data?.responseData?.match ?? "").trim();
        if (!translatedText) return null;
        return { translatedText, sourceLang: sourceLang && sourceLang.length === 2 ? sourceLang.toLowerCase() : null };
      }
    },
    {
      name: "libretranslate",
      run: async () => {
        const data = await fetchJsonWithTimeout("https://translate.argosopentech.com/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            q: cleanText,
            source: "auto",
            target: cleanTarget,
            format: "text"
          })
        });
        const translatedText = String(data?.translatedText ?? "").trim();
        const sourceLang = String(data?.detectedLanguage?.language ?? "").trim().toLowerCase();
        if (!translatedText) return null;
        return { translatedText, sourceLang: sourceLang || null };
      }
    }
  ];

  for (const provider of providers) {
    try {
      const translated = await provider.run();
      if (!translated?.translatedText) continue;
      if (isProviderErrorText(translated.translatedText)) continue;
      const detectedLanguage = String(translated.sourceLang || "").toLowerCase();
      if (detectedLanguage && detectedLanguage === cleanTarget) {
        return { ok: true, translatedText: cleanText, sourceLang: detectedLanguage, sameLanguage: true };
      }
      return { ok: true, translatedText: translated.translatedText, sourceLang: detectedLanguage || null, sameLanguage: false };
    } catch (err) {
      // try next provider
    }
  }

  return { ok: false, errorCode: "provider_unavailable" };
}

module.exports = {
  translateTextAuto
};
