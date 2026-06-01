'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function AccountPage() {
  const router = useRouter()
  const supabase = createClient()

  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loggingOut, setLoggingOut] = useState(false)

  useEffect(() => {
    async function loadUser() {
      const { data, error } = await supabase.auth.getUser()

      if (error || !data?.user) {
        router.push('/login')
        return
      }

      setUser(data.user)

      const { data: profileData } = await supabase
        .from('profiles')
        .select('subscription_status, current_period_end')
        .eq('id', data.user.id)
        .single()

      setProfile(profileData)
      setLoading(false)
    }

    loadUser()
  }, [router, supabase])

  async function handleLogout() {
    setLoggingOut(true)
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  function formatDate(iso) {
    if (!iso) return null
    return new Date(iso).toLocaleDateString('en-NG', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center p-8">
        <p className="text-sm text-gray-600">Loading...</p>
      </main>
    )
  }

  const status = profile?.subscription_status || 'free'
  const periodEnd = formatDate(profile?.current_period_end)
  const isActive = status === 'active'

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8">
      <div className="w-full max-w-sm">
        <h1 className="text-3xl font-medium mb-2 text-center">Your account</h1>
        <p className="text-gray-600 text-sm mb-8 text-center">
          marketprices.ng — Nigerian food markets, in one place.
        </p>

        <div className="border border-gray-200 rounded p-4 mb-6">
          <p className="text-xs text-gray-500 mb-1">Signed in as</p>
          <p className="text-sm font-medium break-all">{user.email}</p>
        </div>

        <div className="border border-gray-200 rounded p-4 mb-6">
          <p className="text-xs text-gray-500 mb-1">Subscription</p>

          {isActive ? (
            <>
              <p className="text-sm font-medium text-green-700">Active subscription</p>
              {periodEnd ? (
                <p className="text-xs text-gray-500 mt-2">Renews on {periodEnd}.</p>
              ) : null}
            </>
          ) : (
            <>
              <p className="text-sm font-medium">
                {status === 'past_due' ? 'Payment past due' : status === 'cancelled' ? 'Subscription cancelled' : 'Free account'}
              </p>
              <p className="text-xs text-gray-500 mt-2 mb-3">
                Subscribe for ₦3,500/month to unlock Prices, Vendor contacts, and Experience.
              </p>
              <a href="/subscribe" className="block w-full text-center bg-black text-white rounded px-4 py-2 text-sm font-medium">Upgrade to Premium — ₦3,500/month</a>
            </>
          )}
        </div>

        <button
          onClick={handleLogout}
          disabled={loggingOut}
          className="w-full border border-gray-300 rounded px-4 py-2 text-sm font-medium"
        >
          {loggingOut ? 'Logging out...' : 'Log out'}
        </button>
      </div>
    </main>
  )
}