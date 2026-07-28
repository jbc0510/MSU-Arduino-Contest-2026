require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { Vonage } = require("@vonage/server-sdk");

const app = express();
app.use(cors());
app.use(express.json());

// Optional debug print to verify keys load on startup:
console.log("Loaded Vonage Key:", process.env.VONAGE_API_KEY ? "Yes" : "No");

const vonage = new Vonage({
  apiKey: process.env.VONAGE_API_KEY,
  apiSecret: process.env.VONAGE_API_SECRET,
});

// Test route
app.get("/test-sms", async (req, res) => {
  try {
    const result = await vonage.sms.send({
      to: "18573121441",
      from: process.env.VONAGE_PHONE_NUMBER,
      text: "SafeSeat test message! Vonage is working.",
    });

    console.log("Full result:", JSON.stringify(result, null, 2));

    const msg = result.messages[0];
    if (msg.status === "0") {
      res.json({ success: true, messageId: msg["message-id"] });
    } else {
      res.status(500).json({
        success: false,
        status: msg.status,
        error: msg["error-text"],  // <-- this will tell us exactly what's wrong
      });
    }
  } catch (err) {
  console.error("Message detail:", JSON.stringify(err.response?.messages, null, 2));
  res.status(500).json({ success: false, message: err.message });
}
});

// Send SMS
app.post("/send-alert", async (req, res) => {
  const { phoneNumber, message } = req.body;

  // Vonage expects no + prefix
  const to = phoneNumber.replace(/^\+/, "");

  try {
    const result = await Promise.race([
      vonage.sms.send({
        to,
        from: process.env.VONAGE_PHONE_NUMBER,//"SafeSeat", 
        text: message,
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Vonage request timed out")), 8000)
      ),
    ]);

    const msg = result.messages[0];
    if (msg.status === "0") {
      console.log("Message sent:", msg["message-id"]);
      res.json({ success: true, messageId: msg["message-id"] });
    } else {
      res.status(500).json({ success: false, error: msg["error-text"] });
    }
  } catch (err) {
    console.error("Vonage Error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

const PORT = process.env.PORT || 5000;

// Add this at the VERY BOTTOM of your server file (before app.listen)
app.use((err, req, res, next) => {
  console.error("Express Error:", err);
  res.status(500).json({ success: false, error: err.message || "Internal Server Error" });
});

app.use((req, res) => {
  res.status(404).json({ success: false, error: `Route ${req.method} ${req.url} Not Found` });
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));