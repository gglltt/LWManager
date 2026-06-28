function getHeaderValue(req, headerName) {
  if (!req || !headerName) return "";

  const lowerName = String(headerName).toLowerCase();

  const value =
    typeof req.get === "function"
      ? req.get(headerName)
      : req.headers?.[lowerName];

  if (Array.isArray(value)) {
    return value[0] ? String(value[0]).trim() : "";
  }

  return value ? String(value).trim() : "";
}

function decodeHeaderValue(value) {
  if (!value) return "";

  try {
    return decodeURIComponent(String(value).replace(/\+/g, "%20"));
  } catch {
    return String(value);
  }
}

function normalizeIp(ip) {
  if (!ip) return "";

  let cleanIp = String(ip).trim();

  if (!cleanIp) return "";

  if (cleanIp.startsWith("::ffff:")) {
    cleanIp = cleanIp.replace("::ffff:", "");
  }

  if (cleanIp === "::1") {
    return "127.0.0.1";
  }

  // Rimuove eventuali virgolette o formato "for="
  cleanIp = cleanIp.replace(/^for=/i, "").replace(/^"|"$/g, "");

  return cleanIp;
}

function getClientIp(req) {
  const cfIp = getHeaderValue(req, "cf-connecting-ip");
  if (cfIp) return normalizeIp(cfIp);

  const trueClientIp = getHeaderValue(req, "true-client-ip");
  if (trueClientIp) return normalizeIp(trueClientIp);

  const realIp = getHeaderValue(req, "x-real-ip");
  if (realIp) return normalizeIp(realIp);

  const forwardedFor = getHeaderValue(req, "x-forwarded-for");
  if (forwardedFor) {
    const firstIp = forwardedFor.split(",")[0];
    if (firstIp) return normalizeIp(firstIp);
  }

  const forwarded = getHeaderValue(req, "forwarded");
  if (forwarded) {
    const match = forwarded.match(/for="?([^;,\"]+)"?/i);
    if (match?.[1]) return normalizeIp(match[1]);
  }

  return normalizeIp(
    req?.ip ||
      req?.socket?.remoteAddress ||
      req?.connection?.remoteAddress ||
      ""
  );
}

function getBrowserType(req) {
  const userAgent = getHeaderValue(req, "user-agent");
  const ua = userAgent.toLowerCase();

  if (!ua) return "unknown";

  // Bot / crawler / link preview
  if (ua.includes("googlebot")) return "Google Bot";
  if (ua.includes("adsbot-google")) return "Google Ads Bot";
  if (ua.includes("googleother")) return "Google Other";
  if (ua.includes("bingbot")) return "Bing Bot";
  if (ua.includes("duckduckbot")) return "DuckDuckBot";
  if (ua.includes("yandexbot")) return "Yandex Bot";
  if (ua.includes("baiduspider")) return "Baidu Spider";
  if (ua.includes("facebookexternalhit")) return "Facebook Preview";
  if (ua.includes("facebot")) return "Facebook Bot";
  if (ua.includes("whatsapp")) return "WhatsApp Preview";
  if (ua.includes("telegrambot")) return "Telegram Bot";
  if (ua.includes("discordbot")) return "Discord Bot";
  if (ua.includes("slackbot")) return "Slack Bot";
  if (ua.includes("linkedinbot")) return "LinkedIn Bot";
  if (ua.includes("twitterbot")) return "Twitter/X Bot";
  if (ua.includes("applebot")) return "Apple Bot";

  // Browser specifici / mobile
  if (ua.includes("edg/") || ua.includes("edgios") || ua.includes("edga")) {
    return "Edge";
  }

  if (ua.includes("opr/") || ua.includes("opera")) {
    return "Opera";
  }

  if (ua.includes("samsungbrowser")) {
    return "Samsung Internet";
  }

  if (ua.includes("brave")) {
    return "Brave";
  }

  if (ua.includes("vivaldi")) {
    return "Vivaldi";
  }

  if (ua.includes("crios")) {
    return "Chrome iOS";
  }

  if (ua.includes("fxios")) {
    return "Firefox iOS";
  }

  if (ua.includes("firefox/")) {
    return "Firefox";
  }

  if (ua.includes("chromium/")) {
    return "Chromium";
  }

  if (ua.includes("chrome/")) {
    return "Chrome";
  }

  if (ua.includes("safari/")) {
    return "Safari";
  }

  if (ua.includes("msie") || ua.includes("trident/")) {
    return "Internet Explorer";
  }

  if (ua.includes("curl/")) return "curl";
  if (ua.includes("postmanruntime")) return "Postman";
  if (ua.includes("insomnia")) return "Insomnia";
  if (ua.includes("axios/")) return "Axios";
  if (ua.includes("node-fetch")) return "node-fetch";

  return "Other";
}

// La città e la nazione sono disponibili solo se il provider/proxy le passa negli header,
// ad esempio Cloudflare, Vercel o Google App Engine. In caso contrario rimangono unknown.
// Non viene usato alcun servizio GeoIP esterno.
function getSourceGeo(req) {
  const cityHeaders = [
    "x-vercel-ip-city",
    "cf-ipcity",
    "x-appengine-city",
    "x-city",
    "x-geo-city",
    "x-forwarded-city"
  ];

  const regionHeaders = [
    "x-vercel-ip-country-region",
    "cf-region",
    "x-appengine-region",
    "x-region",
    "x-geo-region",
    "x-forwarded-region"
  ];

  const countryHeaders = [
    "x-vercel-ip-country",
    "cf-ipcountry",
    "x-appengine-country",
    "x-country",
    "x-country-code",
    "x-geo-country",
    "x-forwarded-country"
  ];

  let city = "";
  let region = "";
  let country = "";

  for (const headerName of cityHeaders) {
    const value = getHeaderValue(req, headerName);
    if (value) {
      city = decodeHeaderValue(value);
      break;
    }
  }

  for (const headerName of regionHeaders) {
    const value = getHeaderValue(req, headerName);
    if (value) {
      region = decodeHeaderValue(value);
      break;
    }
  }

  for (const headerName of countryHeaders) {
    const value = getHeaderValue(req, headerName);
    if (value) {
      country = decodeHeaderValue(value);
      break;
    }
  }

  return {
    ip: getClientIp(req) || "unknown",
    city: city || "unknown",
    region: region || "unknown",
    country: country || "unknown"
  };
}

function getSourceCity(req) {
  return getSourceGeo(req).city;
}

function getSourceCountry(req) {
  return getSourceGeo(req).country;
}

function getRequestInfo(req) {
  const geo = getSourceGeo(req);

  return {
    ip: geo.ip,
    city: geo.city,
    region: geo.region,
    country: geo.country,
    browser: getBrowserType(req),
    userAgent: getHeaderValue(req, "user-agent") || "unknown",
    host: getHeaderValue(req, "host") || "unknown",
    forwardedHost: getHeaderValue(req, "x-forwarded-host") || "",
    protocol:
      getHeaderValue(req, "x-forwarded-proto") ||
      req?.protocol ||
      "unknown"
  };
}

function getDebugRequestHeaders(req) {
  return {
    "user-agent": getHeaderValue(req, "user-agent"),
    "host": getHeaderValue(req, "host"),
    "x-forwarded-host": getHeaderValue(req, "x-forwarded-host"),
    "x-forwarded-proto": getHeaderValue(req, "x-forwarded-proto"),

    "x-forwarded-for": getHeaderValue(req, "x-forwarded-for"),
    "x-real-ip": getHeaderValue(req, "x-real-ip"),
    "cf-connecting-ip": getHeaderValue(req, "cf-connecting-ip"),
    "true-client-ip": getHeaderValue(req, "true-client-ip"),
    "forwarded": getHeaderValue(req, "forwarded"),

    "cf-ipcity": getHeaderValue(req, "cf-ipcity"),
    "cf-region": getHeaderValue(req, "cf-region"),
    "cf-ipcountry": getHeaderValue(req, "cf-ipcountry"),

    "x-vercel-ip-city": getHeaderValue(req, "x-vercel-ip-city"),
    "x-vercel-ip-country-region": getHeaderValue(req, "x-vercel-ip-country-region"),
    "x-vercel-ip-country": getHeaderValue(req, "x-vercel-ip-country"),

    "x-appengine-city": getHeaderValue(req, "x-appengine-city"),
    "x-appengine-region": getHeaderValue(req, "x-appengine-region"),
    "x-appengine-country": getHeaderValue(req, "x-appengine-country")
  };
}

module.exports = {
  getHeaderValue,
  decodeHeaderValue,
  normalizeIp,
  getClientIp,
  getBrowserType,
  getSourceGeo,
  getSourceCity,
  getSourceCountry,
  getRequestInfo,
  getDebugRequestHeaders
};
