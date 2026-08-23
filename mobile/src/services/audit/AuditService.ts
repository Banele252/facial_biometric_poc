// src/services/audit/AuditService.ts
import { Platform } from 'react-native';
import * as Crypto from 'expo-crypto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { request } from '@/shared/api';

export type AuditEvent =
    | 'JOURNEY_STARTED'
    | 'SCREEN_VIEWED'
    | 'CONSENT_GRANTED'
    | 'CONSENT_DECLINED'
    | 'CONSENT_WITHDRAWN'
    | 'ID_VALIDATION_INITIATED'
    | 'ID_VALIDATION_PASSED'
    | 'ID_VALIDATION_FAILED'
    | 'ID_SCAN_INITIATED'
    | 'ID_SCAN_COMPLETED'
    | 'OCR_EXTRACTED'
    | 'LIVENESS_INITIATED'
    | 'LIVENESS_CHALLENGE_ISSUED'
    | 'LIVENESS_PASSED'
    | 'LIVENESS_FAILED'
    | 'FACIAL_MATCH_INITIATED'
    | 'FACIAL_MATCH_PASSED'
    | 'FACIAL_MATCH_FAILED'
    | 'FRAUD_CHECK_INITIATED'
    | 'FRAUD_RULE_TRIGGERED'
    | 'FRAUD_DECISION'
    | 'SWAP_REQUESTED'
    | 'SWAP_PENDING'
    | 'SWAP_APPROVED'
    | 'SWAP_REJECTED'
    | 'SWAP_COMPLETED'
    | 'BARCODE_SCANNED'
    | 'ICCID_CAPTURED'
    | 'SAID_SELECTED'
    | 'JOURNEY_ENDED'
    | 'DATA_PURGE_SCHEDULED'
    | 'RICA_RECORD_STORED'
    | 'IDENTITY_VERIFICATION_COMPLETED'
    | 'IDENTITY_VERIFICATION_FAILED'
    | 'SAID_CAPTURE_FAILED'
    | 'ICCID_CAPTURE_FAILED'
    | 'ERROR_OCCURRED'
    | 'SIM_SWAP_JOURNEY_COMPLETED';

export interface AuditContext {
  userId?: string;
  msisdn?: string;
  screen?: string;
  action?: string;
  outcome?: 'success' | 'failure' | 'blocked' | 'pending';
  reason?: string;
  metadata?: Record<string, unknown>;
}

interface AuditLogEntry {
  event_id: string;
  event_type: AuditEvent;
  timestamp: string;
  session_id: string;
  user_id?: string;
  msisdn?: string;
  device_id: string;
  app_version: string;
  os_version: string;
  screen?: string;
  action?: string;
  outcome?: 'success' | 'failure' | 'blocked' | 'pending';
  reason?: string;
  metadata?: Record<string, unknown>;
  integrity_hash: string;
  previous_hash?: string;
  source: 'mobile';
}

const BUFFER_KEY = '@audit_buffer';
const MAX_BUFFER = 50;
const FLUSH_INTERVAL_MS = 30000;

async function generateUUID(): Promise<string> {
  const bytes = await Crypto.getRandomBytesAsync(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-');
}

class AuditService {
  private buffer: AuditLogEntry[] = [];
  private lastHash = '0'.repeat(64);
  private sessionId = '';
  private deviceId = '';
  private msisdn = '';
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private initialized = false;

  async init(sessionId: string, msisdn?: string) {
    if (this.initialized) return;
    this.sessionId = sessionId;
    this.msisdn = msisdn || '';
    this.deviceId = await this.getOrCreateDeviceId();

    const stored = await AsyncStorage.getItem(BUFFER_KEY);
    if (stored) {
      this.buffer = JSON.parse(stored);
      if (this.buffer.length > 0) {
        this.lastHash = this.buffer[this.buffer.length - 1].integrity_hash;
      }
    }

    this.startFlushTimer();
    this.initialized = true;

    await this.log('JOURNEY_STARTED', {
      msisdn: this.msisdn,
      metadata: {
        appVersion: process.env.EXPO_PUBLIC_APP_VERSION || 'unknown',
        buildNumber: process.env.EXPO_PUBLIC_BUILD_NUMBER || 'unknown',
      },
    });
  }

  private async getOrCreateDeviceId(): Promise<string> {
    let id = await AsyncStorage.getItem('@device_id');
    if (!id) {
      id = await generateUUID();
      await AsyncStorage.setItem('@device_id', id);
    }
    return id;
  }

  private async sha256(message: string): Promise<string> {
    return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, message);
  }

  async log(eventType: AuditEvent, context: AuditContext = {}) {
    if (!this.initialized) {
      console.warn('AuditService not initialized - call init() in App.tsx');
      return;
    }

    const eventId = await generateUUID();
    const timestamp = new Date().toISOString();

    const payload = JSON.stringify({
      event_type: eventType,
      timestamp,
      session_id: this.sessionId,
      user_id: context.userId,
      msisdn: context.msisdn || this.msisdn,
      device_id: this.deviceId,
      app_version: process.env.EXPO_PUBLIC_APP_VERSION || 'unknown',
      os_version: `${Platform.OS}-${Platform.Version}`,
      screen: context.screen,
      action: context.action,
      outcome: context.outcome,
      reason: context.reason,
      metadata: context.metadata || {},
      previous_hash: this.lastHash,
    });

    const integrityHash = await this.sha256(`${payload}:${this.lastHash}`);

    const entry: AuditLogEntry = {
      event_id: eventId,
      event_type: eventType,
      timestamp,
      session_id: this.sessionId,
      user_id: context.userId,
      msisdn: context.msisdn || this.msisdn,
      device_id: this.deviceId,
      app_version: process.env.EXPO_PUBLIC_APP_VERSION || 'unknown',
      os_version: `${Platform.OS}-${Platform.Version}`,
      screen: context.screen,
      action: context.action,
      outcome: context.outcome,
      reason: context.reason,
      metadata: context.metadata || {},
      integrity_hash: integrityHash,
      previous_hash: this.lastHash === '0'.repeat(64) ? undefined : this.lastHash,
      source: 'mobile',
    };

    this.buffer.push(entry);
    this.lastHash = integrityHash;
    await this.persistBuffer();

    if (this.buffer.length >= MAX_BUFFER) {
      await this.flush();
    }
  }

  private async persistBuffer() {
    await AsyncStorage.setItem(BUFFER_KEY, JSON.stringify(this.buffer));
  }

  private startFlushTimer() {
    this.flushTimer = setInterval(() => this.flush(), FLUSH_INTERVAL_MS);
  }

  async flush(): Promise<boolean> {
    if (this.buffer.length === 0) return true;

    const batchPayload = this.buffer.map((e) => e.integrity_hash).join('');
    const batchHash = await this.sha256(batchPayload);

    try {
      await request('/audit/batch', {
        method: 'POST',
        body: JSON.stringify({ entries: this.buffer, batch_hash: batchHash }),
        headers: {
          'X-Session-Id': this.sessionId,
          'X-Device-Id': this.deviceId,
        },
      });

      this.buffer = [];
      this.lastHash = '0'.repeat(64);
      await AsyncStorage.removeItem(BUFFER_KEY);
      return true;
    } catch (error) {
      console.error('Audit flush failed - will retry', error);
      return false;
    }
  }

  destroy() {
    if (this.flushTimer) clearInterval(this.flushTimer);
    this.flush();
  }
}

export const audit = new AuditService();