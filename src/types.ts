/**
 * Hono context variable types shared across all routes.
 */
export interface JwtPayload {
  sub: string;
  role: string;
  tenantId?: string;
  iat: number;
  exp: number;
}

export interface JwtVariables {
  jwtPayload: JwtPayload;
}
