import { IngestionService } from './IngestionService.js';
import { MqttMessage } from '../types/index.js';

export interface MqttSubscription {
  pattern: RegExp;
  connectorExtractor: (topic: string) => string;
}

export class MqttBrokerAdapter {
  private subscriptions: MqttSubscription[] = [];
  private totalMessagesReceived = 0;
  private totalBytesIngested = 0;
  private isConnected = true;

  constructor(private readonly ingestionService: IngestionService) {
    this.registerDefaultTopics();
  }

  private registerDefaultTopics(): void {
    // 1. Topic pattern: fluxheal/:connector/telemetry
    this.subscribe('fluxheal/+/telemetry', (topic) => {
      const parts = topic.split('/');
      return parts[1] || 'default-connector';
    });

    // 2. Topic pattern: industrial/iot/:connector/#
    this.subscribe('industrial/iot/+/#', (topic) => {
      const parts = topic.split('/');
      return parts[2] || 'industrial-gateway';
    });

    // 3. Topic pattern: clean-energy/:connector
    this.subscribe('clean-energy/+', (topic) => {
      const parts = topic.split('/');
      return parts[1] || 'clean-energy-feed';
    });
  }

  /**
   * Subscribes to an MQTT topic with '+' or '#' wildcard support.
   */
  public subscribe(topicPattern: string, connectorExtractor: (topic: string) => string): void {
    const regexStr = '^' + topicPattern
      .replace(/\+/g, '[^/]+')
      .replace(/#/g, '.*') + '$';
    this.subscriptions.push({
      pattern: new RegExp(regexStr),
      connectorExtractor,
    });
  }

  /**
   * Ingests an incoming MQTT message packet and routes it into the 5-Stage Autonomous Loop.
   */
  public async handleMessage(topic: string, rawPayload: string | Buffer | Record<string, any>, qos: 0 | 1 | 2 = 1): Promise<any> {
    this.totalMessagesReceived += 1;

    let payloadObj: Record<string, any>;
    if (typeof rawPayload === 'string') {
      this.totalBytesIngested += rawPayload.length;
      try {
        payloadObj = JSON.parse(rawPayload);
      } catch {
        payloadObj = { raw_string: rawPayload };
      }
    } else if (Buffer.isBuffer(rawPayload)) {
      this.totalBytesIngested += rawPayload.length;
      try {
        payloadObj = JSON.parse(rawPayload.toString('utf-8'));
      } catch {
        payloadObj = { raw_buffer: rawPayload.toString('hex') };
      }
    } else {
      this.totalBytesIngested += JSON.stringify(rawPayload).length;
      payloadObj = { ...rawPayload };
    }

    // Resolve connector via matched subscription pattern
    let connector = 'mqtt-industrial-gateway';
    for (const sub of this.subscriptions) {
      if (sub.pattern.test(topic)) {
        connector = sub.connectorExtractor(topic);
        break;
      }
    }

    // Hand off to the 5-Stage Autonomous Ingestion Controller
    return await this.ingestionService.processIncomingStream(connector, payloadObj);
  }

  public getStats(): {
    connected: boolean;
    totalMessagesReceived: number;
    totalBytesIngested: number;
    subscribedTopicsCount: number;
  } {
    return {
      connected: this.isConnected,
      totalMessagesReceived: this.totalMessagesReceived,
      totalBytesIngested: this.totalBytesIngested,
      subscribedTopicsCount: this.subscriptions.length,
    };
  }
}
