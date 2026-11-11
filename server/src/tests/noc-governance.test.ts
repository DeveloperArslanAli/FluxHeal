import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { server, nocGovernance, pgDb } from '../index.js';
import { randomUUID } from 'crypto';
import type { AddressInfo } from 'net';

describe('Phase 9: Enterprise NOC Governance & Mobile HITL Test Suite', () => {
  let baseUrl: string;

  beforeAll(async () => {
    await pgDb.initSchema();
    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        const address = server.address() as AddressInfo;
        baseUrl = `http://localhost:${address.port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it('[NOC-1] Multi-Channel Mobile Webhook Payload Formats (Slack, Teams, Telegram)', () => {
    const mockHitlItem = {
      id: randomUUID(),
      deviceId: 'SOLAR_ARRAY_SOUTH_4',
      sourceConnector: 'MQTT_EDGE_BROKER',
      anomalyType: 'TYPE_MISMATCH' as const,
      rawPayload: { device_id: 'SOLAR_ARRAY_SOUTH_4', power: '142.50 kW' },
      proposedPayload: { device_id: 'SOLAR_ARRAY_SOUTH_4', power_kw: 142.50 },
      confidenceScore: 0.785,
      appliedMethod: 'REGEX_UNIT_STRIP',
      reasoning: 'Ambiguous unit string suffix stripped with 78.5% confidence',
      queuedAt: new Date().toISOString(),
      status: 'PENDING_HITL' as const,
    };

    // 1. Slack Block Kit Format
    const slack = nocGovernance.formatSlackBlockKit(mockHitlItem);
    expect(slack.blocks).toBeDefined();
    expect(slack.blocks[0].type).toBe('header');
    expect(slack.blocks[1].fields.some((f: any) => f.text.includes('SOLAR_ARRAY_SOUTH_4'))).toBe(true);
    expect(slack.blocks[1].fields.some((f: any) => f.text.includes('78.5%'))).toBe(true);
    const actions = slack.blocks.find((b: any) => b.type === 'actions');
    expect(actions.elements.length).toBe(2);
    expect(actions.elements[0].text.text).toContain('Approve');
    expect(actions.elements[1].text.text).toContain('Reject');

    // 2. Teams Adaptive Card 1.4 Format
    const teams = nocGovernance.formatTeamsAdaptiveCard(mockHitlItem);
    const card = teams.attachments[0].content;
    expect(card.type).toBe('AdaptiveCard');
    expect(card.version).toBe('1.4');
    expect(card.actions.length).toBe(2);
    expect(card.actions[0].data.action).toBe('approve');
    expect(card.actions[1].data.action).toBe('reject');

    // 3. Telegram MarkdownV2 Format
    const telegram = nocGovernance.formatTelegramMarkup(mockHitlItem);
    expect(telegram.parse_mode).toBe('MarkdownV2');
    expect(telegram.text).toContain('SOLAR_ARRAY_SOUTH_4');
    expect(telegram.text).toContain('78.5%');
    expect(telegram.reply_markup.inline_keyboard[0][0].text).toContain('Approve');
    expect(telegram.reply_markup.inline_keyboard[0][1].text).toContain('Reject');
  });

  it('[NOC-2] Queue Low-Confidence HITL Alert & Outbound Webhook Dispatch', async () => {
    const alert = await nocGovernance.simulateHitlAlert('WIND_FARM_TURBINE_12');
    expect(alert).toBeDefined();
    expect(alert.deviceId).toBe('WIND_FARM_TURBINE_12');
    expect(alert.status).toBe('PENDING_HITL');
    expect(alert.confidenceScore).toBeGreaterThanOrEqual(0.60);
    expect(alert.confidenceScore).toBeLessThan(0.90);

    const pending = nocGovernance.getPendingQueue();
    expect(pending.some(i => i.id === alert.id)).toBe(true);

    const dispatches = nocGovernance.getOutboundDispatches();
    const alertDispatches = dispatches.filter(d => d.hitlId === alert.id);
    expect(alertDispatches.length).toBe(3); // Slack, Teams, Telegram
    expect(alertDispatches.map(d => d.channel).sort()).toEqual(['SLACK', 'TEAMS', 'TELEGRAM']);
  });

  it('[NOC-3] RBAC Permission Enforcement: Block Unauthorized Roles', async () => {
    const alert = await nocGovernance.simulateHitlAlert('BATTERY_STORAGE_PACK_01');

    // READONLY_AUDITOR cannot approve (must return 403 Forbidden)
    const res = await fetch(`${baseUrl}/api/v1/governance/hitl/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': 'AUDITOR_ALICE',
        'x-user-role': 'READONLY_AUDITOR'
      },
      body: JSON.stringify({ hitlId: alert.id, decisionNotes: 'Attempting unauthorized approval' })
    });

    expect(res.status).toBe(403);
    const body: any = await res.json();
    expect(body.error).toContain("Forbidden: Role 'READONLY_AUDITOR' lacks permission 'hitl:approve'");
  });

  it('[NOC-4] Authorize HITL Approval by DATA_ENGINEER and Verify Warehouse Insertion', async () => {
    const alert = await nocGovernance.simulateHitlAlert('HYDRO_PUMP_STATION_3');

    const res = await fetch(`${baseUrl}/api/v1/governance/hitl/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': 'ENG_BOB',
        'x-user-role': 'DATA_ENGINEER'
      },
      body: JSON.stringify({
        hitlId: alert.id,
        decisionNotes: 'Verified calibration with field telemetry team; approved for warehouse write.'
      })
    });

    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.success).toBe(true);
    expect(body.item.status).toBe('APPROVED');
    expect(body.item.reviewedBy).toBe('ENG_BOB');

    // Verify item is removed from pending queue
    const pending = nocGovernance.getPendingQueue();
    expect(pending.some(i => i.id === alert.id)).toBe(false);

    // Verify audit log entry
    const auditLogs = await nocGovernance.getAuditLogs({ limit: 10, action: 'HITL_APPROVE_COMMIT' });
    expect(auditLogs.some(l => l.entityId === alert.id && l.actorId === 'ENG_BOB')).toBe(true);
  });

  it('[NOC-5] Remote Mobile Webhook Resolution (Slack Block Kit Callback)', async () => {
    const alert = await nocGovernance.simulateHitlAlert('CAISO_SUBSTATION_ALPHA');

    // Simulate Slack Interactive Button Click Webhook
    const slackPayload = {
      payload: JSON.stringify({
        user: { username: 'mobile_noc_lead' },
        actions: [
          {
            action_id: 'fluxheal_hitl_approve',
            value: `approve_${alert.id}`
          }
        ]
      })
    };

    const res = await fetch(`${baseUrl}/api/v1/governance/webhook/slack`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(slackPayload)
    });

    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.status).toBe('WEBHOOK_PROCESSED');
    expect(body.result.item.status).toBe('APPROVED');
  });

  it('[NOC-6] Remote Mobile Webhook Rejection (Teams Adaptive Card Callback)', async () => {
    const alert = await nocGovernance.simulateHitlAlert('ERCOT_FEEDER_99');

    // Simulate Teams Adaptive Card Submit Action
    const teamsPayload = {
      action: 'reject',
      hitlId: alert.id
    };

    const res = await fetch(`${baseUrl}/api/v1/governance/webhook/teams`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(teamsPayload)
    });

    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.status).toBe('WEBHOOK_PROCESSED');
    expect(body.result.item.status).toBe('REJECTED');
  });

  it('[NOC-7] Predictive Schema Drift Forecaster & Proactive Migration Recommendation', async () => {
    const testSamples = [
      { device_id: 'SOLAR_01', metric_timestamp: '2026-11-08T00:00:00Z', grid_kw: 45.2, temp_c: 32.0 },
      { device_id: 'SOLAR_02', metric_timestamp: '2026-11-08T00:01:00Z', grid_kw: 48.0, temp_c: 33.1 },
      { device_id: 'TURB_09', metric_timestamp: '2026-11-08T00:02:00Z', vibration_rms: 1.8 }
    ];

    const forecast = await nocGovernance.computeDriftForecast(testSamples);
    expect(forecast).toBeDefined();
    expect(forecast.samplePayloadCount).toBe(3);
    expect(forecast.overallDriftProbability).toBeGreaterThan(0.5);
    expect(forecast.detectedDrifts.length).toBeGreaterThan(0);

    const gridDrift = forecast.detectedDrifts.find(d => d.field === 'grid_kw');
    expect(gridDrift).toBeDefined();
    expect(gridDrift?.targetCanonical).toBe('power_kw');
    expect(gridDrift?.suggestedTransformSql).toContain('COALESCE');

    const vibDrift = forecast.detectedDrifts.find(d => d.field === 'vibration_rms');
    expect(vibDrift).toBeDefined();
    expect(vibDrift?.targetCanonical).toBe('NEW_WAREHOUSE_COLUMN');
    expect(vibDrift?.suggestedTransformSql).toContain('ALTER TABLE');
  });

  it('[NOC-8] REST API Endpoints: Pending Queue, Roles, and Immutable Audit Lineage', async () => {
    const pendingRes = await fetch(`${baseUrl}/api/v1/governance/hitl/pending`);
    expect(pendingRes.status).toBe(200);
    const pendingBody: any = await pendingRes.json();
    expect(typeof pendingBody.count).toBe('number');

    const rolesRes = await fetch(`${baseUrl}/api/v1/governance/rbac/roles`);
    expect(rolesRes.status).toBe(200);
    const rolesBody: any = await rolesRes.json();
    expect(rolesBody.roles.NOC_SUPER_ADMIN).toBeDefined();
    expect(rolesBody.roles.READONLY_AUDITOR).toBeDefined();

    const auditRes = await fetch(`${baseUrl}/api/v1/governance/audit-logs?limit=5`);
    expect(auditRes.status).toBe(200);
    const auditBody: any = await auditRes.json();
    expect(Array.isArray(auditBody.logs)).toBe(true);
    expect(auditBody.logs.length).toBeGreaterThan(0);
  });
});
