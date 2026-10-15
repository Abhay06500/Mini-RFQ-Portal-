import { Router, type NextFunction, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { config } from '../config.js';
import { requireAuth, SESSION_COOKIE } from '../middleware/auth.js';
import { loginUser, registerUser } from '../services/auth.service.js';
import { parse } from '../validation/parse.js';
import { loginSchema, registerSchema } from '../validation/schemas.js';

export const authRouter = Router();

const SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000;

const cookieOptions = {
  httpOnly: true,
  sameSite: 'strict' as const,
  secure: config.COOKIE_SECURE,
  path: '/',
};

// Brute-force protection on sign-in. Disabled under NODE_ENV=test so the suite can log in freely.
const loginLimiter =
  config.NODE_ENV === 'test'
    ? (_req: Request, _res: Response, next: NextFunction) => next()
    : rateLimit({
        windowMs: 15 * 60 * 1000,
        limit: 20,
        standardHeaders: 'draft-7',
        legacyHeaders: false,
        message: { error: { code: 'RATE_LIMITED', message: 'Too many sign-in attempts. Try again later.' } },
      });

authRouter.post('/register', async (req, res) => {
  const input = parse(registerSchema, req.body);
  const user = await registerUser(input);
  res.status(201).json({ user });
});

authRouter.post('/login', loginLimiter, async (req, res) => {
  const input = parse(loginSchema, req.body);
  const { token, user } = await loginUser(input);
  res.cookie(SESSION_COOKIE, token, { ...cookieOptions, maxAge: SESSION_MAX_AGE_MS });
  res.json({ user });
});

authRouter.post('/logout', (_req, res) => {
  res.clearCookie(SESSION_COOKIE, cookieOptions);
  res.status(204).end();
});

authRouter.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});
