import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import type { ApiCustomer } from '@gridfinity/shared';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchCustomers,
  createCustomerApi,
  updateCustomerApi,
  deleteCustomerApi,
} from '../api/customers.api';

const STORAGE_KEY = 'gridfinity_selected_customer_id';

interface CustomerContextValue {
  customers: ApiCustomer[];
  isLoading: boolean;
  selectedCustomer: ApiCustomer | null;
  setSelectedCustomerId: (id: number | null) => void;
  createCustomer: (name: string) => Promise<ApiCustomer>;
  updateCustomer: (id: number, name: string) => Promise<ApiCustomer>;
  deleteCustomer: (id: number) => Promise<void>;
}

const CustomerContext = createContext<CustomerContextValue | null>(null);

// eslint-disable-next-line react-refresh/only-export-components
export function useCustomers(): CustomerContextValue {
  const context = useContext(CustomerContext);
  if (!context) throw new Error('useCustomers must be used within CustomerProvider');
  return context;
}

export function CustomerProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  const [selectedCustomerId, setSelectedCustomerIdState] = useState<number | null>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? parseInt(stored, 10) : null;
  });

  const { data: customers = [], isLoading } = useQuery({
    queryKey: ['customers'],
    queryFn: fetchCustomers,
  });

  // Persist selection to localStorage
  const setSelectedCustomerId = useCallback((id: number | null) => {
    setSelectedCustomerIdState(id);
    if (id === null) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, String(id));
    }
  }, []);

  // If stored customer no longer exists in list, clear selection
  useEffect(() => {
    if (!isLoading && selectedCustomerId !== null) {
      const exists = customers.some((c) => c.id === selectedCustomerId);
      if (!exists) {
        setSelectedCustomerId(null);
      }
    }
  }, [customers, isLoading, selectedCustomerId, setSelectedCustomerId]);

  const selectedCustomer = customers.find((c) => c.id === selectedCustomerId) ?? null;

  const createMutation = useMutation({
    mutationFn: (name: string) => createCustomerApi(name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) => updateCustomerApi(id, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteCustomerApi(id),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      if (selectedCustomerId === id) {
        setSelectedCustomerId(null);
      }
    },
  });

  const createCustomer = useCallback((name: string) => createMutation.mutateAsync(name), [createMutation]);
  const updateCustomer = useCallback((id: number, name: string) => updateMutation.mutateAsync({ id, name }), [updateMutation]);
  const deleteCustomer = useCallback((id: number) => deleteMutation.mutateAsync(id), [deleteMutation]);

  return (
    <CustomerContext.Provider
      value={{
        customers,
        isLoading,
        selectedCustomer,
        setSelectedCustomerId,
        createCustomer,
        updateCustomer,
        deleteCustomer,
      }}
    >
      {children}
    </CustomerContext.Provider>
  );
}
