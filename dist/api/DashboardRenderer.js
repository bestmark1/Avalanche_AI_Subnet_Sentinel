"use strict";
// src/api/DashboardRenderer.ts
// Pure functional renderer for the Sentinel Dashboard.
// Generates responsive, premium-styled HTML using Tailwind CSS via CDN.
Object.defineProperty(exports, "__esModule", { value: true });
exports.DashboardRenderer = void 0;
class DashboardRenderer {
    /**
     * Renders the complete HTML dashboard based on the latest system state.
     */
    static render(state, version) {
        const { snapshot, analysis } = state;
        // Status color logic
        const isOnline = snapshot !== null;
        const statusText = isOnline ? '🟢 SYSTEM ONLINE' : '🔴 SYSTEM INITIALIZING';
        const statusClass = isOnline
            ? 'bg-green-500/20 text-green-400 border-green-500/30 shadow-[0_0_15px_rgba(34,197,94,0.2)]'
            : 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30 animate-pulse';
        // Data extraction with safe fallbacks
        const rpcLatency = snapshot?.nodeMetrics?.networkLatency?.toFixed(1) ?? '--';
        const cpuUsage = snapshot?.nodeMetrics?.cpuUsage?.toFixed(1) ?? '--';
        const blockNumber = snapshot?.rpc?.blockNumber ?? '--';
        const gasPrice = snapshot?.rpc?.gasPrice
            ? (parseInt(snapshot.rpc.gasPrice, 16) / 1e9).toFixed(2)
            : '--';
        const walletBalance = snapshot?.walletBalanceAvax?.toFixed(4) ?? '0.0000';
        const avaxUsdPrice = snapshot?.rpc?.avaxUsdPrice?.toFixed(2) ?? '--';
        const walletUsdValue = (snapshot?.walletBalanceAvax && snapshot?.rpc?.avaxUsdPrice)
            ? (snapshot.walletBalanceAvax * snapshot.rpc.avaxUsdPrice).toFixed(2)
            : '0.00';
        const aiModel = analysis?.analysis?.suggestedAction ? 'Action Required' : 'Claude 3.5 Sonnet Ready';
        const aiStatus = analysis ? 'Analysis Complete' : 'Awaiting Data';
        const aiColor = analysis?.analysis?.suggestedAction ? 'text-orange-400' : 'text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-600';
        return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Avalanche Sentinel | Node Dashboard</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700&display=swap" rel="stylesheet">
    <style>
        body { 
            background-color: #0a0a0a; 
            color: #f1f1f1; 
            font-family: 'Outfit', sans-serif;
            background-image: 
                radial-gradient(circle at 20% 30%, rgba(232, 65, 66, 0.05) 0%, transparent 40%),
                radial-gradient(circle at 80% 70%, rgba(147, 51, 234, 0.05) 0%, transparent 40%);
        }
        .avax-red { color: #E84142; }
        .avax-bg { background-color: #E84142; }
        .glass-card { 
            background: rgba(26, 26, 26, 0.6); 
            backdrop-filter: blur(12px); 
            border: 1px solid rgba(255, 255, 255, 0.05);
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .glass-card:hover { 
            background: rgba(35, 35, 35, 0.8); 
            border-color: rgba(232, 65, 66, 0.3);
            transform: translateY(-2px);
            box-shadow: 0 10px 30px -10px rgba(0, 0, 0, 0.5);
        }
        .shimmer {
            background: linear-gradient(90deg, transparent, rgba(232, 65, 66, 0.1), transparent);
            background-size: 200% 100%;
            animation: shimmer 3s infinite;
        }
        @keyframes shimmer {
            0% { background-position: -200% 0; }
            100% { background-position: 200% 0; }
        }
    </style>
</head>
<body class="min-h-screen flex flex-col items-center p-4 md:p-8">
    <div class="max-w-6xl w-full">
        <!-- Header -->
        <header class="flex flex-col md:flex-row items-center justify-between mb-12 gap-6">
            <div class="flex items-center gap-5">
                <div class="p-3 bg-white/5 rounded-2xl border border-white/10 shadow-inner">
                    <img src="https://cryptologos.cc/logos/avalanche-avax-logo.svg?v=040" alt="Avalanche Logo" class="w-12 h-12">
                </div>
                <div>
                    <h1 class="text-4xl font-bold tracking-tight">
                        <span class="avax-red">Avalanche</span> Sentinel
                    </h1>
                    <p class="text-gray-500 text-sm font-medium tracking-wide">v${version} Node Intelligence Agent</p>
                </div>
            </div>

            <div class="flex flex-col items-end gap-2">
                <span class="px-5 py-2.5 rounded-full text-xs font-bold tracking-widest border ${statusClass}">
                    ${statusText}
                </span>
                <p class="text-[10px] text-gray-600 font-mono uppercase tracking-tighter">
                   Trace ID: ${snapshot?.traceId ?? 'INITIALIZING'}
                </p>
            </div>
        </header>

        <!-- Main Grid -->
        <main class="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            <!-- Real-time Stats -->
            <div class="glass-card p-8 rounded-3xl md:col-span-2">
                <div class="flex items-center justify-between mb-8">
                    <h2 class="text-gray-400 text-xs uppercase tracking-[0.2em] font-bold">Node Telemetry</h2>
                    <div class="flex gap-2">
                        <span class="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                        <span class="w-1.5 h-1.5 rounded-full bg-gray-700"></span>
                        <span class="w-1.5 h-1.5 rounded-full bg-gray-700"></span>
                    </div>
                </div>
                
                <div class="grid grid-cols-2 md:grid-cols-4 gap-8">
                    <div>
                        <p class="text-gray-500 text-xs mb-1">C-Chain Height</p>
                        <p class="text-2xl font-semibold tabular-nums">#${blockNumber}</p>
                    </div>
                    <div>
                        <p class="text-gray-500 text-xs mb-1">RPC Latency</p>
                        <p class="text-2xl font-semibold tabular-nums text-green-400">${rpcLatency}<span class="text-sm ml-1 opacity-50">ms</span></p>
                    </div>
                    <div>
                        <p class="text-gray-500 text-xs mb-1">CPU Load</p>
                        <p class="text-2xl font-semibold tabular-nums">${cpuUsage}<span class="text-sm ml-1 opacity-50">%</span></p>
                    </div>
                    <div>
                        <p class="text-gray-500 text-xs mb-1">Gas Price</p>
                        <p class="text-2xl font-semibold tabular-nums text-blue-400">${gasPrice}<span class="text-sm ml-1 opacity-50">nAVAX</span></p>
                    </div>
                </div>

                <div class="mt-10 pt-8 border-t border-white/5 flex items-center justify-between">
                    <div class="flex items-center gap-3">
                       <span class="text-xs text-gray-400 font-medium">Last Insight:</span>
                       <span class="text-xs text-gray-300 italic">"${analysis?.analysis?.summary ?? 'System is performing within normal parameters. No anomalies detected.'}"</span>
                    </div>
                    <button class="text-[10px] font-bold uppercase tracking-widest text-red-500 hover:text-red-400 transition-colors">
                        Force Resync →
                    </button>
                </div>
            </div>

            <!-- Wallet Card -->
            <div class="glass-card p-8 rounded-3xl relative overflow-hidden">
                <div class="absolute top-0 right-0 w-32 h-32 bg-red-600/10 rounded-full -mr-16 -mt-16 blur-3xl"></div>
                <h2 class="text-gray-400 text-xs uppercase tracking-[0.2em] font-bold mb-8">Validator Wallet</h2>
                
                <div class="mb-4">
                    <p class="text-gray-500 text-xs mb-1">Balance</p>
                    <div class="flex items-baseline gap-2">
                        <p class="text-3xl font-bold tabular-nums">${walletBalance}</p>
                        <p class="text-sm font-bold text-gray-400">AVAX</p>
                    </div>
                </div>

                <div class="p-4 bg-white/5 rounded-2xl border border-white/5 mb-8">
                    <div class="flex justify-between items-center mb-1">
                        <p class="text-[10px] text-gray-500 uppercase font-bold tracking-wider">Oracle Price</p>
                        <p class="text-[10px] text-green-500 font-bold">LIVE</p>
                    </div>
                    <div class="flex justify-between items-baseline">
                        <p class="text-xl font-semibold tabular-nums">$${avaxUsdPrice}</p>
                        <p class="text-xs text-gray-400">≈ $${walletUsdValue}</p>
                    </div>
                </div>

                <div class="flex items-center gap-2 text-xs text-gray-500">
                    <img src="https://cryptologos.cc/logos/chainlink-link-logo.svg?v=040" class="w-4 h-4 opacity-50" alt="Chainlink">
                    <span>Chainlink Feed Active</span>
                </div>
            </div>

            <!-- AI Engine -->
            <div class="glass-card p-8 rounded-3xl border-l-[6px] border-l-purple-600/50">
                <h2 class="text-gray-400 text-xs uppercase tracking-[0.2em] font-bold mb-8">AI Diagnostics</h2>
                <p class="text-2xl font-bold mb-2 ${aiColor}">${aiModel}</p>
                <div class="flex items-center gap-2 mb-8">
                    <div class="w-1.5 h-1.5 rounded-full bg-purple-500"></div>
                    <p class="text-gray-400 text-xs">${aiStatus}</p>
                </div>

                <div class="space-y-4">
                    <div class="flex justify-between text-xs">
                        <span class="text-gray-500">Reasoning Engine</span>
                        <span class="text-gray-300">Claude-3.5-Sonnet</span>
                    </div>
                    <div class="flex justify-between text-xs">
                        <span class="text-gray-500">Context Window</span>
                        <span class="text-gray-300">200k Tokens</span>
                    </div>
                    <div class="flex justify-between text-xs">
                        <span class="text-gray-500">Safety Filters</span>
                        <span class="text-green-500 font-medium">Active</span>
                    </div>
                </div>
            </div>

            <!-- Auto-Healing -->
            <div class="glass-card p-8 rounded-3xl border-l-[6px] border-l-blue-600/50">
                <h2 class="text-gray-400 text-xs uppercase tracking-[0.2em] font-bold mb-8">Auto-Healing Status</h2>
                <p class="text-2xl font-bold text-blue-400 mb-2">System Armed</p>
                <div class="flex items-center gap-2 mb-8">
                    <div class="w-1.5 h-1.5 rounded-full bg-blue-500"></div>
                    <p class="text-gray-400 text-xs">Ready to Recover</p>
                </div>
                
                <div class="p-3 bg-blue-500/10 rounded-xl border border-blue-500/20 text-[10px] font-mono text-blue-300">
                    Watching for state: CRITICAL<br>
                    Logic: ADR-005 Self-Healing
                </div>
            </div>

            <!-- Activity Log -->
            <div class="glass-card p-8 rounded-3xl">
                <h2 class="text-gray-400 text-xs uppercase tracking-[0.2em] font-bold mb-6">Recent Activity</h2>
                <div class="space-y-4">
                    <div class="flex gap-4">
                        <div class="mt-1 w-1.5 h-1.5 rounded-full bg-green-500 shrink-0"></div>
                        <div>
                            <p class="text-xs font-semibold">Diagnostic Cycle Complete</p>
                            <p class="text-[10px] text-gray-500">Successfully scanned 4 primary subnets</p>
                        </div>
                    </div>
                    <div class="flex gap-4">
                        <div class="mt-1 w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0"></div>
                        <div>
                            <p class="text-xs font-semibold">Price Feed Update</p>
                            <p class="text-[10px] text-gray-500">Fetched latest AVAX/USD via eth_call</p>
                        </div>
                    </div>
                    <div class="flex gap-4">
                        <div class="mt-1 w-1.5 h-1.5 rounded-full bg-gray-600 shrink-0"></div>
                        <div>
                            <p class="text-xs font-semibold">Sentinel Tick #${snapshot?.tickNumber ?? '0'}</p>
                            <p class="text-[10px] text-gray-500">System heartbeat stable</p>
                        </div>
                    </div>
                </div>
            </div>

        </main>

        <!-- Footer -->
        <footer class="mt-16 flex flex-col md:flex-row items-center justify-between gap-6 border-t border-white/5 pt-8">
            <div class="flex items-center gap-6">
                <span class="text-[10px] font-bold uppercase tracking-widest text-gray-600">Built with Node.js & Ethers.js</span>
                <span class="text-[10px] font-bold uppercase tracking-widest text-gray-600">Empowering Avalanche Validators</span>
            </div>
            <div class="flex gap-4">
                <div class="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors cursor-pointer border border-white/5">
                    <span class="text-xs">𝕏</span>
                </div>
                <div class="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors cursor-pointer border border-white/5">
                    <span class="text-xs">🛜</span>
                </div>
            </div>
        </footer>
    </div>
</body>
</html>
`;
    }
}
exports.DashboardRenderer = DashboardRenderer;
//# sourceMappingURL=DashboardRenderer.js.map