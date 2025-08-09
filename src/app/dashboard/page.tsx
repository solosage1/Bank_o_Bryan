"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Settings, LogOut, Users, DollarSign } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BalanceTicker } from '@/components/banking/BalanceTicker';
import { TransactionModal } from '@/components/banking/TransactionModal';
import { useAuth } from '@/hooks/useAuth';
import { track } from '@/components/analytics/track';
import { supabase } from '@/lib/supabase';
import type { ChildWithAccount } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { useFamilyInterestTiers } from '@/hooks/useFamilyInterestTiers';

export default function DashboardPage() {
  const router = useRouter();
  const { user, parent, family, loading: authLoading, signOut } = useAuth();
  const isBypass =
    process.env.NEXT_PUBLIC_E2E_BYPASS_AUTH === '1' ||
    (typeof window !== 'undefined' && (
      new URLSearchParams(window.location.search).get('e2e') === '1' ||
      window.localStorage.getItem('E2E_BYPASS') === '1'
    ));
  const { toast } = useToast();
  const [children, setChildren] = useState<ChildWithAccount[]>([]);
  const [isFetching, setIsFetching] = useState<boolean>(false);
  const [transactionModal, setTransactionModal] = useState<{
    isOpen: boolean;
    childId: string;
    childName: string;
    accountId: string;
    type: 'deposit' | 'withdrawal';
  } | null>(null);
  const [isAddChildOpen, setIsAddChildOpen] = useState<boolean>(false);
  const [newChild, setNewChild] = useState<{ name: string; age?: string; nickname?: string }>({ name: '', age: '', nickname: '' });
  const [isCreatingChild, setIsCreatingChild] = useState<boolean>(false);
  const [createChildError, setCreateChildError] = useState<string | null>(null);

  // Fetch active tiers for ticker display
  const { tiers: familyTiers } = useFamilyInterestTiers(family?.id);

  // Fetch children and their accounts (stabilize on familyId to avoid effect loops)
  const familyId = family?.id;
  const fetchChildren = useCallback(async () => {
    try {
      let query = supabase
        .from('children')
        .select(`
          *,
          account:accounts(*)
        `);

      // In normal mode, scope to family; in bypass, allow global fetch for route interception
      if (familyId && !isBypass) {
        query = query.eq('family_id', familyId);
      }

      const { data, error } = await query.order('created_at', { ascending: true });
      if (error) throw error;
      setChildren(data || []);
    } catch (error) {
      console.error('Error fetching children:', error);
    }
  }, [familyId, isBypass]);

  // Route guarding based on auth state
  useEffect(() => {
    if (isBypass) return;
    if (authLoading) return;

    if (!user) {
      router.replace('/');
      return;
    }

    if (user && !family) {
      track('projection_viewed', { note: 'redirect_to_onboarding_due_to_missing_family' });
      router.replace('/onboarding');
    }
  }, [authLoading, user, family, router, isBypass]);

  // Fetch data when a family context exists (and auth is resolved)
  useEffect(() => {
    if (authLoading) return;

    const run = async () => {
      setIsFetching(true);
      try {
        await fetchChildren();
      } finally {
        setIsFetching(false);
      }
    };

    // If there is no family (e.g., not onboarded), we still want to stop fetching state
    if (!familyId) {
      setIsFetching(false);
      return;
    }

    run();
  }, [authLoading, familyId, fetchChildren]);

  const openTransactionModal = (
    childId: string, 
    childName: string, 
    accountId: string, 
    type: 'deposit' | 'withdrawal'
  ) => {
    setTransactionModal({
      isOpen: true,
      childId,
      childName,
      accountId,
      type
    });
  };

  const closeTransactionModal = () => {
    setTransactionModal(null);
  };

  const handleTransactionSuccess = () => {
    fetchChildren(); // Refresh data
  };

  const openAddChild = () => {
    setNewChild({ name: '', age: '', nickname: '' });
    setCreateChildError(null);
    setIsAddChildOpen(true);
  };

  const createChildAndAccount = async () => {
    if (!family && !isBypass) return;
    if (!newChild.name.trim()) return;
    try {
      setIsCreatingChild(true);
      setCreateChildError(null);
      track('child_added', { phase: 'attempt', source: 'dashboard', has_age: Boolean(newChild.age), has_nickname: Boolean(newChild.nickname) });

      // Build payload; in bypass without family, omit family_id to allow intercepted REST to accept
      const payload: any = {
        name: newChild.name.trim(),
        age: newChild.age ? Number(newChild.age) : null,
        nickname: newChild.nickname?.trim() || null,
      };
      if (family) {
        payload.family_id = family.id;
      }

      const { data: childRow, error: childErr } = await supabase
        .from('children')
        .insert(payload)
        .select('id, name')
        .single();

      if (childErr) throw childErr;

      if (childRow?.id) {
        // Insert minimal account row to satisfy both legacy and PRD schemas (best-effort)
        try {
          const { error: acctErr } = await supabase
            .from('accounts')
            .insert({ child_id: childRow.id });
          if (acctErr) {
            throw acctErr;
          }
        } catch (acctError) {
          const message = acctError instanceof Error ? acctError.message : 'Failed to create account';
          toast({ title: 'Account creation failed', description: message, variant: 'destructive' });
        }

        // Audit (best-effort)
        if (family?.id) {
          try {
            await supabase.rpc('log_audit_event', {
              p_family_id: family.id,
              p_user_type: 'parent',
              p_user_id: parent?.id ?? '',
              p_action: 'Created child',
              p_entity_type: 'child',
              p_entity_id: childRow.id,
              p_metadata: { name: childRow.name },
            });
          } catch (_) { /* noop */ }
        }

        track('child_added', { phase: 'success', child_id: childRow.id });
        toast({ title: 'Child created', description: `${childRow.name} was added to your family.` });
        setIsAddChildOpen(false);
        await fetchChildren();
        return;
      }
      // Fallback: if no id returned, treat as error
      throw new Error('Child creation returned no id');
    } catch (error) {
      console.error('Error creating child:', error);
      track('child_added', { phase: 'error', message: error instanceof Error ? error.message : String(error) });
      const message = error instanceof Error ? error.message : 'Failed to create child';
      setCreateChildError(message);
      toast({ title: 'Failed to create child', description: message, variant: 'destructive' });
    } finally {
      setIsCreatingChild(false);
    }
  };

  const createAccountForChild = async (childId: string, childName: string) => {
    try {
      const { error } = await supabase.from('accounts').insert({ child_id: childId });
      if (error) throw error;
      toast({ title: 'Account created', description: `Account for ${childName} is ready.` });
      await fetchChildren();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create account';
      toast({ title: 'Account creation failed', description: message, variant: 'destructive' });
    }
  };

  if (authLoading || isFetching) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading dashboard...</p>
          <button
            className="mt-4 px-3 py-2 rounded-md border border-gray-300 text-gray-700 text-sm hover:bg-gray-50"
            onClick={async () => {
              try {
                await supabase.auth.signOut();
              } finally {
                router.replace('/');
              }
            }}
          >
            Reset session
          </button>
        </div>
      </div>
    );
  }

  // Graceful state: signed-in but no family (should have been redirected but in case guard missed)
  if (!isBypass && user && !family) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-700 mb-4">Your account needs onboarding before viewing the dashboard.</p>
          <button
            className="px-4 py-2 rounded-md bg-blue-600 text-white"
            onClick={() => router.replace('/onboarding')}
          >
            Go to Onboarding
          </button>
        </div>
      </div>
    );
  }

  const totalFamilyBalance = children.reduce((sum, child) => {
    return sum + (child.account?.balance || 0);
  }, 0);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              {family?.name} Dashboard
            </h1>
            <p className="text-gray-600">
              Welcome back, {parent?.name}! Manage your family&apos;s virtual banking.
            </p>
          </div>
          <div className="flex items-center space-x-3">
            <Button variant="outline" size="sm" onClick={() => router.push('/settings')}>
              <Settings className="w-4 h-4 mr-2" />
              Settings
            </Button>
            <Button variant="outline" size="sm" onClick={signOut}>
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card className="border-0 shadow-md">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600 uppercase tracking-wide">
                Total Family Balance
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                  <DollarSign className="w-4 h-4 text-green-600" />
                </div>
                <div className="text-2xl font-bold text-gray-900">
                  {formatCurrency(totalFamilyBalance)}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-md">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600 uppercase tracking-wide">
                Active Children
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                  <Users className="w-4 h-4 text-blue-600" />
                </div>
                <div className="text-2xl font-bold text-gray-900">
                  {children.length}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-md">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600 uppercase tracking-wide">
                Timezone
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900">
                {family?.timezone?.replace('America/', '').replace('_', ' ')}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Children Cards */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-900">Children&apos;s Accounts</h2>
            <Button className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700" onClick={openAddChild}>
              <Plus className="w-4 h-4 mr-2" />
              Add Child
            </Button>
          </div>

          {children.length === 0 ? (
            <Card className="border-2 border-dashed border-gray-300">
              <CardContent className="text-center py-12">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Users className="w-8 h-8 text-gray-400" />
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  No children added yet
                </h3>
                <p className="text-gray-600 mb-6">
                  Add your first child to start their banking journey!
                </p>
                <Button className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700" onClick={openAddChild}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Your First Child
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <AnimatePresence>
                {children.map((child, index) => (
                  <motion.div
                    key={child.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: index * 0.1 }}
                  >
                    <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow duration-200">
                      <CardHeader className="pb-4">
                        <div className="flex items-center space-x-3">
                          <div className="w-12 h-12 bg-gradient-to-br from-purple-400 to-pink-400 rounded-full flex items-center justify-center">
                            <span className="text-white font-bold text-lg">
                              {child.name.charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <div>
                            <CardTitle className="text-lg">{child.name}</CardTitle>
                            <CardDescription>Age {child.age}</CardDescription>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {child.account ? (
                          <>
                            <div className="bg-gray-50 rounded-xl p-4">
                              <BalanceTicker
                                accountId={child.account.id}
                                initialBalanceCents={Math.round((child.account.balance || 0) * 100)}
                                tiers={(familyTiers ?? []).map(t => ({ lower_cents: t.lower_cents, upper_cents: t.upper_cents ?? undefined, apr_bps: t.apr_bps }))}
                                size="md"
                                showIcon={false}
                                className="justify-center"
                              />
                            </div>
                            <div className="flex space-x-2">
                              <Button
                                size="sm"
                                className="flex-1 bg-green-600 hover:bg-green-700"
                                onClick={() => openTransactionModal(
                                  child.id,
                                  child.name,
                                  child.account!.id,
                                  'deposit'
                                )}
                              >
                                <Plus className="w-4 h-4 mr-1" />
                                Deposit
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="flex-1"
                                onClick={() => openTransactionModal(
                                  child.id,
                                  child.name,
                                  child.account!.id,
                                  'withdrawal'
                                )}
                              >
                                <Plus className="w-4 h-4 mr-1 rotate-45" />
                                Withdraw
                              </Button>
                            </div>
                          </>
                        ) : (
                          <div className="text-center py-4">
                            <p className="text-gray-500 mb-3">No account created</p>
                            <Button size="sm" variant="outline" onClick={() => createAccountForChild(child.id, child.name)}>
                              Create Account
                            </Button>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>

      {/* Transaction Modal */}
      {transactionModal && (
        <TransactionModal
          isOpen={transactionModal.isOpen}
          onClose={closeTransactionModal}
          childId={transactionModal.childId}
          childName={transactionModal.childName}
          accountId={transactionModal.accountId}
          type={transactionModal.type}
          onSuccess={handleTransactionSuccess}
        />
      )}

      {/* Add Child Modal */}
      <Dialog open={isAddChildOpen} onOpenChange={setIsAddChildOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Child</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                placeholder="e.g., Avery"
                value={newChild.name}
                onChange={(e) => setNewChild((s) => ({ ...s, name: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="age">Age (optional)</Label>
                <Input
                  id="age"
                  type="number"
                  min={0}
                  max={21}
                  placeholder="12"
                  value={newChild.age}
                  onChange={(e) => setNewChild((s) => ({ ...s, age: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="nickname">Nickname (optional)</Label>
                <Input
                  id="nickname"
                  placeholder="Ave"
                  value={newChild.nickname}
                  onChange={(e) => setNewChild((s) => ({ ...s, nickname: e.target.value }))}
                />
              </div>
            </div>
            {createChildError && (
              <div className="text-sm text-red-600 bg-red-50 p-2 rounded-md" role="alert">
                {createChildError}
              </div>
            )}
            <div className="flex justify-end space-x-2 pt-2">
              <Button variant="outline" onClick={() => setIsAddChildOpen(false)} disabled={isCreatingChild}>Cancel</Button>
              <Button onClick={createChildAndAccount} disabled={isCreatingChild || !newChild.name.trim()}>
                {isCreatingChild ? (
                  <span className="flex items-center space-x-2">
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Creating...</span>
                  </span>
                ) : (
                  <span className="flex items-center">
                    <Plus className="w-4 h-4 mr-2" />
                    Create Child
                  </span>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}