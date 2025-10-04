import express from "express";
import fetch from "node-fetch";

const app = express();
const PORT = process.env.PORT || 3000;
const SELF_URL = "/";
const API_KEY = "TGAi37rWGCgsGBEkVpFmJ7mRhMBprIrG";

let cachedData = [];

// ✅ CORS headers
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  next();
});

function maskUsername(username) {
  if (!username) return "";
  if (username.length <= 4) return username;
  return username.slice(0, 2) + "***" + username.slice(-2);
}

function monthRangeUTC(year, month0) {
  // month0 is 0-indexed
  const start = new Date(Date.UTC(year, month0, 1));      // 1st
  const end = new Date(Date.UTC(year, month0 + 1, 0));    // last day
  return {
    startStr: start.toISOString().slice(0, 10),
    endStr: end.toISOString().slice(0, 10),
  };
}

function getDynamicApiUrl() {
  const now = new Date();
  const { startStr, endStr } = monthRangeUTC(now.getUTCFullYear(), now.getUTCMonth());
  return `https://services.rainbet.com/v1/external/affiliates?start_at=${startStr}&end_at=${endStr}&key=${API_KEY}`;
}

async function fetchAndProcess(url) {
  const response = await fetch(url);
  const json = await response.json();
  if (!json?.affiliates) throw new Error("No data");

  const sorted = json.affiliates.sort(
    (a, b) => parseFloat(b.wagered_amount || 0) - parseFloat(a.wagered_amount || 0)
  );

  const top10 = sorted.slice(0, 10);

  // optional swap top 2 (preserving your earlier behavior)
  if (top10.length >= 2) [top10[0], top10[1]] = [top10[1], top10[0]];

  return top10.map((entry) => {
    const w = Math.max(0, Math.round(parseFloat(entry.wagered_amount || 0)));
    return {
      username: maskUsername(entry.username),
      wagered: w,
      weightedWager: w,
    };
  });
}

async function fetchAndCacheData() {
  try {
    const url = getDynamicApiUrl();
    cachedData = await fetchAndProcess(url);
    console.log(`[✅] Leaderboard updated (${cachedData.length} entries)`);
  } catch (err) {
    console.error("[❌] Failed to fetch current leaderboard:", err.message);
  }
}

// --- Routes ---

// Current month (1st → last day)
app.get("/leaderboard/top14", (req, res) => {
  res.json(cachedData);
});

// Previous month (1st → last day)
app.get("/leaderboard/prev", async (req, res) => {
  try {
    const now = new Date();
    const prevYear = now.getUTCMonth() === 0 ? now.getUTCFullYear() - 1 : now.getUTCFullYear();
    const prevMonth0 = (now.getUTCMonth() + 11) % 12; // wrap Jan->Dec

    const { startStr, endStr } = monthRangeUTC(prevYear, prevMonth0);
    const url = `https://services.rainbet.com/v1/external/affiliates?start_at=${startStr}&end_at=${endStr}&key=${API_KEY}`;

    const processed = await fetchAndProcess(url);
    res.json(processed);
  } catch (err) {
    console.error("[❌] Failed to fetch previous leaderboard:", err.message);
    res.status(500).json({ error: "Failed to fetch previous leaderboard data." });
  }
});

// --- Keep-alive ping (Render) ---
setInterval(() => {
  fetch(SELF_URL)
    .then(() => console.log(`[🔁] Self-pinged ${SELF_URL}`))
    .catch((err) => console.error("[⚠️] Self-ping failed:", err.message));
}, 270000); // 4.5 minutes

// --- Boot ---
fetchAndCacheData();
setInterval(fetchAndCacheData, 5 * 60 * 1000); // refresh every 5 minutes

app.listen(PORT, () => console.log(`🚀 Running on port ${PORT}`));
