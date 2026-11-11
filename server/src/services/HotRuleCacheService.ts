import { createHash } from 'crypto';
import { HealingRule, RuleDefinition } from '../types/index.js';
import { PgDatabase } from '../db/pg-client.js';

export class HotRuleCacheService {
  private cache: Map<string, HealingRule> = new Map();
  private pg = PgDatabase.getInstance();

  constructor() {
    this.hydrateFromDatabase().catch((err) => {
      console.error('[HotRuleCache] Initial hydration warning:', err.message);
    });
  }

  /**
   * Hydrates active compiled rules from PostgreSQL healing_rules_registry
   */
  public async hydrateFromDatabase(): Promise<void> {
    try {
      const res = await this.pg.query('SELECT * FROM healing_rules_registry WHERE is_active = TRUE;');
      for (const row of res.rows) {
        const rule: HealingRule = {
          id: row.id,
          source_signature: row.source_signature,
          anomaly_category: row.anomaly_category,
          rule_definition: row.rule_definition,
          sql_patch_template: row.sql_patch_template,
          confidence_score: parseFloat(row.confidence_score),
          times_triggered: parseInt(row.times_triggered, 10),
          is_active: Boolean(row.is_active),
          created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
        };
        this.cache.set(rule.source_signature, rule);
      }
    } catch (err: any) {
      console.warn('[HotRuleCache] PostgreSQL hydration skipped:', err.message);
    }
  }

  public computeSignature(connector: string, payload: Record<string, any>): string {
    const sortedKeys = Object.keys(payload).sort();
    const typeSignature = sortedKeys.map((k) => `${k}:${typeof payload[k]}`).join('|');
    return createHash('sha256')
      .update(`${connector}::${typeSignature}`)
      .digest('hex')
      .substring(0, 16);
  }

  public getRule(signature: string): HealingRule | undefined {
    const rule = this.cache.get(signature);
    if (rule && rule.is_active) {
      return rule;
    }
    return undefined;
  }

  public async registerRule(rule: HealingRule): Promise<void> {
    this.cache.set(rule.source_signature, rule);

    const sql = `
      INSERT INTO healing_rules_registry (
        id, source_signature, anomaly_category, rule_definition,
        sql_patch_template, confidence_score, times_triggered, is_active, created_at
      ) VALUES ($1, $2, $3::anomaly_category, $4::jsonb, $5, $6, $7, $8, $9)
      ON CONFLICT (source_signature) DO UPDATE
      SET rule_definition = EXCLUDED.rule_definition,
          confidence_score = EXCLUDED.confidence_score,
          is_active = TRUE;
    `;

    await this.pg.query(sql, [
      rule.id,
      rule.source_signature,
      rule.anomaly_category,
      JSON.stringify(rule.rule_definition),
      rule.sql_patch_template ?? null,
      rule.confidence_score,
      rule.times_triggered,
      rule.is_active,
      rule.created_at,
    ]);
  }

  public async evictRule(signatureOrId: string): Promise<boolean> {
    let evicted = false;
    for (const [sig, rule] of this.cache.entries()) {
      if (sig === signatureOrId || rule.id === signatureOrId) {
        rule.is_active = false;
        this.cache.delete(sig);

        await this.pg.query(
          'UPDATE healing_rules_registry SET is_active = FALSE WHERE id = $1::uuid OR source_signature = $2;',
          [rule.id, sig]
        );
        evicted = true;
      }
    }
    return evicted;
  }

  public clear(): void {
    this.cache.clear();
  }

  public getAllActiveRules(): HealingRule[] {
    return Array.from(this.cache.values()).filter((r) => r.is_active);
  }

  public applyDeterministicTransform(
    payload: Record<string, any>,
    rule: HealingRule
  ): Record<string, any> {
    const transformed: Record<string, any> = { ...payload };
    const def = rule.rule_definition;

    // 1. Remap fields
    if (def.field_mappings) {
      for (const [srcKey, tgtKey] of Object.entries(def.field_mappings)) {
        if (srcKey in transformed) {
          transformed[tgtKey] = transformed[srcKey];
          delete transformed[srcKey];
        }
      }
    }

    // 2. Strip regex patterns
    if (def.regex_strip) {
      for (const [key, pattern] of Object.entries(def.regex_strip)) {
        if (key in transformed && typeof transformed[key] === 'string') {
          const numStr = transformed[key].replace(new RegExp(pattern, 'g'), '');
          const parsed = parseFloat(numStr);
          if (!isNaN(parsed)) {
            transformed[key] = parsed;
          }
        }
      }
    }

    // 3. Normalize timestamp
    if (transformed.ts && !transformed.timestamp && !transformed.metric_timestamp) {
      transformed.metric_timestamp = new Date(transformed.ts).toISOString();
      delete transformed.ts;
    } else if (transformed.timestamp && !transformed.metric_timestamp) {
      transformed.metric_timestamp = new Date(transformed.timestamp).toISOString();
      delete transformed.timestamp;
    }

    rule.times_triggered += 1;

    // Fire-and-forget hit counter increment in PostgreSQL
    this.pg.query(
      'UPDATE healing_rules_registry SET times_triggered = times_triggered + 1 WHERE id = $1::uuid;',
      [rule.id]
    ).catch(() => {});

    return transformed;
  }
}
