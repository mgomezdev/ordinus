import { render, screen, within, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AdminSubmissionsDialog } from './AdminSubmissionsDialog';
import type { ApiLayout } from '@gridfinity/shared';

vi.mock('../../hooks/useAdminLayouts', () => ({
  useAdminLayoutsQuery: vi.fn(),
  useDeliverLayoutMutation: vi.fn(() => ({
    mutateAsync: vi.fn(),
    isPending: false,
  })),
}));

vi.mock('../../hooks/useLayouts', () => ({
  useCloneLayoutMutation: vi.fn(() => ({
    mutateAsync: vi.fn(),
    isPending: false,
  })),
}));

const mockPromote = vi.fn().mockResolvedValue(undefined);
const mockDeleteStl = vi.fn().mockResolvedValue(undefined);
const mockReprocess = vi.fn().mockResolvedValue(undefined);

vi.mock('../../hooks/useUserStls', () => ({
  useAdminUserStlsQuery: vi.fn(() => ({ data: [], isLoading: false, isError: false, error: null })),
  usePromoteUserStlMutation: vi.fn(() => ({ mutateAsync: mockPromote, isPending: false })),
  useDeleteUserStlMutation: vi.fn(() => ({ mutateAsync: mockDeleteStl, isPending: false })),
  useReprocessUserStlMutation: vi.fn(() => ({ mutateAsync: mockReprocess, isPending: false })),
  useUpdateUserStlMutation: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  useReplaceUserStlFileMutation: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: vi.fn(() => ({
    user: { id: 1, email: 'admin@test.com', username: 'admin', role: 'admin', createdAt: '2026-01-01' },
    isAuthenticated: true,
    isLoading: false,
    getAccessToken: () => 'mock-token',
  })),
}));

vi.mock('../../api/layouts.api', () => ({
  fetchLayout: vi.fn(),
}));

import { useAdminLayoutsQuery } from '../../hooks/useAdminLayouts';
import { useAdminUserStlsQuery } from '../../hooks/useUserStls';
import type { ApiUserStlAdmin } from '@gridfinity/shared';

const mockedUseAdminLayoutsQuery = vi.mocked(useAdminLayoutsQuery);

const now = new Date('2026-02-19T15:00:00Z');

function makeLayout(overrides: Partial<ApiLayout> = {}): ApiLayout {
  return {
    id: 1,
    userId: 1,
    name: 'Test Layout',
    description: null,
    gridX: 4,
    gridY: 4,
    widthMm: 168,
    depthMm: 168,
    spacerHorizontal: 'none',
    spacerVertical: 'none',
    status: 'submitted',
    isPublic: false,
    createdAt: '2026-02-19T12:00:00Z',
    updatedAt: '2026-02-19T12:00:00Z',
    ...overrides,
  };
}

const mockLayouts: ApiLayout[] = [
  makeLayout({ id: 1, name: 'Alpha Layout', ownerUsername: 'Zara', updatedAt: now.toISOString() }),
  makeLayout({ id: 2, name: 'Beta Layout', ownerUsername: 'Alice', updatedAt: new Date('2026-02-18T12:00:00Z').toISOString() }),
  makeLayout({ id: 3, name: 'Gamma Layout', ownerUsername: 'Zara', updatedAt: new Date('2026-02-14T12:00:00Z').toISOString() }),
  makeLayout({ id: 4, name: 'Delta Layout', ownerUsername: 'Bob', status: 'delivered', updatedAt: new Date('2026-01-20T12:00:00Z').toISOString() }),
];

function renderDialog() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <AdminSubmissionsDialog
        isOpen={true}
        onClose={vi.fn()}
        onLoad={vi.fn()}
        hasItems={false}
      />
    </QueryClientProvider>,
  );
}

describe('AdminSubmissionsDialog grouping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(now);
    mockedUseAdminLayoutsQuery.mockReturnValue({
      data: mockLayouts,
      isLoading: false,
      isError: false,
      error: null,
    } as ReturnType<typeof useAdminLayoutsQuery>);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders group-by selector with None, Owner, Last Edited options', () => {
    renderDialog();
    const select = screen.getByLabelText('Group by');
    expect(select).toBeInTheDocument();
    const options = within(select as HTMLElement).getAllByRole('option');
    expect(options.map(o => o.textContent)).toEqual(['None', 'Owner', 'Last Edited']);
  });

  it('defaults to no grouping (flat list, no section headers)', () => {
    renderDialog();
    const select = screen.getByLabelText('Group by') as HTMLSelectElement;
    expect(select.value).toBe('none');
    expect(screen.queryByRole('heading', { level: 3 })).not.toBeInTheDocument();
    expect(screen.getByText('Alpha Layout')).toBeInTheDocument();
    expect(screen.getByText('Beta Layout')).toBeInTheDocument();
  });

  it('groups layouts by owner when Owner is selected', () => {
    renderDialog();
    const select = screen.getByLabelText('Group by');
    fireEvent.change(select, { target: { value: 'owner' } });

    const headers = screen.getAllByRole('heading', { level: 3 });
    const labels = headers.map(h => h.textContent);
    expect(labels).toEqual(['Alice', 'Bob', 'Zara']);
  });

  it('groups layouts by time bucket when Last Edited is selected', () => {
    renderDialog();
    const select = screen.getByLabelText('Group by');
    fireEvent.change(select, { target: { value: 'lastEdited' } });

    const headers = screen.getAllByRole('heading', { level: 3 });
    const labels = headers.map(h => h.textContent);
    expect(labels).toEqual(['Today', 'Yesterday', 'Last 7 Days', 'Last 30 Days']);
  });

  it('displays updatedAt date instead of createdAt', () => {
    // Create a layout where createdAt and updatedAt differ by date
    const dateTestLayouts: ApiLayout[] = [
      makeLayout({
        id: 10,
        name: 'Date Test Layout',
        ownerUsername: 'TestUser',
        createdAt: '2026-01-01T12:00:00Z',
        updatedAt: '2026-02-15T12:00:00Z',
      }),
    ];
    mockedUseAdminLayoutsQuery.mockReturnValue({
      data: dateTestLayouts,
      isLoading: false,
      isError: false,
      error: null,
    } as ReturnType<typeof useAdminLayoutsQuery>);

    renderDialog();

    // Should show Feb 15, 2026 (updatedAt), not Jan 1, 2026 (createdAt)
    expect(screen.getByText('Feb 15, 2026')).toBeInTheDocument();
    expect(screen.queryByText('Jan 1, 2026')).not.toBeInTheDocument();
  });

  it('preserves grouping when filter tab changes', () => {
    renderDialog();

    // Set grouping to Owner
    const select = screen.getByLabelText('Group by');
    fireEvent.change(select, { target: { value: 'owner' } });

    // Verify grouping is applied
    expect(screen.getAllByRole('heading', { level: 3 }).length).toBeGreaterThan(0);

    // Click "All" tab
    const allTab = screen.getByRole('button', { name: 'All' });
    fireEvent.click(allTab);

    // Grouping should still be Owner
    const selectAfter = screen.getByLabelText('Group by') as HTMLSelectElement;
    expect(selectAfter.value).toBe('owner');
  });
});

const mockedUseAdminUserStlsQuery = vi.mocked(useAdminUserStlsQuery);

function makeUserStl(overrides: Partial<ApiUserStlAdmin> = {}): ApiUserStlAdmin {
  return {
    id: 'stl-1',
    userId: 1,
    userName: 'testuser',
    name: 'My Bin',
    originalFilename: 'mybin.stl',
    gridX: 2,
    gridY: 1,
    imageUrl: null,
    perspImageUrls: [],
    status: 'ready',
    errorMessage: null,
    createdAt: '2026-03-01T12:00:00Z',
    updatedAt: '2026-03-01T12:00:00Z',
    ...overrides,
  };
}

describe('AdminSubmissionsDialog User Models tab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedUseAdminLayoutsQuery.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
    } as ReturnType<typeof useAdminLayoutsQuery>);
  });

  it('has a User Models section tab', () => {
    renderDialog();
    expect(screen.getByRole('button', { name: 'User Models' })).toBeInTheDocument();
  });

  it('shows user STL rows when User Models tab is clicked', () => {
    mockedUseAdminUserStlsQuery.mockReturnValue({
      data: [makeUserStl()],
      isLoading: false,
      isError: false,
      error: null,
    } as ReturnType<typeof useAdminUserStlsQuery>);

    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'User Models' }));
    expect(screen.getByText('testuser')).toBeInTheDocument();
    expect(screen.getByText('mybin.stl')).toBeInTheDocument();
    expect(screen.getByText('My Bin')).toBeInTheDocument();
  });

  it('shows Promote button only for ready items', () => {
    mockedUseAdminUserStlsQuery.mockReturnValue({
      data: [
        makeUserStl({ id: 'stl-1', status: 'ready', name: 'Ready Bin' }),
        makeUserStl({ id: 'stl-2', status: 'error', name: 'Error Bin', errorMessage: 'oops' }),
      ],
      isLoading: false,
      isError: false,
      error: null,
    } as ReturnType<typeof useAdminUserStlsQuery>);

    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'User Models' }));
    const promoteButtons = screen.getAllByRole('button', { name: /promote/i });
    expect(promoteButtons).toHaveLength(1);
  });

  it('shows error message inline for error items', () => {
    mockedUseAdminUserStlsQuery.mockReturnValue({
      data: [makeUserStl({ id: 'stl-1', status: 'error', errorMessage: 'Parse failed' })],
      isLoading: false,
      isError: false,
      error: null,
    } as ReturnType<typeof useAdminUserStlsQuery>);

    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'User Models' }));
    expect(screen.getByText('Parse failed')).toBeInTheDocument();
  });

  it('shows empty state when no user models', () => {
    mockedUseAdminUserStlsQuery.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
    } as ReturnType<typeof useAdminUserStlsQuery>);

    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'User Models' }));
    expect(screen.getByText(/no user models/i)).toBeInTheDocument();
  });
});
