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

app.post("/webhook/agent-set-disposition", async (req, res) => {
  const connection = await db.getConnection();

  try {
    console.log("📩 Incoming webhook:", JSON.stringify(req.body, null, 2));
    const d = req.body;

    // Minimal validation
    if (!d.leadId || !d.callStatusId) {
      return res.status(200).json({
        success: true,
        message: "Webhook received, missing required fields"
      });
    }

    await connection.beginTransaction();

    // ---------------- 1️⃣ ENSURE LEAD EXISTS ----------------
    await connection.execute(
      `
      INSERT IGNORE INTO leads (id, listId)
      VALUES (?, ?)
      `,
      [d.leadId, null]
    );

    // ---------------- 2️⃣ ENSURE CAMPAIGN EXISTS ----------------
    if (d.campaignId) {
      await connection.execute(
        `
        INSERT IGNORE INTO campaigns (id, name, isActive)
        VALUES (?, 'Unknown campaign', 1)
        `,
        [d.campaignId]
      );
    }

    // ---------------- 3️⃣ ENSURE USER EXISTS ----------------
    if (d.agentId) {
      await connection.execute(
        `
        INSERT IGNORE INTO users (id, firstName, lastName)
        VALUES (?, 'Unknown', 'Agent')
        `,
        [d.agentId]
      );
    }

    // ---------------- 4️⃣ ENSURE CALL STATUS EXISTS ----------------
    await connection.execute(
      `
      INSERT IGNORE INTO callStatus (id, name, \`group\`)
      VALUES (?, 'Unknown', 'Unknown')
      `,
      [d.callStatusId]
    );

    // ---------------- 5️⃣ INSERT DISPOSITION ----------------
    await connection.execute(
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
        callTime = VALUES(callTime),
        callDirection = VALUES(callDirection),
        hangupSide = VALUES(hangupSide)
      `,
      [
        d.id,
        d.leadId,
        d.campaignId ?? null,
        d.agentId ?? null,
        d.callStatusId,
        d.callTime ?? 0,
        d.callDirection ?? null,
        d.hangupSide ?? null
      ]
    );

    await connection.commit();
    res.status(200).json({ success: true });

  } catch (err) {
    await connection.rollback();
    console.error("❌ Webhook error:", err);
    res.status(500).json({ error: "Internal error" });
  } finally {
    connection.release();
  }
});

// ---------------- START ----------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Webhook listening on port ${PORT}`);
});
