import supertest from 'supertest';
import type { Express } from 'express';

const agents = new WeakMap<Express, ReturnType<typeof supertest.agent>>();
export async function authenticateTestAdmin(app: Express): Promise<void> {
  const { client } = await import('../src/db/connection.js');
  const { runMigrations } = await import('../src/db/migrate.js');
  const { provisionAdmin } = await import('../src/services/auth.service.js');
  await runMigrations(client);
  if (!(await client.execute('SELECT id FROM admin_account')).rows.length) await provisionAdmin('isolated-unit-test-admin-123!');
  const agent = supertest.agent(app);
  agent.set('X-Ordinus-Request', '1');
  const response = await agent.post('/api/v1/auth/login').send({ username: 'admin', password: 'isolated-unit-test-admin-123!' });
  if (response.status !== 200) throw new Error(`Test admin login failed: ${response.status}`);
  agents.set(app, agent);
}
export default function request(app: Express): ReturnType<typeof supertest.agent> {
  const agent = agents.get(app);
  if (!agent) throw new Error('Call authenticateTestAdmin in beforeAll');
  return agent;
}
