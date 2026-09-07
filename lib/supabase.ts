import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://msrbonxwkcuiyezmldzj.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1zcmJvbnh3a2N1aXllem1sZHpqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg3NjA1ODIsImV4cCI6MjEwNDMzNjU4Mn0.Ks9UXzHVAO3xTExpguGOmrayiC9-Wc9wl9JhB3f1oKw';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1zcmJvbnh3a2N1aXllem1sZHpqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4ODc2MDU4MiwiZXhwIjoyMTA0MzM2NTgyfQ.9JVU5bAZbvHzI01VwFzZBsQvjSOCzCcg48KuEIKA3gM';

// Public Supabase client for client-side queries
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Admin Supabase client for backend/API routes with full access
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});
