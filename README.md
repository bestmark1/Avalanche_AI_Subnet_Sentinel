# 🏔️ Avalanche Sentinel: AI-Powered Node Operator

Avalanche Sentinel is a lightweight, zero-dependency AI DevOps agent designed specifically for Avalanche node operators. It continuously monitors blockchain metrics, uses Anthropic's Claude LLM for deep root-cause analysis, and can autonomously execute self-healing shell commands to keep your validator online.

## ✨ Core Features

- **🧠 AI-Driven Diagnostics:** Replaces raw metric alerts with human-readable, actionable insights via Claude LLM. The AI understands network context, gas prices, and node state.
- **🔗 Chainlink Oracle Integration:** Makes native `eth_call` requests to Chainlink Mainnet contracts to fetch real-time AVAX/USD prices and detect "Network Partitions" (node staleness) without any heavy external SDKs.
- **📱 Persistent Telegram UI:** Manage your node via a beautifully integrated 2x2 persistent Reply Keyboard in Telegram (Status, Balance, AI Analysis, Restart Node).
- **🎙️ Voice ChatOps:** Hands busy? Send a voice message to the bot. Sentinel transcribes it instantly using the Deepgram API and executes your spoken commands.
- **🛠️ Auto-Healing (Closed-Loop):** Automatically executes custom, operator-defined bash scripts (e.g., Docker or Systemd restarts) when critical failures are detected.
- **🛡️ Secure & Ultra-Lightweight:** Built strictly with Node.js native `fetch`. Zero heavy bloated libraries (No Telegraf, No Ethers.js, No Chainlink SDK). 
- **✅ Enterprise Reliability:** 100% Test Coverage (165/165 passing tests) adhering strictly to SOLID principles and Dependency Injection.

## 🚀 Quick Start

### 1. Prerequisites
- Node.js v18+ (uses native `fetch`)
- Access to an Avalanche RPC endpoint (Mainnet recommended)
- API Keys: Telegram Bot Token, Anthropic (Claude), Deepgram (optional for voice)

### 2. Installation
```bash
git clone [https://github.com/your-username/avalanche-sentinel.git](https://github.com/your-username/avalanche-sentinel.git)
cd avalanche-sentinel
npm install
npm run build
```

### 3. Configuration
Copy the template and fill in your keys:
```bash
cp .env.example .env
```
Key environment variables to set:
```env
# Avalanche RPC (Mainnet)
SENTINEL_RPC_ENDPOINT="[https://api.avax.network/ext/bc/C/rpc](https://api.avax.network/ext/bc/C/rpc)"

# Wallet to monitor for gas fees (0.5 AVAX threshold)
WALLET_ADDRESS="0xYourWalletAddress..."

# Auto-Heal commands (e.g., for Docker or Systemctl)
AUTO_HEAL_COMMAND="docker restart avalanche-node"
```

### 4. Running the Agent
For local testing or foreground execution:
```bash
npm start
```
For 24/7 background production execution (recommended):
```bash
npm install -g pm2
pm2 start dist/index.js --name "avax-sentinel"
```

## 📱 Telegram Control Panel
Just send `/start` to the bot to attach the persistent 2x2 control panel:
- **[📊 Status]** — View current node metrics (CPU, Blocks, RPC health).
- **[💰 Balance]** — View C-Chain wallet balance and live Chainlink USD valuation.
- **[🤖 AI Analysis]** — Force an immediate AI health evaluation.
- **[🔄 Restart Node]** — Manually trigger your `AUTO_HEAL_COMMAND`.

## 🏗️ Architecture Note
This project is built defensively. The AI logic, Telegram listeners, and healing modules are strictly isolated. A failure in the Chainlink RPC call or a Telegram API timeout will simply "soft-fail" and never crash the core polling loop.
