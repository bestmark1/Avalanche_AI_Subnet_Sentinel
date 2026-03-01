# 🏔️ Avalanche Sentinel: AI-Powered Node Operator

Avalanche Sentinel is a lightweight, zero-dependency AI DevOps agent designed specifically for Avalanche node operators. It continuously monitors blockchain metrics, uses Anthropic's Claude LLM for deep root-cause analysis, and can autonomously execute self-healing shell commands to keep your validator online.

## ✨ Core Features

- **🧠 AI-Driven Diagnostics:** Replaces raw metric alerts with human-readable, actionable insights via Claude LLM.
- **🔗 Chainlink Oracle Integration:** Makes native `eth_call` requests to Chainlink Mainnet contracts to fetch real-time AVAX/USD prices.
- **📱 Persistent Telegram UI:** Manage your node via a beautifully integrated 2x2 persistent Reply Keyboard in Telegram.
- **🎙️ Voice ChatOps:** Send a voice message to the bot. Sentinel transcribes it instantly using the Deepgram API and executes your commands.
- **🛠️ Auto-Healing:** Automatically executes custom, operator-defined bash scripts when critical failures are detected.
- **🛡️ Secure & Ultra-Lightweight:** Built strictly with Node.js native `fetch`. Zero bloated libraries.

## 🔑 Configuration & API Keys

Before starting, you need to configure your environment and generate three API keys.

### 1. Telegram Bot Token (`TELEGRAM_BOT_TOKEN`)
1. Open Telegram and search for the official **[@BotFather](https://t.me/BotFather)**.
2. Send the command `/newbot` and follow the instructions to choose a name and username for your bot.
3. BotFather will give you a long HTTP API Token (e.g., `123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ`). Copy this token.

### 2. Anthropic Claude AI Key (`ANTHROPIC_API_KEY`)
*This is the brain of your bot, used for deep analysis.*
1. Go to the [Anthropic Console](https://console.anthropic.com/).
2. Sign up and navigate to the **Settings -> API Keys** section.
3. Click **Create Key**, name it "Avalanche Sentinel", and copy the key (starts with `sk-ant-api...`). 

### 3. Deepgram Voice API Key (`DEEPGRAM_API_KEY`)
*Used for instant Voice-to-Text translation in Telegram.*
1. Go to the [Deepgram Console](https://console.deepgram.com/).
2. Sign up (they provide a generous free tier).
3. Go to **API Keys**, generate a new key, and copy it.

### 4. Avalanche Wallet Address (`WALLET_ADDRESS`)
*The address the bot will monitor for low balances.*
Must be an Avalanche **C-Chain** (EVM) address starting with `0x...` (e.g., `0x1234567890abcdef1234567890abcdef12345678`). Do not use P-Chain or X-Chain addresses.

---

## 🚀 Local Quick Start (Mac/Windows)

1. Clone the repository:
```bash
git clone [https://github.com/your-username/Avalanche_AI_Subnet_Sentinel.git](https://github.com/your-username/Avalanche_AI_Subnet_Sentinel.git)
cd Avalanche_AI_Subnet_Sentinel
```

2. Install dependencies and configure environment:
```bash
npm install
cp .env.example .env
# Open .env and paste your API keys and Wallet Address as described above.
```

3. Run the agent in the foreground:
```bash
npm start
```

## 🌍 Deployment (Ubuntu VPS / 24-7 Background Mode)

To deploy the Sentinel on a fresh Ubuntu Linux server, follow these exact steps to ensure maximum uptime.

### 1. Prepare the Server & Clone
```bash
apt-get update
apt-get install -y git
git clone [https://github.com/your-username/Avalanche_AI_Subnet_Sentinel.git](https://github.com/your-username/Avalanche_AI_Subnet_Sentinel.git)
cd Avalanche_AI_Subnet_Sentinel
```

### 2. Configure Environment Variables
```bash
nano .env
```
*Paste your keys from your local `.env` file, save (`Ctrl+O`, `Enter`) and exit (`Ctrl+X`). Ensure you include your RPC endpoint: `SENTINEL_RPC_ENDPOINT="https://api.avax.network/ext/bc/C/rpc"`.*

### 3. Install Node.js (v20) & Build
```bash
curl -fsSL [https://deb.nodesource.com/setup_20.x](https://deb.nodesource.com/setup_20.x) | sudo -E bash -
sudo apt-get install -y nodejs
npm install
npm run build
```

### 4. Install PM2 & Start the Sentinel
We use PM2 to keep the bot running 24/7. **Note:** We must pass the `--env-file` argument so Node.js loads your `.env` correctly.
```bash
npm install -g pm2
pm2 start dist/index.js --name "sentinel" --node-args="--env-file=.env"
```

### 5. Setup Auto-Restart & Log Rotation
Ensure the bot starts when the server reboots, and prevent log files from filling up your disk space:
```bash
pm2 save
pm2 startup
pm2 install pm2-logrotate
```

## 📱 Telegram Control Panel
Send `/start` to the bot to attach the persistent 2x2 control panel:
- **[📊 Status]** — View current node metrics (CPU, Blocks, RPC health).
- **[💰 Balance]** — View C-Chain wallet balance and live Chainlink USD valuation.
- **[🤖 AI Analysis]** — Force an immediate AI health evaluation.
- **[🔄 Restart Node]** — Manually trigger your `AUTO_HEAL_COMMAND`.
