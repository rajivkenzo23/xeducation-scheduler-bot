const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const input = require("input");

const apiId = 35481411;
const apiHash = "5db076b70a26a9e703fcd7c27ea8fc58";
const stringSession = new StringSession("");

(async () => {
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║   SESSION 2 — Post Bot (X-Education Scheduler Bot)           ║");
  console.log("║   Login with Account #2 (a DIFFERENT helper Telegram account)║");
  console.log("║   This session goes into: Post Bot .env -> TELEGRAM_SESSION  ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  const client = new TelegramClient(stringSession, apiId, apiHash, {
    connectionRetries: 5,
  });

  await client.start({
    phoneNumber: async () => await input.text("Phone number (+countrycode): "),
    password: async () => await input.text("2FA password (press Enter if none): "),
    phoneCode: async () => await input.text("OTP code from Telegram: "),
    onError: (err) => console.log(err),
  });

  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║  ✅ SESSION 2 GENERATED — POST BOT (Scheduler Bot)           ║");
  console.log("║  Copy the string below into Post Bot launcher.js:            ║");
  console.log("║  TELEGRAM_SESSION = '<paste here>'                           ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log("\n" + client.session.save() + "\n");

  await client.destroy();
  process.exit(0);
})();
