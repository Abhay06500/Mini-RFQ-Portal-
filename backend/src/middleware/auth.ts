import type { NextFunction, Request, Response } from 'express';
import type { Role } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { forbidden, unauthorized } from '../errors.js';

export const SESSION_COOKIE = 'rfq_session';

interface SessionClaims {
  sub: string;
  role: Role;
}

export function signSession(userId: string, role: Role): string {
  return jwt.sign({ sub: userId, role } satisfies SessionClaims, config.JWT_SECRET, {
    expiresIn: config.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
    algorithm: 'HS256',
  });
}

function verifySession(token: string): SessionClaims {
  try {
    const payload = jwt.verify(token, config.JWT_SECRET, { algorithms: ['HS256'] });
    if (typeof payload !== 'object' || typeof payload.sub !== 'string') throw new Error('bad claims');
    return { sub: payload.sub, role: payload.role as Role };
  } catch {
    throw unauthorized('Your session has expired. Please sign in again.');
  }
}

/**
 * Authenticates from the HttpOnly session cookie. The user row is loaded on every request,
 * so disabling an account takes effect immediately, without waiting for the token to expire.
 */
export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const token = req.cookies?.[SESSION_COOKIE] as string | undefined;
  if (!token) throw unauthorized();
  const claims = verifySession(token);
  const user = await prisma.user.findUnique({
    where: { id: claims.sub },
    select: { id: true, name: true, email: true, role: true, isActive: true },
  });
  if (!user || !user.isActive) throw unauthorized();
  req.user = { id: user.id, name: user.name, email: user.email, role: user.role };
  next();
}

/** Role gate. Must run after requireAuth. */
export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) throw unauthorized();
    if (!roles.includes(req.user.role)) throw forbidden();
    next();
  };
}
