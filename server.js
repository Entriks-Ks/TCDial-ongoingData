import express from "express";
import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());

// ---------------- DB ----------------
const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT,
  waitForConnections: true,
  connectionLimit: 10,
});

// ---------------- HEALTH CHECK ----------------
app.get("/", (req, res) => {
  res.send("✅ TC-DIAL webhook server running");
});

// ---------------- WEBHOOK ----------------
app.post("/webhook/agent-set-disposition", async (req, res) => {
  try {
    const d = req.body;

    await db.execute(
      `
      INSERT INTO dispositions (
        id,
        lead_id,
        campaign_id,
        user_id,
        call_status_id,
        callTime,
        callDirection,
        hangupSide
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        call_status_id = VALUES(call_status_id),
        callTime = VALUES(callTime)
      `,
      [
        d.id,
        d.leadId ?? null,
        d.campaignId ?? null,
        d.userId ?? null,
        d.callStatusId ?? null,
        d.callTime ?? null,
        d.callDirection ?? null,
        d.hangupSide ?? null,
      ]
    );

    res.status(200).json({ success: true });
  } catch (err) {
    console.error("❌ Webhook error:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

// ---------------- START ----------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Webhook listening on port ${PORT}`);
});
