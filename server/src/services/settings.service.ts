import { client } from '../db/connection.js';

export async function getSetting(key: string): Promise<string> {
  const result = await client.execute({ sql: 'SELECT value FROM settings WHERE key = ?', args: [key] });
  return (result.rows[0]?.value as string) ?? '';
}

export async function setSetting(key: string, value: string): Promise<void> {
  await client.execute({ sql: 'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', args: [key, value] });
}
