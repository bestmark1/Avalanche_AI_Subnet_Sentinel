# Avalanche Sentinel — Dashboard Design
**Date:** 2026-03-01
**Status:** Approved
**Tool:** Pencil (in-chat design agent)

---

## Context

Avalanche Sentinel is a real-time blockchain node monitoring service for Avalanche C-Chain.
The dashboard is an MVP presentation for a competition — two screens, no history/alerts view.

## Style: Aurora Soft Dark

| Token | Value |
|---|---|
| Background (canvas) | `#0D1117` |
| Background (card) | `#0F1923` |
| Surface (card inner) | `#1A2332` |
| Border subtle | `#1E2D3D` |
| Border active | `#2D3F55` |
| Accent purple | `#9F7AEA` |
| Accent teal | `#38BDF8` |
| Accent mint | `#34D399` |
| Accent pink | `#F472B6` |
| Text primary | `#E8EDF5` |
| Text secondary | `#6B7A8D` |
| Status healthy | `#10B981` |
| Status degraded | `#F59E0B` |
| Status critical | `#EF4444` |

**Typography:** Inter (or nearest clean sans-serif), sizes 12/14/16/20/28px.

---

## Screen 1 — Overview (1440 × 900)

### Navigation bar (60px, full-width)
- Window dots (decorative) + **🔺 Avalanche Sentinel** bold white — left
- Tab bar center: `[ Overview ]` active (teal underline) · `[ AI Analysis ]` inactive
- "Last sync: 2s ago" secondary text — right

### Hero status (120px, centered)
- Large pulsing dot 24px (`#10B981`) + **"NETWORK HEALTHY"** 28px bold white
- Sub-line: "Tick #142 · 2026-03-01 12:34:01" secondary text

### Metrics row — 4 equal cards (180px height, 16px gap)
| Card | Value | Color |
|---|---|---|
| Block | `4,821,337` | Teal `#38BDF8` |
| Priority Fee | `25.40 gwei` | Purple `#9F7AEA` |
| AVAX/USD | `$38.72` + "Chainlink" pill | Mint / Pink |
| CPU Usage | `12.4%` + mini bar | Mint `#34D399` |

### Wallet featured card (80px, full-width)
- Aurora left-border 4px gradient purple→teal
- Left: 💰 **WALLET BALANCE** · `2.4000 AVAX  ~$92.93`
- Right: green badge **✅ ABOVE MIN — threshold: 0.5 AVAX**

### Source Health card (70px, full-width)
- Two inline items: **🔌 RPC** · pulsing green dot · "healthy" and **📡 Metrics** · pulsing green dot · "healthy"

### AI Summary card (60px, full-width)
- Aurora left-border 4px purple
- 🤖 AI **✅ HEALTHY** · confidence: high · urgency: 2/5

---

## Screen 2 — AI Analysis (1440 × 900)

Same navigation bar — "AI Analysis" tab active.

### Status header (100px, full-width)
- **✅ HEALTHY** large green glow badge
- Inline: 🟢 Confidence: high · ⚡ Urgency: 2/5

### Reason card (160px, full-width)
- Aurora left-border purple
- Label: 📋 REASON (small caps, secondary)
- Body: "Block production is stable. Priority fee is within historical norms. CPU usage is low. No threshold breaches detected in the current monitoring window."

### Recommendation card (140px, full-width)
- Aurora left-border teal
- Label: 💡 RECOMMENDATION (small caps, secondary)
- Body: "No immediate action required. Continue monitoring. Consider setting up automated alerts for fee spikes above 50 gwei."

### Triggered by (50px)
- 🔍 Triggered by: pill chips `maxPriorityFeePerGas` `cpuUsage` (bg `#1A2332`, border `#2D3F55`, text teal)

### Footer (40px)
- 🕐 Produced: 2026-03-01T12:33:55Z

---

## Design Decisions

| Decision | Rationale |
|---|---|
| 2 screens, not 3 | Third screen (alerts) would be empty during MVP demo — incomplete > absent |
| Hero status first | Judges get the answer ("is it OK?") in 1 second without reading |
| Wallet as featured card | Most operationally critical metric (0.5 AVAX threshold breach = node stops) |
| Remove token usage | Irrelevant to judges; damages perceived polish |
| Persistent tab bar | Enables self-navigation during demo without guidance |
| Aurora left-border accents | Visual differentiation of card types without adding complexity |
| Pulsing status dots | Communicates real-time monitoring at a glance |
