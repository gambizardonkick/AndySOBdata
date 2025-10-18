import express from "express";
import fetch from "node-fetch";

const app = express();
const PORT = process.env.PORT || 3000;
const SELF_URL = "https://andy-so-bdata.vercel.app/";
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

// Custom leaderboard period calculation: 9th to next 8th (UTC)
function leaderboardRangeUTC(referenceDate) {
  let year = referenceDate.getUTCFullYear();
  let month = referenceDate.getUTCMonth();

  // If before the 9th, select previous month as period start
  if (referenceDate.getUTCDate() < 9) {
    month = (month - 1 + 12) % 12;
    if (month === 11 && referenceDate.getUTCMonth() === 0) year--;
  }

  const start = new Date(Date.UTC(year, month, 9, 0, 0, 0)); // 9th 00:00:00
  const end = new Date(Date.UTC(year, month + 1, 8, 23, 59, 59)); // 8th 23:59:59
  return {
    startStr: start.toISOString().slice(0, 10),
    endStr: end.toISOString().slice(0, 10),
  };
}

function getDynamicApiUrl() {
  const now = new Date();
  const { startStr, endStr } = leaderboardRangeUTC(now);
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

  return top10.map((entry) => {
    const w = Math.max(0, Math.round(parseFloat(entry.wagered_amount || 0)));
    return {
      username: maskUsername(entry.username),
      wagered: w,
      weightedWager: w,
    };
  });
}

// Caches current leaderboard in memory
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

// Current leaderboard period (9th to next 8th)
app.get("/leaderboard/top14", (req, res) => {
  res.json(cachedData);
});

// Previous leaderboard period (prior 9th to 8th)
app.get("/leaderboard/prev", async (req, res) => {
  try {
    const now = new Date();
    // 1. Get start date of current period
    const { startStr } = leaderboardRangeUTC(now);
    const startDate = new Date(startStr + "T00:00:00Z");
    // 2. Reference date is 1 day before current period starts
    const refDate = new Date(startDate.getTime() - 24 * 60 * 60 * 1000);
    const { startStr: prevStart, endStr: prevEnd } = leaderboardRangeUTC(refDate);
    const url = `https://services.rainbet.com/v1/external/affiliates?start_at=${prevStart}&end_at=${prevEnd}&key=${API_KEY}`;

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
