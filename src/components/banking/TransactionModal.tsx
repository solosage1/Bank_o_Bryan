'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { format } from 'date-fns';
import { CalendarDays, DollarSign, Minus, Plus } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';

const transactionSchema = z.object({
  amount: z
    .string()
    .min(1, 'Amount is required')
    .refine(
      (val) => {
        const num = parseFloat(val);
        return !isNaN(num) && num > 0;
      },
      'Amount must be a positive number'
    ),
  description: z
    .string()
    .min(1, 'Description is required')
    .max(200, 'Description must be less than 200 characters'),
  transactionDate: z.date({
    required_error: 'Transaction date is required',
  }),
});

type TransactionFormData = z.infer<typeof transactionSchema>;

interface TransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  childId: string;
  childName: string;
  accountId: string;
  type: 'deposit' | 'withdrawal';
  onSuccess: () => void;
}

export function TransactionModal({
  isOpen,
  onClose,
  childId,
  childName,
  accountId,
  type,
  onSuccess
}: TransactionModalProps) {
  const { parent } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<TransactionFormData>({
    resolver: zodResolver(transactionSchema),
    defaultValues: {
      amount: '',
      description: '',
      transactionDate: new Date(),
    },
  });

  const onSubmit = async (data: TransactionFormData) => {
    if (!parent) return;

    try {
      setIsSubmitting(true);

      const { error } = await supabase.rpc('process_transaction', {
        p_account_id: accountId,
        p_type: type,
        p_amount: parseFloat(data.amount),
        p_description: data.description,
        p_parent_id: parent.id,
        p_transaction_date: format(data.transactionDate, 'yyyy-MM-dd')
      });

      if (error) throw error;

      // Log audit event
      if (parent.family_id) {
        await supabase.rpc('log_audit_event', {
          p_family_id: parent.family_id,
          p_user_type: 'parent',
          p_user_id: parent.id,
          p_action: `${type === 'deposit' ? 'Deposited' : 'Withdrew'} $${data.amount} ${type === 'deposit' ? 'to' : 'from'} ${childName}'s account`,
          p_entity_type: 'transaction',
          p_entity_id: accountId,
          p_metadata: {
            amount: parseFloat(data.amount),
            description: data.description,
            child_id: childId,
            transaction_date: format(data.transactionDate, 'yyyy-MM-dd')
          }
        });
      }

      form.reset();
      onSuccess();
      onClose();
    } catch (error) {
      console.error('Transaction error:', error);
      form.setError('root', {
        message: error instanceof Error ? error.message : 'Failed to process transaction'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const modalTitle = type === 'deposit' ? 'Make Deposit' : 'Make Withdrawal';
  const modalDescription = `${type === 'deposit' ? 'Add money to' : 'Remove money from'} ${childName}'s account`;
  const ButtonIcon = type === 'deposit' ? Plus : Minus;
  const buttonColor = type === 'deposit' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700';

  return (
    <AnimatePresence>
      {isOpen && (
        <Dialog open={isOpen} onOpenChange={onClose}>
          <DialogContent className="sm:max-w-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
            >
              <DialogHeader>
                <DialogTitle className="flex items-center space-x-2">
                  <div className={cn(
                    'w-8 h-8 rounded-full flex items-center justify-center',
                    type === 'deposit' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'
                  )}>
                    <ButtonIcon className="w-4 h-4" />
                  </div>
                  <span>{modalTitle}</span>
                </DialogTitle>
                <DialogDescription>
                  {modalDescription}
                </DialogDescription>
              </DialogHeader>

              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <FormField
                    control={form.control}
                    name="amount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Amount</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                            <Input
                              placeholder="0.00"
                              type="number"
                              step="0.01"
                              min="0.01"
                              max="10000"
                              className="pl-10"
                              {...field}
                            />
                          </div>
                        </FormControl>
                        <FormDescription>
                          Enter the amount to {type}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Description</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder={`Reason for ${type}...`}
                            rows={3}
                            {...field}
                          />
                        </FormControl>
                        <FormDescription>
                          Brief description of this transaction
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="transactionDate"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>Transaction Date</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant="outline"
                                className={cn(
                                  'w-full pl-3 text-left font-normal',
                                  !field.value && 'text-muted-foreground'
                                )}
                              >
                                {field.value ? (
                                  format(field.value, 'PPP')
                                ) : (
                                  <span>Pick a date</span>
                                )}
                                <CalendarDays className="ml-auto h-4 w-4 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={field.value}
                              onSelect={field.onChange}
                              disabled={(date) =>
                                date > new Date() || date < new Date('1900-01-01')
                              }
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                        <FormDescription>
                          When did this transaction occur?
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {form.formState.errors.root && (
                    <div className="text-sm text-red-600 bg-red-50 p-3 rounded-md">
                      {form.formState.errors.root.message}
                    </div>
                  )}

                  <div className="flex space-x-3 pt-4">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={onClose}
                      disabled={isSubmitting}
                      className="flex-1"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={isSubmitting}
                      className={cn('flex-1', buttonColor)}
                    >
                      {isSubmitting ? (
                        <div className="flex items-center space-x-2">
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          <span>Processing...</span>
                        </div>
                      ) : (
                        <div className="flex items-center space-x-2">
                          <ButtonIcon className="w-4 h-4" />
                          <span>{modalTitle}</span>
                        </div>
                      )}
                    </Button>
                  </div>
                </form>
              </Form>
            </motion.div>
          </DialogContent>
        </Dialog>
      )}
    </AnimatePresence>
  );
}