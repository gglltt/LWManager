const DEFAULT_BASE_URL = "https://api.lastwar.dev";

function getLastWarConfig() {
  const apiKey = String(process.env.LASTWAR_API_KEY || "").trim();
  const baseUrl = String(process.env.LASTWAR_API_BASE_URL || DEFAULT_BASE_URL).trim().replace(/\/+$/, "");
  return { apiKey, baseUrl };
}

function toArray(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.data)) return value.data;
  if (Array.isArray(value?.results)) return value.results;
  if (Array.isArray(value?.items)) return value.items;
  return [];
}

function pickAllianceId(alliance) {
  if (!alliance || typeof alliance !== "object") return null;
  return alliance.id || alliance.allianceId || alliance.alliance_id || alliance.uuid || null;
}

function allianceName(alliance) {
  if (!alliance || typeof alliance !== "object") return "";
  return String(alliance.name || alliance.allianceName || alliance.tag || "").trim();
}

async function fetchJson(url, apiKey) {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    const bodyText = await response.text().catch(() => "");
    throw new Error(`LastWar API error (${response.status}) on ${url}: ${bodyText.slice(0, 180)}`);
  }

  return response.json();
}

function normalizePlayer(player) {
  if (!player || typeof player !== "object") return null;

  const nickname = String(player.nickname || player.name || player.playerName || "").trim();
  const playerId = player.id || player.playerId || player.player_id || null;

  return {
    playerId,
    nickname,
    role: player.role || player.rank || null,
    raw: player
  };
}

async function fetchBissPlayers() {
  const { apiKey, baseUrl } = getLastWarConfig();
  if (!apiKey) {
    throw new Error("LASTWAR_API_KEY non configurata.");
  }

  const encodedAllianceName = encodeURIComponent("Biss");

  const allianceSearchUrls = [
    `${baseUrl}/v1/alliance/search?name=${encodedAllianceName}`,
    `${baseUrl}/v1/alliances/search?name=${encodedAllianceName}`,
    `${baseUrl}/v1/alliance?name=${encodedAllianceName}`
  ];

  let selectedAlliance = null;
  let selectedAllianceEndpoint = null;

  for (const url of allianceSearchUrls) {
    try {
      const payload = await fetchJson(url, apiKey);
      const alliances = toArray(payload);
      if (!alliances.length) continue;

      selectedAlliance = alliances.find((a) => allianceName(a).toLowerCase() === "biss") || alliances[0];
      selectedAllianceEndpoint = url;
      break;
    } catch (err) {
      // prova endpoint successivo
    }
  }

  const playersSearchUrls = [];

  if (selectedAlliance) {
    const allianceId = pickAllianceId(selectedAlliance);
    if (allianceId) {
      playersSearchUrls.push(
        `${baseUrl}/v1/alliance/${encodeURIComponent(String(allianceId))}/players`,
        `${baseUrl}/v1/alliances/${encodeURIComponent(String(allianceId))}/players`,
        `${baseUrl}/v1/alliance/${encodeURIComponent(String(allianceId))}/members`,
        `${baseUrl}/v1/alliances/${encodeURIComponent(String(allianceId))}/members`
      );
    }
  }

  playersSearchUrls.push(
    `${baseUrl}/v1/player/search?alliance=${encodedAllianceName}`,
    `${baseUrl}/v1/players/search?alliance=${encodedAllianceName}`
  );

  let players = [];
  let selectedPlayersEndpoint = null;

  for (const url of playersSearchUrls) {
    try {
      const payload = await fetchJson(url, apiKey);
      const maybePlayers = toArray(payload);
      if (!maybePlayers.length) continue;
      players = maybePlayers;
      selectedPlayersEndpoint = url;
      break;
    } catch (err) {
      // prova endpoint successivo
    }
  }

  const normalizedPlayers = players
    .map(normalizePlayer)
    .filter((p) => p && p.nickname)
    .sort((a, b) => a.nickname.localeCompare(b.nickname, "it", { sensitivity: "base" }));

  return {
    alliance: selectedAlliance
      ? {
          id: pickAllianceId(selectedAlliance),
          name: allianceName(selectedAlliance) || "Biss",
          raw: selectedAlliance
        }
      : { id: null, name: "Biss", raw: null },
    players: normalizedPlayers,
    meta: {
      allianceEndpoint: selectedAllianceEndpoint,
      playersEndpoint: selectedPlayersEndpoint,
      fetchedAt: new Date().toISOString()
    }
  };
}

module.exports = {
  fetchBissPlayers
};
