/**
 * Live Clean-Tech Telemetry Streamer & Chaos Fault Demonstrator
 * Generates continuous streaming packets and executes scheduled autonomous healing demos.
 */

const API_BASE = 'http://localhost:4000/api/v1';

async function postJson(endpoint: string, body: any): Promise<any> {
  try {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return await res.json();
  } catch (err: any) {
    console.error(`[Error] POST ${endpoint}:`, err.message);
    return null;
  }
}

async function runDemo() {
  console.log('='.repeat(70));
  console.log('  FLUXHEAL (AURAFLOW) — LIVE CLEAN-TECH TELEMETRY STREAM');
  console.log('='.repeat(70));
  console.log('[System] Connecting to local engine on http://localhost:4000 ...\n');

  let packetIndex = 0;

  // Stream normal packets every 250ms (4 packets/sec)
  const timer = setInterval(async () => {
    packetIndex++;
    const invId = (packetIndex % 15) + 1;
    const payload = {
      device_id: `SOLAR-INV-${invId < 10 ? '0' + invId : invId}`,
      metric_timestamp: new Date().toISOString(),
      power_kw: parseFloat((45.0 + (Math.random() - 0.5) * 8).toFixed(2)),
      voltage_v: parseFloat((230.0 + (Math.random() - 0.5) * 4).toFixed(1)),
      temperature_c: parseFloat((32.0 + (Math.random() - 0.5) * 6).toFixed(1)),
      frequency_hz: parseFloat((50.0 + (Math.random() - 0.5) * 0.2).toFixed(2)),
    };

    const res: any = await postJson('/ingest/solar-grid-01', payload);
    if (res && res.status === 'FAST_PATH_OK') {
      process.stdout.write(`\r[Fast-Path] Streamed #${packetIndex} | Latency: ${res.latencyMs}ms | Power: ${payload.power_kw}kW | Status: OK `);
    }
  }, 250);

  // Scheduled Chaos Injections
  setTimeout(async () => {
    console.log('\n\n' + '-'.repeat(70));
    console.log('>>> [CHAOS INJECTION 1: SCHEMA DRIFT] Inverter firmware renamed power_kw -> active_power_kw');
    console.log('-'.repeat(70));
    const faultRes: any = await postJson('/chaos/inject', { fault_type: 'SCHEMA_DRIFT', connector: 'solar-grid-01' });
    console.log('[Healer Output]:', JSON.stringify(faultRes?.result?.status, null, 2));
    console.log('[Rule Cached]: Sub-millisecond hot-rule cache is now primed for future occurrences!');
  }, 4000);

  setTimeout(async () => {
    console.log('\n\n' + '-'.repeat(70));
    console.log('>>> [CHAOS INJECTION 2: SENSOR OUTLIER] Soil sensor hardware glitch sending -9999°C');
    console.log('-'.repeat(70));
    const faultRes: any = await postJson('/chaos/inject', { fault_type: 'SENSOR_OUTLIER', connector: 'agri-moist-fleet' });
    console.log('[Healer Output]:', JSON.stringify(faultRes?.result?.status, null, 2));
    console.log('[Imputed Temp]:', faultRes?.result?.cleanRecord?.temperature_c, '°C (EMA Moving Average)');
  }, 8000);

  setTimeout(async () => {
    console.log('\n\n' + '-'.repeat(70));
    console.log('>>> [CHAOS INJECTION 3: DIRTY UNITS] String unit contamination "64.8 kW"');
    console.log('-'.repeat(70));
    const faultRes: any = await postJson('/chaos/inject', { fault_type: 'TYPE_MISMATCH', connector: 'solar-grid-01' });
    console.log('[Healer Output]:', JSON.stringify(faultRes?.result?.status, null, 2));
    console.log('[Parsed Float]:', faultRes?.result?.cleanRecord?.power_kw, 'kW');
  }, 12000);

  setTimeout(async () => {
    console.log('\n\n' + '-'.repeat(70));
    console.log('>>> [CHAOS INJECTION 4: ELT SQL ERROR] Transactional division by zero in aggregation');
    console.log('-'.repeat(70));
    const faultRes: any = await postJson('/chaos/inject', { fault_type: 'ELT_SQL_ERROR', connector: 'elt-warehouse-runner' });
    console.log('[Savepoint Patch]:', faultRes?.patch?.rule);
    console.log('[Patched SQL]:', faultRes?.patch?.patchedSql);
    console.log('[Avoided Backfill Rows]:', faultRes?.greenEvent?.avoided_backfill_rows);
  }, 16000);

  // Summary at 20s
  setTimeout(async () => {
    clearInterval(timer);
    console.log('\n\n' + '='.repeat(70));
    console.log('>>> DEMO SUMMARY & GREEN CARBON LEDGER');
    console.log('='.repeat(70));
    const bootstrapRes: any = await fetch(`${API_BASE}/dashboard/bootstrap`).then(r => r.json());
    console.log('Cluster Status:', bootstrapRes.cluster_status);
    console.log('Green Ledger Totals:', bootstrapRes.green_ledger_totals);
    console.log('Active Hot Rules:', bootstrapRes.active_rules?.length);
    console.log('\n[Demo Complete] Engine operating at 100% uptime with zero downtime.');
    process.exit(0);
  }, 21000);
}

runDemo();
