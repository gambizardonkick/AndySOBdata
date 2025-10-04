import express from "express";
import cors from "cors";

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = "TGAi37rWGCgsGBEkVpFmJ7mRhMBprIrG";

app.use(cors());

function maskUsername(username) {
  if (username.length <= 4) return username;
  return username.slice(0, 2) + "***" + username.slice(-2);
}

function getDynamicApiUrl() {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth(); // 0-based
  const start = new Date(Date.UTC(year, month, 1));
  const end = new Date(Date.UTC(year, month + 1, 0));
  const startStr = start.toISOString().slice(0, 10);
  const endStr = end.toISOString().slice(0, 10);
  return `https://services.rainbet.com/v1/external/affiliates?start_at=${startStr}&end_at=${endStr}&key=${API_KEY}`;
}

function getPrevMonthApiUrl() {
  const now = new Date();
  const prevMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const prevMonthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
  const startStr = prevMonth.toISOString().slice(0, 10);
  const endStr = prevMonthEnd.toISOString().slice(0, 10);
  return `https://services.rainbet.com/v1/external/affiliates?start_at=${startStr}&end_at=${endStr}&key=${API_KEY}`;
}

async function fetchLeaderboard(url) {
  const response = await fetch(url);
  const json = await response.json();
  if (!json.affiliates) throw new Error("No data");
  const sorted = json.affiliates.sort(
    (a, b) => parseFloat(b.wagered_amount) - parseFloat(a.wagered_amount)
  );
  const top10 = sorted.slice(0, 10);
  return top10.map(entry => ({
    username: maskUsername(entry.username),
    wagered: Math.round(parseFloat(entry.wagered_amount)),
    weightedWager: Math.round(parseFloat(entry.wagered_amount)),
  }));
}

app.get("/leaderboard/top14", async (req, res) => {
  try {
    const data = await fetchLeaderboard(getDynamicApiUrl());
    res.json(data);
  } catch (err) {
    console.error("[❌] Error:", err.message);
    res.status(500).json({ error: "Failed to fetch leaderboard data." });
  }
});

app.get("/leaderboard/prev", async (req, res) => {
  try {
    const data = await fetchLeaderboard(getPrevMonthApiUrl());
    res.json(data);
  } catch (err) {
    console.error("[❌] Error:", err.message);
    res.status(500).json({ error: "Failed to fetch previous leaderboard data." });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Running on port ${PORT}`);
});
