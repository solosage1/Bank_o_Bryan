import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');

  // If we ever receive a code param here, redirect to root; client-side OAuth handles session
  // This is a no-op placeholder now that auth-helpers are removed.

  // Redirect to dashboard or onboarding
  return NextResponse.redirect(`${requestUrl.origin}/dashboard`);
}