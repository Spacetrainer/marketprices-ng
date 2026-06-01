import { createClient as createSupabaseClient } from '@supabase/supabase-js'

// Admin Supabase client that uses the SECRET key and bypasses Row Level Security.
//
// SECURITY: This client must ONLY be imported from server-side code
// (API routes, server components, webhooks). NEVER from client components.
// If a client component tries to import this, the SUPABASE_SECRET_KEY env var
// will be undefined (Next.js only ships NEXT_PUBLIC_* vars to the browser)
// and this function will throw — which is the desired behavior.

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const secretKey = process.env.SUPABASE_SECRET_KEY

  if (!url) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set')
  }

  if (!secretKey) {
    throw new Error(
      'SUPABASE_SECRET_KEY is not set. This client cannot be used in browser code.'
    )
  }

  return createSupabaseClient(url, secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}