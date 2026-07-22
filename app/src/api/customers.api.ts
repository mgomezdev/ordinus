import type { ApiCustomer } from '@gridfinity/shared';
import { apiFetch } from './apiClient';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export async function fetchCustomers(): Promise<ApiCustomer[]> {
  const result = await apiFetch<{ data: ApiCustomer[] }>('/customers', { headers: JSON_HEADERS });
  return result.data;
}

export async function createCustomerApi(name: string): Promise<ApiCustomer> {
  const result = await apiFetch<{ data: ApiCustomer }>(
    '/customers',
    { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ name }) },
  );
  return result.data;
}

export async function updateCustomerApi(id: number, name: string): Promise<ApiCustomer> {
  const result = await apiFetch<{ data: ApiCustomer }>(
    `/customers/${id}`,
    { method: 'PUT', headers: JSON_HEADERS, body: JSON.stringify({ name }) },
  );
  return result.data;
}

export async function deleteCustomerApi(id: number): Promise<void> {
  await apiFetch<void>(`/customers/${id}`, { method: 'DELETE', headers: JSON_HEADERS });
}
