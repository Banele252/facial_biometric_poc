// src/shared/idValidation.ts
export type IdValidationLevel = 'idle' | 'typing' | 'error' | 'valid';

export interface IdValidationResult {
    level: IdValidationLevel;
    text: string;
}

function maxDayInMonth(mm: number, yy: number): number {
  const asNineteenHundreds = new Date(1900 + yy, mm, 0).getDate();
  const asTwoThousands = new Date(2000 + yy, mm, 0).getDate();
  return Math.max(asNineteenHundreds, asTwoThousands);
}

export function validateIdNumber(d: string): IdValidationResult {
  if (!d.length) {
    return { level: 'idle', text: '13 digits, as printed in your green ID book or card.' };
  }
  if (d.length < 13) {
    const remaining = 13 - d.length;
    return {
      level: 'typing',
      text: `Keep going — ${remaining} more digit${remaining === 1 ? '' : 's'}.`,
    };
  }

  const yy = +d.slice(0, 2);
  const mm = +d.slice(2, 4);
  const dd = +d.slice(4, 6);

  if (mm < 1 || mm > 12) {
    return { level: 'error', text: 'Month must be between 01 and 12.' };
  }

  const maxDay = maxDayInMonth(mm, yy);
  if (dd < 1 || dd > maxDay) {
    return { level: 'error', text: `Day must be between 1 and ${maxDay} for month ${mm}.` };
  }

  const citizenship = +d.charAt(10);
  if (citizenship !== 0 && citizenship !== 1) {
    return { level: 'error', text: 'The citizenship digit must be 0 or 1.' };
  }

  const digit12 = +d.charAt(11);
  if (digit12 !== 8 && digit12 !== 9) {
    return { level: 'error', text: 'The 12th digit must be 8 or 9 (South African ID convention).' };
  }

  let sum = 0;
  for (let i = 0; i < 13; i++) {
    let n = +d.charAt(i);
    if ((12 - i) % 2 === 1) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
  }
  if (sum % 10 !== 0) {
    return { level: 'error', text: 'ID number failed the Luhn checksum validation. Please re-enter.' };
  }

  return { level: 'valid', text: 'ID number looks valid — checking with the server on Continue.' };
}