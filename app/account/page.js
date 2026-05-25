'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function AccountPage() {
  const router = useRouter()
  const supabase = createClient()

  const [user, setUser] = useState(null)
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

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center p-8">
        <p className="text-sm text-gray-600">Loading...</p>
      </main>
    )
  }

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
          <p className="text-sm font-medium">Free account</p>
          <p className="text-xs text-gray-500 mt-2">
            Subscribe for ₦3,500/month to unlock Prices, Vendor contacts, and
            Experience.
          </p>
        </div>

        <button
          onClick={handleLogout}
          disabled={loggingOut}
          className="w-full border border-gray-300 rounded px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {loggingOut ? 'Logging out...' : 'Log out'}
        </button>
      </div>
    </main>
  )
}