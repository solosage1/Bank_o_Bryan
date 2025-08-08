'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Settings, LogOut, Users, DollarSign } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BalanceTicker } from '@/components/banking/BalanceTicker';
import { TransactionModal } from '@/components/banking/TransactionModal';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import type { ChildWithAccount } from '@/types';

export default function DashboardPage() {
  const { parent, family, signOut } = useAuth();
  const [children, setChildren] = useState<ChildWithAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [transactionModal, setTransactionModal] = useState<{
    isOpen: boolean;
    childId: string;
    childName: string;
    accountId: string;
    type: 'deposit' | 'withdrawal';
  } | null>(null);

  // Fetch children and their accounts
  const fetchChildren = async () => {
    if (!family) return;

    try {
      const { data, error } = await supabase
        .from('children')
        .select(`
          *,
          account:accounts(*)
        `)
        .eq('family_id', family.id)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setChildren(data || []);
    } catch (error) {
      console.error('Error fetching children:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (family) {
      fetchChildren();
    }
  }, [family]);

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

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading dashboard...</p>
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
              Welcome back, {parent?.name}! Manage your family's virtual banking.
            </p>
          </div>
          <div className="flex items-center space-x-3">
            <Button variant="outline" size="sm">
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
            <h2 className="text-2xl font-bold text-gray-900">Children's Accounts</h2>
            <Button className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700">
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
                <Button className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700">
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
                                initialBalance={child.account.balance}
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
                            <Button size="sm" variant="outline">
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
    </div>
  );
}