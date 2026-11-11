# FluxHeal (AuraFlow) — Comprehensive UI/UX Design & Architecture Specification

> **Document Type:** Production UI/UX System Specification & Frontend Design Blueprint (v1.0)  
> **Target Release:** Clean-Tech Hackathon 2026 MVP & Enterprise NOC/ESG Dashboard  
> **Frontend Architecture:** React 19 + TypeScript + Tailwind CSS + HTML5 Canvas / React Flow + Socket.io + Recharts  
> **Backend Alignment:** NestJS Modular Monolith + PostgreSQL 16 (TimescaleDB / JSONB)  

---

## 1. Executive Summary & Design Philosophy

### 1.1 The Product Context
Modern clean-tech infrastructure (smart solar grids, ag-tech IoT sensors, EV charging networks, and corporate ESG reporting) produces continuous, mission-critical streaming telemetry. Traditional ETL/ELT pipelines are brittle: a single renamed JSON key or an unexpected sensor reading (`-9999°C`) causes entire pipelines to crash, forcing costly manual backfills and generating millions of redundant server CPU cycles.

**FluxHeal (AuraFlow)** introduces an autonomous, zero-downtime self-healing pipeline. Defective records are quarantined within sub-milliseconds at the row level while healthy records flow uninterrupted. A hybrid Rule + AI Diagnostic Engine synthesizes real-time patches, commits fixes, and caches them for subsequent payloads in `<1ms`.

### 1.2 UX Objectives
1. **Instant Situational Awareness:** Provide clean-tech data engineers and hackathon judges immediate, zero-latency visibility into streaming data flow, quarantine isolation, and autonomous self-healing.
2. **60 FPS Animated Topology:** Bring backend infrastructure to life via a real-time visual canvas with particle streams displaying fast-path throughput versus micro-quarantine diversions.
3. **Visceral Demonstrability (Chaos Fault Injection):** Enable 1-click live anomaly injection to demonstrate automated healing and SQL AST self-patching in under 1.5 seconds.
4. **Quantified Green Compute ROI:** Elevate sustainability from a background metric to a primary visual asset via real-time avoided backfill computation and $g\text{CO}_2e$ ticker ribbons.
5. **Trust & Governance via Human-In-The-Loop (HITL):** Seamless visual diffing between raw broken inputs and healed outputs with confidence scoring and 1-click rule rollbacks.

### 1.3 Selected Design Style: Clean-Tech Dark Ops (Cyber-Minimalism)
- **Visual Aesthetic:** High-density telemetry interface featuring deep obsidian canvases, frosted glass container panels (glassmorphism with subtle `border-emerald-500/20`), luminous cybernetic accent glows, and crisp monospace telemetry readouts.
- **Cognitive Ergonomics:** Engineered for NOC (Network Operations Center) and DevOps mission-control rooms: low eye fatigue during prolonged monitoring, high functional contrast for alerts, and uncluttered information grouping.

---

## 2. Strict 4-Color Theme System

To deliver visual discipline, brand identity, and maximum contrast without color fatigue, the entire design system strictly adheres to **four primary colors**. All component surfaces, borders, states, and text hierarchies are mathematically derived from these four tokens using opacity layering.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        STRICT 4-COLOR PALETTE                          │
├─────────────────────┬─────────────────────┬────────────────────────────┤
│ Token Name          │ Hex Value           │ Core Semantic Function     │
├─────────────────────┼─────────────────────┼────────────────────────────┤
│ 1. Obsidian Night   │ #0B0F19             │ Deep Foundation & Base     │
│ 2. Slate Surface    │ #1E293B             │ Structure, Glass & Panels  │
│ 3. Emerald Flux     │ #10B981             │ Health, Fast-Path & Eco    │
│ 4. Cyan Intelligence│ #06B6D4             │ AI Healer, Stream & Logic  │
└─────────────────────┴─────────────────────┴────────────────────────────┘
```

### 2.1 Color Breakdown & Mathematical Layering

#### 1. Obsidian Night (`#0B0F19`) — Base Foundation
- **Role:** Deep canvas background, viewport roots, and low-contrast backdrops.
- **CSS Variable:** `--bg-obsidian: #0B0F19;`
- **Tailwind Extension:** `bg-obsidian: '#0B0F19'`
- **Derivations:**
  - `obsidian-pure`: `#0B0F19` (100% opacity)
  - `obsidian-alpha-90`: `rgba(11, 15, 25, 0.90)` (Backdrop blur modals & sticky headers)
  - `obsidian-alpha-50`: `rgba(11, 15, 25, 0.50)` (Terminal canvas overlay)

#### 2. Slate Surface (`#1E293B`) — Architecture & Structural Chrome
- **Role:** Card containers, drawer panels, modal dialogs, data table rows, splitters, and structural borders.
- **CSS Variable:** `--surface-slate: #1E293B;`
- **Tailwind Extension:** `slate-surface: '#1E293B'`
- **Derivations:**
  - `surface-elevated`: `#1E293B` (Cards and floating panels)
  - `surface-subtle`: `rgba(30, 41, 59, 0.40)` (Nested input fields and code blocks)
  - `surface-border`: `rgba(30, 41, 59, 0.80)` (Card outlines, table separators)
  - `surface-border-subtle`: `rgba(30, 41, 59, 0.35)` (Grid dividing lines)

#### 3. Emerald Flux (`#10B981`) — Clean-Tech Velocity & Health
- **Role:** Fast-path stream indicators, valid telemetry packets, healed state confirmations, avoided carbon counters, positive trend badges, and primary action buttons.
- **CSS Variable:** `--accent-emerald: #10B981;`
- **Tailwind Extension:** `emerald-flux: '#10B981'`
- **Derivations:**
  - `emerald-glow`: `0 0 16px rgba(16, 185, 129, 0.45)` (Active healthy node halo)
  - `emerald-subtle`: `rgba(16, 185, 129, 0.12)` (Pill badge backgrounds, diff additions)
  - `emerald-border`: `rgba(16, 185, 129, 0.30)` (Border highlight on healed elements)
  - `emerald-text`: `#10B981` (Metrics, values, green computing ledger totals)

#### 4. Cyan Intelligence (`#06B6D4`) — AI Engine, Signal & Telemetry
- **Role:** AI Diagnostic Engine status, active WebSocket streaming packets, interactive hover states, SQL AST repair markers, secondary controls, and active navigational tabs.
- **CSS Variable:** `--accent-cyan: #06B6D4;`
- **Tailwind Extension:** `cyan-intel: '#06B6D4'`
- **Derivations:**
  - `cyan-glow`: `0 0 16px rgba(6, 182, 212, 0.40)` (AI node pulsating beacon)
  - `cyan-subtle`: `rgba(6, 182, 212, 0.12)` (AI Diagnostic cards, code syntax accents)
  - `cyan-border`: `rgba(6, 182, 212, 0.35)` (Focused inputs, active tab indicators)
  - `cyan-text`: `#06B6D4` (Confidence score percentages, live latency timestamps)

### 2.2 Text & Readability Contrast Matrix
Typography utilizes light slate tint values derived directly from the Slate and Obsidian hues to guarantee WCAG AAA (≥ 7:1) contrast against Obsidian Night:
- **Primary Text:** `#F8FAFC` (Slate-50, 97% brightness) — Headers, key metric numbers, active states.
- **Secondary Text:** `#94A3B8` (Slate-400, 65% brightness) — Labels, descriptions, table column headers.
- **Muted Text:** `#64748B` (Slate-500, 45% brightness) — Timestamps, disabled controls, breadcrumbs.

---

## 3. Typography Architecture & Monospace Telemetry

### 3.1 Font Pairing System
```
┌──────────────────────────────┬──────────────────────────────────────────┐
│ Primary UI Font              │ Technical & Telemetry Font               │
├──────────────────────────────┼──────────────────────────────────────────┤
│ Inter                        │ JetBrains Mono                           │
│ - Geometric, neutral, modern │ - Ligature support (->, ==, !=, =>)      │
│ - Superior micro-legibility  │ - Tabular numbers for live data jitter   │
│ - Used for navigation, cards,│ - Used for JSON diffs, SQL AST, terminal │
│   metrics, buttons, dialogues│   logs, metrics units, and coordinates   │
└──────────────────────────────┴──────────────────────────────────────────┘
```

### 3.2 Modular Scale & Line-Heights
```css
/* Typography Scale (Tailwind Compatible) */
--text-hero:     2.25rem;  /* 36px | Line-Height: 40px | Weight: 700 (Header Metrics) */
--text-h1:       1.50rem;  /* 24px | Line-Height: 32px | Weight: 600 (Section Headings) */
--text-h2:       1.25rem;  /* 20px | Line-Height: 28px | Weight: 600 (Card Titles) */
--text-h3:       1.00rem;  /* 16px | Line-Height: 24px | Weight: 500 (Subheads, Modals) */
--text-body:     0.875rem; /* 14px | Line-Height: 20px | Weight: 400 (Standard Text) */
--text-small:    0.75rem;  /* 12px | Line-Height: 16px | Weight: 400/500 (Labels & Badges) */
--text-micro:    0.6875rem;/* 11px | Line-Height: 14px | Weight: 500 (Telemetry Tags) */
```

### 3.3 Tracking & Monospace Formatting Rules
1. **Numbers in Motion:** All real-time telemetry counters (rows/sec, latency ms, $g\text{CO}_2e$, confidence) MUST use `font-mono tracking-tight tabular-nums` to eliminate layout jitter during high-frequency WebSocket updates.
2. **Payload & Code Diffs:** Code diff blocks utilize `font-mono text-[12px] leading-[18px]` with syntax highlighting.
3. **Uppercase Micro-Headers:** Section categorizers and status badges use `uppercase tracking-widest text-[11px] font-semibold`.

---

## 4. Navigations & Global Shell Architecture

### 4.1 Global Shell Layout Structure
The application adopts an **Engineered Single-Pane-of-Glass Mission Control Shell** designed to eliminate full-page reloads and preserve real-time streaming state across all workflows.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ TOP BAR: Logo | Engine Status Ping | Live Carbon Ribbon | Autonomy Slider | Demo Audio │
├──────┬─────────────────────────────────────────────────────────────────────────────────┤
│ L    │ MAIN WORKSPACE VIEWPORT                                                         │
│ E    │ ┌─────────────────────────────────────────────────────────────────────────────┐ │
│ F    │ │ ROW 1: Real-Time Node Topology Canvas (60fps animated WebGL / Canvas)       │ │
│ T    │ └─────────────────────────────────────────────────────────────────────────────┘ │
│      │ ┌──────────────────────────────────────┬──────────────────────────────────────┐ │
│ N    │ │ ROW 2, COL 1: Live Diff Inspector    │ ROW 2, COL 2: Real-Time Event Ledger │ │
│ A    │ │ - Broken Raw JSON (Quarantine)       │ - Telemetry stream log               │ │
│ V    │ │ - Healed JSON / Patched SQL          │ - Avoided compute micro-transactions │ │
│      │ └──────────────────────────────────────┴──────────────────────────────────────┘ │
│ R    ├─────────────────────────────────────────────────────────────────────────────────┤
│ A    │ BOTTOM DOCK: Chaos Fault Injector & Manual Telemetry Stream Generator           │
│ I    │ [⚡ Schema Drift]  [🌡️ Outlier Spike]  [🔤 Dirty Units]  [💥 Break ELT SQL]     │
│ L    └─────────────────────────────────────────────────────────────────────────────────┘
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Top Bar: The Environmental & Operational Ribbon
- **Left Section:**
  - Brand lockup: `[ FluxHeal ]` icon badge with subtle Emerald neon pulse.
  - Connection indicator: Active WebSocket heartbeat pill (`CONNECTED: <1ms ping`).
  - Active Data Connector dropdown (e.g., `solar-grid-01`, `agri-moist-fleet`, `ev-chargers-west`).
- **Center Section (Clean-Tech Carbon Ribbon):**
  - **Avoided Backfill Rows:** Counter with incremental animation (`1,420,890 rows`).
  - **Saved Cloud Compute:** Display in CPU-Hours (`18.4 CPU-Hrs`).
  - **Prevented Emissions ($g\text{CO}_2e$):** Live ticker with leaf icon (`7,240.2 gCO2e avoided`).
- **Right Section:**
  - **Global Autonomy Mode Slider:**
    - `Aggressive (≥80% Auto)` | `Balanced (≥90% Auto)` | `Safe (Human-in-Loop)`
  - **Cluster Status Indicator:** `PostgreSQL: Healthy` | `LLM Diagnostic: Standby` | `Hot-Rule Cache: 24 active`

### 4.3 Left Navigation Rail (Collapsed Icon Rail + Expansion Drawer)
A 64px width rail on the left, expandable to 240px:
1. **Pipeline Topology (`icon: Network`):** Primary mission-control canvas and real-time packet stream.
2. **Quarantine DLQ (`icon: ShieldAlert`):** Isolated broken payloads awaiting AI diagnosis or HITL review.
3. **Healing Rules Registry (`icon: Cpu`):** In-memory and persisted hot-rule cache management with 1-click rollback.
4. **Green Compute Analytics (`icon: Leaf`):** Historical avoided CPU energy, carbon intensity curves, and ELT schedules.
5. **ELT Warehouse Staging (`icon: Database`):** Raw staging payloads and transactional PostgreSQL savepoints.
6. **Audit & Compliance (`icon: FileCheck`):** Cryptographic `_healed_meta` lineage inspector for ESG auditors.

---

## 5. Responsive Layouts & Container System

### 5.1 Breakpoint System
```css
/* Responsive Breakpoint Matrix */
--screen-sm: 640px;   /* Mobile Devices / Compact Viewports */
--screen-md: 768px;   /* Tablets & Small Horizontal Displays */
--screen-lg: 1024px;  /* Standard Laptops & Sub-monitors */
--screen-xl: 1280px;  /* Desktop Full HD Workstations (1080p) */
--screen-2xl:1536px;  /* 2K / WQHD High-Density Displays */
--screen-4k: 2560px;  /* 4K Multi-Stream NOC Wall Displays */
```

### 5.2 Layout Behaviors Across Form Factors

#### Desktop & 4K NOC Wall (> 1280px)
- **Top Bar:** Fixed at top, height 56px, multi-column carbon ribbon.
- **Topology Canvas:** High-visibility 420px height canvas with full particle physics and node connection animations.
- **Side-by-Side Diff:** 50/50 dual column view showing Raw Quarantined Payload (Left) and Synthesized Healed Output (Right) with simultaneous scroll synchronizer.
- **Chaos Dock:** Floating fixed bottom dock with immediate trigger shortcuts and speed sliders.

#### Laptop / Tablet (768px – 1279px)
- **Navigation:** Left rail collapses to 52px icon bar; drawer appears as glass overlay on click.
- **Topology Canvas:** Adaptive 300px height canvas; node labels compress to acronyms with tooltip expansions.
- **Diff Inspector:** Switches to segmented tab view (`Raw Payload (DLQ)` | `Healed Transformation` | `SQL AST Diff`).
- **Chaos Dock:** Anchored to bottom edge with horizontal overflow swipe.

#### Mobile Stream Monitor (< 768px)
- **Navigation:** Bottom app bar (`Topology`, `DLQ`, `Rules`, `Green ROI`).
- **Topology:** Simplified vertical 5-step stepper showing packet throughput rates and status icons.
- **Quarantine Alerts:** Push notifications as card sheets with swipe-to-approve HITL gestures.

### 5.3 Container System & Padding Rules
- **Viewport Outer Padding:** `p-4` (Desktop: `p-6`)
- **Card Containers:**
  - Background: `bg-[#1E293B]/70` with `backdrop-blur-md`
  - Border: `border border-[#1E293B]` with hover state `hover:border-[#06B6D4]/40`
  - Border Radius: `rounded-xl` (12px) for cards, `rounded-lg` (8px) for inner modules
  - Inner Padding: `p-4` or `p-5` with `space-y-4`

---

## 6. Design Patterns & Visual Language

### 6.1 Pattern 1: Interactive Node Topology Canvas (The 5-Stage Autonomous Loop)
The centerpiece of FluxHeal is a real-time graph rendering the 5-stage pipeline loop defined in the Master Architecture:

```
[ Ingestion & Validator ] ──(Fast Path 99.9%)───────────────────────────────► [ PostgreSQL Warehouse ]
           │                                                                             ▲
           ▼ (Anomalous 0.1%)                                                            │
 [ Smart Quarantine DLQ ] ──► [ AI Diagnostic Engine ] ──► [ Dual-Mode Healer ] ────────┘
                                                                 │
                                                                 ▼
                                                    [ Caches Rule in <1ms ]
```

#### Canvas Node Visual States:
1. **Node 1: Multi-Source Ingestion & Validator Gate**
   - Icon: `Radio` / `Layers`
   - Metric pill: `Throughput: 1,240 pkt/s` | `Validation: <0.5ms`
   - Particle Flow: Emits Cyan/Emerald particles along the fast path.
2. **Node 2: Zero-Downtime Micro-Quarantine (DLQ)**
   - Icon: `ShieldAlert`
   - Glow state: Amber/Cyan beacon flashes only when a defective record is isolated.
   - Metric pill: `Quarantined: 3 pkts (0.02%)`
3. **Node 3: Hybrid Diagnostic Engine**
   - Icon: `BrainCircuit`
   - Processing animation: Concentric rotating pulse in `#06B6D4` (Cyan Intelligence) during active LLM/Rule diagnosis.
   - Diagnosis Pill: `Mode: Tier-1 Deterministic` or `Tier-2 LLM Reasoning`
4. **Node 4: Dual-Mode Autonomous Healer**
   - Icon: `Wrench` / `Cpu`
   - Visual cue: Synthesizes live patch; flashes `#10B981` (Emerald Flux) upon successful healing.
   - Execution Pill: `ETL In-Memory Remap` or `ELT SQL Savepoint Patch`
5. **Node 5: Clean Telemetry Warehouse & Hot-Rule Cache**
   - Icon: `Database`
   - Storage metric: `Total Clean Rows: 2,450,120` | `Hot Cache: 24 active rules`

### 6.2 Pattern 2: Chaos Fault Injector Dock
A tactile simulation dock situated at the bottom of the viewport for real-time demonstrations and evaluation:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ ⚡ CHAOS FAULT INJECTION STUDIO                                [ Speed: 1x | 5x | 10x ]│
├───────────────────┬───────────────────┬───────────────────┬────────────────────────────┤
│ [⚡ Schema Drift] │ [🌡️ Sensor Spike] │ [🔤 Dirty Units]  │ [💥 Break ELT SQL]         │
│ active_power_kw   │ -9999°C Outlier   │ "64.8 kW" string  │ Division-by-Zero in Agg    │
└───────────────────┴───────────────────┴───────────────────┴────────────────────────────┘
```
- **Button Styling:** High-tactile micro-interactions with subtle gradient borders (`border-[#1E293B] hover:border-[#10B981] active:scale-95 transition-all`).
- **Trigger Feedback:** Immediate launch of an animated anomaly particle across the topology canvas into the Quarantine node with accompanying audio-visual pulse.

### 6.3 Pattern 3: Live Side-by-Side Diff & AST Inspector
When an anomaly is quarantined and diagnosed, the Live Diff Inspector renders the side-by-side transformation in real time:

- **Left Pane (Defective Raw Payload):**
  - Card Header: `QUARANTINE DLQ #Q-8492` with red/amber-tinted border tag `SCHEMA_DRIFT`.
  - Syntax highlighted JSON showing unrecognized key `active_power_kw: 48.5` in high contrast.
  - Contextual error log: `Missing required field: power_kw. Unrecognized field: active_power_kw`.
- **Center Divider:**
  - Animated transformation glyph `──►` with confidence badge: `Confidence: 98.4% (LLM + Levenshtein)`.
  - Execution speed tag: `Synthesized in 840ms | Cached for <1ms re-use`.
- **Right Pane (Healed Target Record):**
  - Card Header: `HEALED PAYLOAD (TARGET READY)` with `#10B981` border.
  - Injected clean field `power_kw: 48.5` with green background diff highlight.
  - Immutable lineage metadata block:
    ```json
    "_healed_meta": {
      "is_healed": true,
      "anomalies_fixed": ["SCHEMA_DRIFT"],
      "rule_id": "rule_9a8f2c",
      "confidence": 0.984,
      "compute_saved_ms": 1420
    }
    ```

### 6.4 Pattern 4: Confidence-Gated Human-in-the-Loop (HITL) Cards
- **Autonomy Rules:**
  - $\ge 90\%$ Confidence: Auto-deployed and cached without interrupting operators.
  - $60\% - 89\%$ Confidence: Triggers a non-modal HITL card in the top-right notification stack.
  - $< 60\%$ Confidence: Escalated to Manual Review Queue.
- **HITL Card Features:**
  - Compact summary of proposed mapping or regex fix.
  - Two high-contrast buttons: `[ 1-Click Approve & Cache ]` (Emerald) vs `[ Reject & Discard ]` (Slate).
  - Countdown timer for auto-quarantine timeout.

### 6.5 Pattern 5: Rules Registry & Governance Rollback Drawer
Addresses the enterprise requirement: *"What if the AI heals the data incorrectly?"*
- **Table Columns:** `Signature Hash`, `Anomaly Category`, `Transform Rule`, `Trigger Count`, `Confidence`, `Status`, `Actions`.
- **One-Click Revert Action:** Red-accented `[ Revert Rule ]` button that:
  1. Instantly evicts the rule from `HotRuleCacheService` in memory.
  2. Updates `healing_rules_registry` to `is_active = FALSE`.
  3. Reverts affected records in `clean_telemetry_warehouse` back to their `_healed_meta.raw_value`.

---

## 7. Real-Time WebSocket Event & State Transitions

The UI operates as a reactive event sink for the NestJS `WebSocketGateway('/stream')`:

```typescript
// Core UI Event Contract Mapping
interface WebSocketUIContract {
  'stream:packet': {
    id: string;
    status: 'FAST_PATH_OK';
    latencyMs: number;
    telemetry: CleanTelemetryRecord;
  };
  'anomaly:quarantined': {
    quarantineId: string;
    connectorId: string;
    anomalyType: 'SCHEMA_DRIFT' | 'SENSOR_OUTLIER' | 'TYPE_MISMATCH' | 'ELT_SQL_ERROR';
    rawPayload: Record<string, any>;
    errorMessage: string;
    timestamp: string;
  };
  'healer:diagnosed': {
    quarantineId: string;
    patchedPayload: Record<string, any>;
    ruleDef: {
      type: string;
      sourceField?: string;
      targetField?: string;
      imputedValue?: number;
      regexPattern?: string;
    };
    confidence: number;
    sqlPatch?: string;
  };
  'rule:cached': {
    ruleId: string;
    sourceSignature: string;
    anomalyCategory: string;
    confidence: number;
    timesTriggered: number;
  };
  'green:updated': {
    rowsAvoided: number;
    cpuHoursSaved: number;
    energyWhSaved: number;
    co2GramsSaved: number;
  };
}
```

### State Machine Lifecycle in UI:
1. `stream:packet` arrives $\rightarrow$ Increment fast-path counter, animate green particle to warehouse node.
2. `anomaly:quarantined` arrives $\rightarrow$ Spawn amber/red pulse on DLQ node, open entry in Live Diff Inspector (left pane).
3. `healer:diagnosed` arrives $\rightarrow$ Populate Live Diff Inspector (right pane), display confidence badge.
4. Auto-approval ($\ge 90\%$) $\rightarrow$ Animate healed particle to warehouse, increment carbon ledger counters.
5. `rule:cached` arrives $\rightarrow$ Increment Hot-Rule count pill, display `<1ms Cached` tag on subsequent incoming packets matching signature.

---

## 8. Frontend Engineering Architecture & Component Hierarchy

### 8.1 Directory Tree
```
frontend/
├── src/
│   ├── assets/              # SVG icons, audio soundbites for chaos triggers
│   ├── components/
│   │   ├── shell/           # TopBar, LeftRailNav, CarbonRibbon, StatusBadge
│   │   ├── topology/        # CanvasTopology, StageNode, ParticleEngine, StreamControls
│   │   ├── chaos/           # ChaosDock, FaultButton, PayloadGeneratorModal
│   │   ├── inspector/       # LiveDiffInspector, JsonViewer, SqlAstViewer, LineageCard
│   │   ├── governance/      # RulesTable, RollbackModal, HitlApprovalCard
│   │   └── metrics/         # GreenMetricsRibbon, CarbonSavingsChart, CpuSavingsGraph
│   ├── context/             # WebSocketContext, TelemetryStateContext, FilterContext
│   ├── hooks/               # useSocketStream, useCanvasRenderer, useAudioFeedback
│   ├── styles/              # tailwind.css, canvas-shaders.css
│   ├── types/               # telemetry.ts, rules.ts, chaos.ts, events.ts
│   ├── App.tsx              # Main Dashboard Assembler
│   └── main.tsx             # React Root & Socket Provider
```

### 8.2 Component Hierarchy & Prop Contracts
```
<AppShell>
  ├── <TopBar>
  │     ├── <BrandLogo />
  │     ├── <GreenMetricsRibbon avoidedRows={n} cpuHours={n} co2Grams={n} />
  │     ├── <AutonomySlider value={autonomyLevel} onChange={setAutonomy} />
  │     └── <ClusterHealthBadge socketPing={ms} dbStatus={status} />
  ├── <LeftNavRail activeTab={tab} onSelectTab={setTab} />
  ├── <MainContentArea>
  │     ├── <TopologyCanvasContainer>
  │     │     ├── <StageCanvas nodes={pipelineNodes} activeParticles={particles} />
  │     │     └── <StageMetricsOverlay throughput={currentThroughput} />
  │     ├── <InspectionGrid>
  │     │     ├── <LiveDiffInspector activeAnomaly={selectedQuarantine} />
  │     │     └── <EventStreamLedger liveLogs={eventLogs} />
  │     └── <ChaosDock onTriggerFault={handleInjectFault} isStreaming={isStreaming} />
  └── <HitlNotificationDrawer pendingApprovals={hitlQueue} onApprove={approve} onReject={reject} />
</AppShell>
```

---

## 9. Accessibility, Motion & Performance Standards

1. **High Refresh Rate Performance:** HTML5 Canvas particle rendering runs on a decoupled `requestAnimationFrame` loop maintaining 60 FPS even when processing 5,000+ packets/minute.
2. **Reduced Motion Mode:** Respects `prefers-reduced-motion: reduce`. When enabled, animated particle streams are replaced with static glow vectors and numerical throughput indicators.
3. **Contrast Compliance:** All text tokens meet or exceed WCAG 2.1 AA/AAA standards against `#0B0F19` and `#1E293B`.
4. **Keyboard Shortcuts:**
   - `1` / `2` / `3` / `4`: Trigger Chaos Faults (Schema Drift, Outlier, Dirty Unit, SQL Break)
   - `Space`: Pause/Resume live telemetry stream
   - `Esc`: Close inspection drawer / dismiss modal
   - `R`: Open Rules Registry & Rollback Drawer

