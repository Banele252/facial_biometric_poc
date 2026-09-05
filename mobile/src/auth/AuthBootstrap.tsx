// src/auth/AuthBootstrap.tsx
import type { ReactNode } from 'react';

interface AuthBootstrapProps {
  children: ReactNode;
}

/**
 * PoC / demo authentication bootstrap.
 *
 * Backend authentication is currently disabled with:
 *
 *   AUTH_ENABLED=false
 *
 * ZeroTrustMiddleware injects a synthetic PoC user context, so the
 * mobile application does not need to obtain a JWT before rendering.
 *
 * This component intentionally remains in the component tree so the
 * normal JWT bootstrap flow can be restored later without changing
 * the application structure.
 */
export default function AuthBootstrap({
                                        children,
                                      }: AuthBootstrapProps) {
  return <>{children}</>;
}