// src/hooks/useAudit.ts
import { useCallback, useEffect, useRef } from 'react';
import { audit, AuditEvent, AuditContext } from '@/services/audit/AuditService';

export interface UseAuditOptions {
    /** Auto-log SCREEN_VIEWED on mount */
    autoView?: boolean;
    /** Auto-log JOURNEY_ENDED on unmount (if this is a terminal screen) */
    autoEnd?: boolean;
    /** Optional userId to attach to every log */
    userId?: string;
    /** Optional msisdn to attach to every log */
    msisdn?: string;
}

export function useAudit(screenName: string, options: UseAuditOptions = {}) {
  const { autoView = true, autoEnd = false, userId, msisdn } = options;
  const mountedRef = useRef(false);

  const buildContext = useCallback(
    (ctx?: Omit<AuditContext, 'screen'>): AuditContext => {
      return {
        screen: screenName,
        ...(userId && { userId }),
        ...(msisdn && { msisdn }),
        ...ctx,
      };
    },
    [screenName, userId, msisdn],
  );

  const log = useCallback(
    async (eventType: AuditEvent, context?: Omit<AuditContext, 'screen'>) => {
      try {
        return await audit.log(eventType, buildContext(context));
      } catch (err) {
        // Audit failures must never crash the UI
        if (__DEV__) {
          console.warn(`[useAudit] ${screenName} — ${eventType} failed:`, err);
        }
      }
    },
    [buildContext, screenName],
  );

  const flush = useCallback(async () => {
    try {
      return await audit.flush();
    } catch (err) {
      if (__DEV__) {
        console.warn(`[useAudit] ${screenName} — flush failed:`, err);
      }
      return false;
    }
  }, [screenName]);

  // Auto-log screen view on mount
  useEffect(() => {
    if (!autoView || mountedRef.current) return;
    mountedRef.current = true;

    log('SCREEN_VIEWED');

    return () => {
      if (autoEnd) {
        log('JOURNEY_ENDED').catch(() => {});
      }
    };
  }, [autoView, autoEnd, log]);

  return { log, flush, screenName };
}