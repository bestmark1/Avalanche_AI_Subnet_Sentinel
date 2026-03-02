# 🏔 Avalanche AI Subnet Sentinel

**Enterprise-grade AI monitoring, Auto-Healing, and Voice-Controlled management for Avalanche C-Chain and Subnet Validators.**

## 🚨 The Problem
Validators and institutional investors in the Avalanche ecosystem often learn about critical node failures, memory leaks, or RPC desyncs *after* they happen, leading to potential slashing penalties and missed rewards. 

## 💡 Our Solution
**Avalanche Sentinel** is a proactive AI assistant powered by Claude 3.5. It doesn't just scan logs; it understands them. Combined with Chainlink oracles, Deepgram voice recognition, and an Auto-Healing module, Sentinel provides institutional-grade security and automated recovery directly via Telegram and an Enterprise web dashboard.

## ✨ Key Features
* **🧠 AI-Powered Diagnostics (Claude 3.5):** Real-time analysis of node logs to predict and explain anomalies in plain human language.
* **🛠 Auto-Healing System:** If the AI detects a critical failure, Sentinel can automatically execute recovery scripts to restart nodes without human intervention.
* **🔗 Chainlink Oracle Integration:** Guarantees absolute accuracy and security for C-Chain Gas metrics and pricing data.
* **🐋 Whale Wallet Monitor:** Real-time tracking of massive institutional balances (e.g., Binance Hot Wallets) on the Mainnet to prevent treasury depletion.
* **🎙 Voice Control (Deepgram):** Manage your node hands-free. Send a voice message like *"Check node status"* in Telegram, and Sentinel will transcribe and execute it instantly.
* **📊 Enterprise Web Dashboard:** A sleek, real-time UI displaying C-Chain health, AI status, and smart contract metrics.

## 🛠 Tech Stack
* **Blockchain:** Avalanche C-Chain, Chainlink Oracles
* **AI & Voice:** Anthropic Claude 3.5, Deepgram
* **Backend:** Node.js, TypeScript, Express, PM2
* **Interface:** Telegram Bot API, Tailwind CSS Dashboard

## 🚀 Quick Start
\`\`\`bash
git clone https://github.com/your-repo/Avalanche_AI_Subnet_Sentinel.git
cd Avalanche_AI_Subnet_Sentinel
npm install
npm run build
pm2 start dist/index.js --name sentinel --node-args="--env-file=.env"
\`\`\`
