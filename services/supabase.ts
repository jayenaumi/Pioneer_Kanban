
import { createClient } from '@supabase/supabase-js';

// Use Vite environment variables (VITE_ prefix) or fallbacks
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://hxfwdosezfvzonhjbqin.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4Zndkb3NlemZ2em9uaGpicWluIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkyNDI3ODQsImV4cCI6MjA4NDgxODc4NH0.ITUisN63ECU1QYXpmfaHhk6abwZ3YmLWQ4xbS4_hoMQ';

export const isSupabaseConfigured = SUPABASE_URL.length > 0 && SUPABASE_ANON_KEY.length > 0;

if (!isSupabaseConfigured) {
  console.warn('Supabase is not configured. The app will run in "Preview Mode" with mock data. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your environment variables to enable real data sync.');
}

export const supabase = createClient(
  SUPABASE_URL || 'https://placeholder.supabase.co', 
  SUPABASE_ANON_KEY || 'placeholder-key'
);
