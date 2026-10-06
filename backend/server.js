require("dotenv").config();

const express = require("express");
const crypto = require("crypto");
const Database = require("better-sqlite3");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const db = new Database(path.join(__dirname, "parts.db"));

db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS parts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  model TEXT NOT NULL,
  item TEXT NOT NULL,
  part_number TEXT NOT NULL,
  note TEXT DEFAULT '',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
`);

const count = db.prepare("SELECT COUNT(*) AS c FROM parts").get().c;
if (count === 0) {
  const seed = db.prepare(
    "INSERT INTO parts (model,item,part_number,note) VALUES (?,?,?,?)"
  );
  const insertMany = db.transaction(() => {
    seed.run("A01", "主板", "PN-001234", "標準版");
    seed.run("A01", "螺絲", "PN-005678", "M3×8");
    seed.run("X500", "電源模組", "PN-009999", "24V");
  });
  insertMany();
}

app.use(express.static(path.join(__dirname, "..", "frontend")));

function searchParts(keyword = "", model = "", item = "") {
  const k = `%${String(keyword).trim()}%`;
  const m = `%${String(model).trim()}%`;
  const i = `%${String(item).trim()}%`;

  return db.prepare(`
    SELECT * FROM parts
    WHERE (model LIKE ? OR item LIKE ? OR part_number LIKE ? OR note LIKE ?)
      AND model LIKE ?
      AND item LIKE ?
    ORDER BY model, item, part_number
  `).all(k, k, k, k, m, i);
}

function lineSignatureValid(rawBody, signature) {
  if (!process.env.LINE_CHANNEL_SECRET || !signature) return false;
  const hash = crypto
    .createHmac("SHA256", process.env.LINE_CHANNEL_SECRET)
    .update(rawBody)
    .digest("base64");
  return crypto.timingSafeEqual(
    Buffer.from(hash),
    Buffer.from(signature)
  );
}

function findForLine(text) {
  const keyword = text.trim();
  if (!keyword) return [];

  // 優先完整料號 / 精準查詢
  let rows = db.prepare(`
    SELECT * FROM parts
    WHERE part_number = ? OR model = ? OR item = ?
    ORDER BY model, item, part_number
  `).all(keyword, keyword, keyword);

  if (rows.length) return rows;

  // 再做模糊搜尋
  return searchParts(keyword);
}

function formatLineReply(text) {
  const t = text.trim();

  if (["幫助", "help", "HELP", "?"].includes(t)) {
    return [
      "📦 MDD料號查詢",
      "",
      "直接輸入以下任一項即可查詢：",
      "• 料號：PN-001234",
      "• 機型：A01",
      "• 項目：主板",
      "• 關鍵字：電源",
      "",
      "例如：",
      "A01 主板",
      "或 PN-001234"
    ].join("\n");
  }

  const rows = findForLine(t);

  if (!rows.length) {
    return `🔎 查不到「${t}」\n\n請換一個機型、項目、料號或關鍵字搜尋。\n輸入「幫助」查看使用方法。`;
  }

  const max = 8;
  const shown = rows.slice(0, max);
  let msg = `🔎 查詢「${t}」\n找到 ${rows.length} 筆\n\n`;

  shown.forEach((r, idx) => {
    msg += `${idx + 1}. 機型：${r.model}\n`;
    msg += `   項目：${r.item}\n`;
    msg += `   料號：${r.part_number}\n`;
    if (r.note) msg += `   備註：${r.note}\n`;
    msg += "\n";
  });

  if (rows.length > max) {
    msg += `另有 ${rows.length - max} 筆，請縮小搜尋條件。`;
  }

  return msg.trim();
}

async function replyToLine(replyToken, text) {
  if (!process.env.LINE_CHANNEL_ACCESS_TOKEN) {
    throw new Error("LINE_CHANNEL_ACCESS_TOKEN 尚未設定");
  }

  const response = await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`
    },
    body: JSON.stringify({
      replyToken,
      messages: [{ type: "text", text: text.slice(0, 5000) }]
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`LINE API ${response.status}: ${body}`);
  }
}

/*
  LINE Webhook:
  必須先取得原始 request body 驗證簽章，
  再解析 JSON。
*/
app.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const signature = req.get("x-line-signature");

    if (!lineSignatureValid(req.body, signature)) {
      return res.status(401).send("Invalid signature");
    }

    res.sendStatus(200);

    try {
      const payload = JSON.parse(req.body.toString("utf8"));

      for (const event of payload.events || []) {
        if (event.type !== "message" || event.message?.type !== "text") {
          continue;
        }

        const reply = formatLineReply(event.message.text);
        await replyToLine(event.replyToken, reply);
      }
    } catch (err) {
      console.error("Webhook error:", err);
    }
  }
);

app.use(express.json());

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "MDD 料號管理系統 V3",
    time: new Date().toISOString()
  });
});

app.get("/api/parts", (req, res) => {
  try {
    const rows = searchParts(
      req.query.q || "",
      req.query.model || "",
      req.query.item || ""
    );
    res.json({ ok: true, data: rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post("/api/parts", (req, res) => {
  try {
    const { model, item, part_number, note = "" } = req.body;

    if (!model || !item || !part_number) {
      return res.status(400).json({
        ok: false,
        error: "機型、項目、料號為必填"
      });
    }

    const result = db.prepare(`
      INSERT INTO parts (model,item,part_number,note,updated_at)
      VALUES (?,?,?,?,CURRENT_TIMESTAMP)
    `).run(model.trim(), item.trim(), part_number.trim(), note.trim());

    res.json({
      ok: true,
      id: result.lastInsertRowid
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.put("/api/parts/:id", (req, res) => {
  try {
    const { model, item, part_number, note = "" } = req.body;

    if (!model || !item || !part_number) {
      return res.status(400).json({
        ok: false,
        error: "機型、項目、料號為必填"
      });
    }

    const result = db.prepare(`
      UPDATE parts
      SET model=?, item=?, part_number=?, note=?, updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).run(
      model.trim(),
      item.trim(),
      part_number.trim(),
      note.trim(),
      req.params.id
    );

    res.json({ ok: true, changed: result.changes });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.delete("/api/parts/:id", (req, res) => {
  try {
    const result = db.prepare("DELETE FROM parts WHERE id=?").run(req.params.id);
    res.json({ ok: true, deleted: result.changes });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "frontend", "index.html"));
});

app.listen(PORT, () => {
  console.log(`MDD 料號管理系統 V3 running on port ${PORT}`);
});
