// Minimal client-side session for the console login. Not a security
// boundary — matches the backend's plaintext-password, no-hashing-yet scope
// (see management-backend/auth.py). Just tracks "is someone logged in" so
// the UI can gate routes and show who's signed in.

import type { User } from './api'

const STORAGE_KEY = 'console_user'

export function getStoredUser(): User | null {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as User
  } catch {
    return null
  }
}

export function setStoredUser(user: User): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(user))
}

export function clearStoredUser(): void {
  localStorage.removeItem(STORAGE_KEY)
}
