import { afterEach, describe, expect, it } from 'vitest';
import { app, createUser, pinClock, PASSWORD, resetDatabase, signIn } from './helpers.js';
import request from 'supertest';

describe('authentication and authorization', () => {
  afterEach(() => pinClock(null));

  it('lets a buyer register, sign in, and read their profile', async () => {
    const reg = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Acme Constructions', email: 'Buyer@Acme.test', password: PASSWORD, role: 'BUYER' });
    expect(reg.status).toBe(201);
    expect(reg.body.user.email).toBe('buyer@acme.test');
    expect(reg.body.user).not.toHaveProperty('passwordHash');

    const agent = await signIn('buyer@acme.test');
    const me = await agent.get('/api/v1/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.user.role).toBe('BUYER');
  });

  it('refuses to create an admin without the invitation code, and accepts the right one', async () => {
    const base = { name: 'Eve Admin', email: 'eve@admin.test', password: PASSWORD, role: 'ADMIN' };
    const noCode = await request(app).post('/api/v1/auth/register').send(base);
    expect(noCode.status).toBe(403);

    const wrongCode = await request(app).post('/api/v1/auth/register').send({ ...base, adminInviteCode: 'nope' });
    expect(wrongCode.status).toBe(403);

    const ok = await request(app)
      .post('/api/v1/auth/register')
      .send({ ...base, adminInviteCode: 'test-admin-invite-code' });
    expect(ok.status).toBe(201);
    expect(ok.body.user.role).toBe('ADMIN');
  });

  it('returns one generic error for a wrong password and rejects duplicate emails', async () => {
    const buyer = await createUser('BUYER');
    const wrong = await request(app).post('/api/v1/auth/login').send({ email: buyer.email, password: 'WrongPass1' });
    expect(wrong.status).toBe(401);
    expect(wrong.body.error.message).toBe('Invalid email or password');

    const unknown = await request(app).post('/api/v1/auth/login').send({ email: 'ghost@test.local', password: PASSWORD });
    expect(unknown.body.error.message).toBe('Invalid email or password');

    const dup = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Dup', email: buyer.email, password: PASSWORD, role: 'VENDOR' });
    expect(dup.status).toBe(409);
  });

  it('rejects protected requests without a session', async () => {
    const res = await request(app).get('/api/v1/rfqs/mine');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('stops a vendor from using buyer-only and admin-only endpoints', async () => {
    const vendor = await createUser('VENDOR');
    const agent = await signIn(vendor.email);
    const create = await agent.post('/api/v1/rfqs').send({});
    expect(create.status).toBe(403);
    const users = await agent.get('/api/v1/admin/users');
    expect(users.status).toBe(403);
  });

  it('blocks a disabled account from using an existing session', async () => {
    await resetDatabase();
    const admin = await createUser('ADMIN');
    const vendor = await createUser('VENDOR');
    const vendorAgent = await signIn(vendor.email);
    expect((await vendorAgent.get('/api/v1/auth/me')).status).toBe(200);

    const adminAgent = await signIn(admin.email);
    const disable = await adminAgent.patch(`/api/v1/admin/users/${vendor.id}`).send({ isActive: false });
    expect(disable.status).toBe(200);

    expect((await vendorAgent.get('/api/v1/auth/me')).status).toBe(401);
    const relogin = await request(app).post('/api/v1/auth/login').send({ email: vendor.email, password: PASSWORD });
    expect(relogin.status).toBe(403);
  });

  it('keeps non-admins out of user management and stops admins from demoting themselves', async () => {
    const buyer = await createUser('BUYER');
    const admin = await createUser('ADMIN');
    const buyerAgent = await signIn(buyer.email);
    expect((await buyerAgent.get('/api/v1/admin/users')).status).toBe(403);

    const adminAgent = await signIn(admin.email);
    const selfDemote = await adminAgent.patch(`/api/v1/admin/users/${admin.id}`).send({ role: 'BUYER' });
    expect(selfDemote.status).toBe(422);
    expect(selfDemote.body.error.code).toBe('SELF_CHANGE_FORBIDDEN');
  });
});
