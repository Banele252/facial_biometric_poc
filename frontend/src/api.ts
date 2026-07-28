export interface ValidationResponse {
  id_number_length: number
  valid: boolean
  checks: Record<string, boolean>
  failed_checks: string[]
}

export async function validateId(idNumber: string): Promise<ValidationResponse> {
  const resp = await fetch('/api/v1/validate-id', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id_number: idNumber }),
  })

  if (!resp.ok) {
    const detail = await resp.json().catch(() => null)
    throw new Error(detail?.detail?.[0]?.msg ?? `Validation failed (HTTP ${resp.status})`)
  }

  return resp.json()
}

export const CHECK_LABELS: Record<string, string> = {
  length_is_13: 'Is 13 digits long',
  is_numeric: 'Contains digits only',
  date_of_birth_plausible: 'Date of birth is plausible',
  citizenship_digit_valid: 'Citizenship digit is valid',
  race_digit_valid: '12th digit is valid',
  luhn_checksum: 'Passes Luhn checksum',
}
