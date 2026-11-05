import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { ApiCustomer } from '@gridfinity/shared';
import { CustomerProvider, useCustomers } from './CustomerContext';
import { createTestQueryClient } from '../test/testWrapper';

const STORAGE_KEY = 'gridfinity_selected_customer_id';

function customer(id: number, name: string): ApiCustomer {
  return { id, name, createdAt: '', updatedAt: '' };
}

let serverCustomers: ApiCustomer[];
let fetchMock: ReturnType<typeof vi.fn>;

function json(body: unknown, status = 200): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), { status });
}

beforeEach(() => {
  localStorage.clear();
  serverCustomers = [customer(1, 'Acme'), customer(2, 'Globex')];
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const id = Number(url.split('/').pop());
    if (method === 'GET') return json({ data: serverCustomers });
    if (method === 'POST') {
      const created = customer(99, JSON.parse(String(init?.body)).name as string);
      serverCustomers = [...serverCustomers, created];
      return json({ data: created }, 201);
    }
    if (method === 'PUT') {
      const updated = customer(id, JSON.parse(String(init?.body)).name as string);
      serverCustomers = serverCustomers.map(c => (c.id === id ? updated : c));
      return json({ data: updated });
    }
    serverCustomers = serverCustomers.filter(c => c.id !== id);
    return json(null, 204);
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderCustomers() {
  const queryClient = createTestQueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <CustomerProvider>{children}</CustomerProvider>
    </QueryClientProvider>
  );
  return renderHook(() => useCustomers(), { wrapper });
}

describe('CustomerContext', () => {
  it('throws outside the provider', () => {
    expect(() => renderHook(() => useCustomers())).toThrow(/within CustomerProvider/);
  });

  it('loads customers and persists the selection', async () => {
    const { result } = renderCustomers();
    await waitFor(() => expect(result.current.customers).toHaveLength(2));
    expect(result.current.selectedCustomer).toBeNull();

    act(() => result.current.setSelectedCustomerId(2));
    expect(result.current.selectedCustomer?.name).toBe('Globex');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('2');

    act(() => result.current.setSelectedCustomerId(null));
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('restores the stored selection', async () => {
    localStorage.setItem(STORAGE_KEY, '1');
    const { result } = renderCustomers();
    await waitFor(() => expect(result.current.selectedCustomer?.name).toBe('Acme'));
  });

  it('drops a stored selection that no longer exists', async () => {
    localStorage.setItem(STORAGE_KEY, '42');
    const { result } = renderCustomers();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.selectedCustomer).toBeNull();
    await waitFor(() => expect(localStorage.getItem(STORAGE_KEY)).toBeNull());
  });

  it('creates and renames customers, refetching the list', async () => {
    const { result } = renderCustomers();
    await waitFor(() => expect(result.current.customers).toHaveLength(2));

    await act(async () => { await result.current.createCustomer('Initech'); });
    await waitFor(() => expect(result.current.customers.map(c => c.name)).toContain('Initech'));

    await act(async () => { await result.current.updateCustomer(1, 'Acme Corp'); });
    await waitFor(() => expect(result.current.customers.map(c => c.name)).toContain('Acme Corp'));
  });

  it('keeps a newly created customer selected while the list refetches', async () => {
    const { result } = renderCustomers();
    await waitFor(() => expect(result.current.customers).toHaveLength(2));

    await act(async () => {
      const created = await result.current.createCustomer('Initech');
      result.current.setSelectedCustomerId(created.id);
    });

    expect(result.current.selectedCustomer?.name).toBe('Initech');
    await waitFor(() => expect(result.current.customers).toHaveLength(3));
    expect(localStorage.getItem(STORAGE_KEY)).toBe('99');
  });

  it('clears the selection when the selected customer is deleted', async () => {
    localStorage.setItem(STORAGE_KEY, '2');
    const { result } = renderCustomers();
    await waitFor(() => expect(result.current.selectedCustomer?.id).toBe(2));

    await act(async () => { await result.current.deleteCustomer(2); });
    await waitFor(() => expect(result.current.customers).toHaveLength(1));
    expect(result.current.selectedCustomer).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});
