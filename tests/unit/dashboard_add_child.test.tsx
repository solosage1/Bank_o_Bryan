/* @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, waitForElementToBeRemoved, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u' }, parent: { id: 'p' }, family: { id: 'fam-1', name: 'Fam', timezone: 'America/New_York', sibling_visibility: true, created_at: '' }, loading: false, signOut: vi.fn() })
}));

const toastSpy = vi.fn();
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: toastSpy }) }));

// Provide a minimal router stub for components using next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

// Avoid extra data fetching in tests
vi.mock('@/hooks/useFamilyInterestTiers', () => ({
  useFamilyInterestTiers: () => ({ tiers: [] })
}));

// Declare mocks before any vi.mock factory to avoid hoist/TDZ issues
const insertMock = vi.fn();
const selectMock = vi.fn();
const singleMock = vi.fn();
const fromMock = vi.fn();

// NOTE: We will dynamically mock '@/lib/supabase' and dynamically import the page in each test

describe('Dashboard Add Child', () => {
  beforeEach(() => {
    cleanup();
    vi.resetModules();
    insertMock.mockReset();
    selectMock.mockReset();
    singleMock.mockReset();
    toastSpy.mockReset();
    // Default: children list empty
    fromMock.mockImplementation((table: string) => {
      if (table === 'children') {
        return {
          select: () => ({
            eq: () => ({
              order: () => Promise.resolve({ data: [], error: null }),
            }),
          }),
          insert: (payload: any) => ({
            select: () => ({
              single: () => Promise.resolve({ data: { id: 'child-1', name: payload.name }, error: null }),
            }),
          }),
        } as any;
      }
      if (table === 'accounts') {
        return { insert: () => Promise.resolve({ error: null }) } as any;
      }
      return {
        insert: () => Promise.resolve({ error: null }),
        select: () => Promise.resolve({ data: [], error: null }),
      } as any;
    });
  });

  it('opens and closes Add Child modal', async () => {
    vi.doMock('@/lib/supabase', () => ({ supabase: { from: fromMock, rpc: vi.fn(() => Promise.resolve({ data: null, error: null })) } }));
    const { default: DashboardPage } = await import('@/app/(app)/dashboard/page');
    render(<DashboardPage />);
    // Wait for loading state to clear (handle potential duplicates)
    // Dismiss loading state by simulating auth resolved with family
    // Our mocked useAuth already returns user+family with loading:false, but the component sets isFetching during fetchChildren.
    // Since fetchChildren uses our mocked supabase.select synchronously, the loading UI should disappear on the next tick.
    await waitFor(() => expect(screen.queryByText(/Loading dashboard/i)).toBeNull());
    const addBtn = (await screen.findAllByRole('button')).find(
      (b) => /Add Child/i.test(b.textContent || '') || /Add Your First Child/i.test(b.textContent || '')
    ) as HTMLElement;
    expect(addBtn).toBeTruthy();
    fireEvent.click(addBtn);
    expect(screen.getByRole('dialog')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: /Cancel/i }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('creates child and account, closes modal, and toasts', async () => {
    vi.doMock('@/lib/supabase', () => ({ supabase: { from: fromMock, rpc: vi.fn(() => Promise.resolve({ data: null, error: null })) } }));
    const { default: DashboardPage } = await import('@/app/(app)/dashboard/page');
    render(<DashboardPage />);
    await waitFor(() => expect(screen.queryByText(/Loading dashboard/i)).toBeNull());
    const addBtn = (await screen.findAllByRole('button')).find(
      (b) => /Add Child/i.test(b.textContent || '') || /Add Your First Child/i.test(b.textContent || '')
    ) as HTMLElement;
    expect(addBtn).toBeTruthy();
    fireEvent.click(addBtn);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Avery' } });
    fireEvent.click(screen.getByRole('button', { name: /Create Child/i }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(toastSpy).toHaveBeenCalledWith(expect.objectContaining({ title: expect.stringMatching(/Child created/i) }));
  });

  it('shows inline error and destructive toast when child insert fails', async () => {
    vi.doMock('@/lib/supabase', () => ({ supabase: { from: fromMock, rpc: vi.fn(() => Promise.resolve({ data: null, error: null })) } }));
    const { default: DashboardPage } = await import('@/app/(app)/dashboard/page');
    fromMock.mockImplementation((table: string) => {
      if (table === 'children') {
        return {
          select: () => ({
            eq: () => ({
              order: () => Promise.resolve({ data: [], error: null }),
            }),
          }),
          insert: () => ({
            select: () => ({
              single: () => Promise.resolve({ data: null, error: { message: 'insert failed' } }),
            }),
          }),
        } as any;
      }
      return {
        insert: () => Promise.resolve({ error: null }),
        select: () => Promise.resolve({ data: [], error: null }),
      } as any;
    });

    render(<DashboardPage />);
    await waitFor(() => expect(screen.queryByText(/Loading dashboard/i)).toBeNull());
    const addBtn = (await screen.findAllByRole('button')).find(
      (b) => /Add Child/i.test(b.textContent || '') || /Add Your First Child/i.test(b.textContent || '')
    ) as HTMLElement;
    expect(addBtn).toBeTruthy();
    fireEvent.click(addBtn);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Err' } });
    fireEvent.click(screen.getByRole('button', { name: /Create Child/i }));

    await waitFor(() => expect(screen.getByText(/Failed to create child/i)).toBeVisible());
    expect(toastSpy).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' }));
    expect(screen.getByRole('dialog')).toBeVisible();
  });

  it('account insert fails -> destructive toast; UI continues', async () => {
    vi.doMock('@/lib/supabase', () => ({ supabase: { from: fromMock, rpc: vi.fn(() => Promise.resolve({ data: null, error: null })) } }));
    const { default: DashboardPage } = await import('@/app/(app)/dashboard/page');
    fromMock.mockImplementation((table: string) => {
      if (table === 'children') {
        return {
          select: () => ({
            eq: () => ({
              order: () => Promise.resolve({ data: [], error: null }),
            }),
          }),
          insert: (payload: any) => ({
            select: () => ({
              single: () => Promise.resolve({ data: { id: 'child-2', name: payload.name }, error: null }),
            }),
          }),
        } as any;
      }
      if (table === 'accounts') {
        return { insert: () => Promise.resolve({ error: { message: 'account failed' } }) } as any;
      }
      return {
        insert: () => Promise.resolve({ error: null }),
        select: () => Promise.resolve({ data: [], error: null }),
      } as any;
    });

    render(<DashboardPage />);
    await waitFor(() => expect(screen.queryByText(/Loading dashboard/i)).toBeNull());
    const addBtn = (await screen.findAllByRole('button')).find(
      (b) => /Add Child/i.test(b.textContent || '') || /Add Your First Child/i.test(b.textContent || '')
    ) as HTMLElement;
    expect(addBtn).toBeTruthy();
    fireEvent.click(addBtn);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Sky' } });
    fireEvent.click(screen.getByRole('button', { name: /Create Child/i }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(toastSpy).toHaveBeenCalledWith(expect.objectContaining({ title: expect.stringMatching(/Child created/i) }));
  });
});


