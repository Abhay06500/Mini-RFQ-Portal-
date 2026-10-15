import { createHash, timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { conflict, forbidden, unauthorized } from '../errors.js';
import type { LoginInput, RegisterInput } from '../validation/schemas.js';
import { publicUserSelect, serializeUser } from './serializers.js';
import { signSession } from '../middleware/auth.js';

const BCRYPT_ROUNDS = 12;

/** Used to keep login timing similar whether or not the email exists. */
const DUMMY_HASH = bcrypt.hashSync('timing-equalizer-not-a-real-password', BCRYPT_ROUNDS);

/** Compares two secrets without leaking length or content through timing. */
function secretsMatch(provided: string, expected: string): boolean {
  const a = createHash('sha256').update(provided).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b) && provided.length > 0;
}

/**
 * Self-registration creates Buyer or Vendor accounts. Admin accounts require the server's
 * ADMIN_INVITE_CODE, so nobody can elevate themselves through the public form.
 */
export async function registerUser(input: RegisterInput) {
  if (input.role === 'ADMIN') {
    if (!config.ADMIN_INVITE_CODE) {
      throw forbidden('Admin registration is disabled on this server');
    }
    if (!secretsMatch(input.adminInviteCode ?? '', config.ADMIN_INVITE_CODE)) {
      throw forbidden('The admin invitation code is not valid');
    }
  }

  const existing = await prisma.user.findUnique({ where: { email: input.email }, select: { id: true } });
  if (existing) throw conflict('EMAIL_TAKEN', 'An account with this email already exists');

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
  const user = await prisma.user.create({
    data: { name: input.name, email: input.email, passwordHash, role: input.role },
    select: publicUserSelect,
  });
  return serializeUser(user);
}

export async function loginUser(input: LoginInput) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  const passwordOk = await bcrypt.compare(input.password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !passwordOk) {
    throw unauthorized('Invalid email or password');
  }
  if (!user.isActive) {
    throw forbidden('This account has been disabled. Contact an administrator.');
  }
  return {
    token: signSession(user.id, user.role),
    user: serializeUser(user),
  };
}
