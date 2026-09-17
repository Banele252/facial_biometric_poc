// src/shared/iccid.ts
//
// Single source of truth for ICCID formatting/validation on the client.
// Mirrors the backend's ICCID_PATTERN exactly (Backend/app/routers/iccid.py)
// so a manually typed ICCID and a scanned/extracted ICCID are held to the
// identical rule — no discrepancy between entry methods.

const ICCID_PATTERN = /^89\d{17,18}$/;
const MIN_ICCID_LENGTH = 19;
const MAX_ICCID_LENGTH = 20;

export interface IccidValidation {
    valid: boolean;
    reason?: string;
}

/**
 * Strips all non-digit characters and caps at the maximum ICCID length.
 * Safe to call on every keystroke — never throws, always returns a string.
 */
export function stripToDigits(value: string): string {
  return (value ?? '').replace(/\D/g, '').slice(0, MAX_ICCID_LENGTH);
}

/**
 * Formats a digit string into groups of 4 for readability.
 * e.g. "8934000012345678901" -> "8934 0000 1234 5678 901".
 * Purely cosmetic — validation always runs against the stripped digits.
 */
export function formatIccid(digits: string): string {
  return digits.replace(/(\d{4})(?=\d)/g, '$1 ').trim();
}

/**
 * Validates a raw or formatted ICCID string against the same rule the
 * backend enforces: 19-20 digits, starting with the "89" telecom prefix.
 * Accepts either manually typed input or a value returned from
 * extractIccidFromImage() — both go through this one function.
 */
export function validateIccidFormat(value: string): IccidValidation {
  const digits = stripToDigits(value);

  if (digits.length === 0) {
    return { valid: false, reason: 'ICCID is required' };
  }
  if (digits.length < MIN_ICCID_LENGTH) {
    return { valid: false, reason: `${digits.length}/${MIN_ICCID_LENGTH}–${MAX_ICCID_LENGTH} digits` };
  }
  if (!ICCID_PATTERN.test(digits)) {
    return { valid: false, reason: 'ICCID must start with 89' };
  }
  return { valid: true };
}