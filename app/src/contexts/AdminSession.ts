import { createContext, useContext } from 'react';

export const AdminSession = createContext<{ signOut: () => Promise<void> } | null>(null);
export function useAdminSession() { return useContext(AdminSession); }
