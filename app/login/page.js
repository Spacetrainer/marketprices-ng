'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleLogin(e) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error: loginError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    setLoading(false)

    if (loginError) {
      setError(loginError.message)
      return
    }

    router.push('/account')
    router.refresh()
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8">
      <div className="w-full max-w-sm">
        <h1 className="text-3xl font-medium mb-2 text-center">Log in</h1>
        <p className="text-gray-600 text-sm mb-8 text-center">
          marketprices.ng — Nigerian food markets, in one place.
        </p>

        <form onSubmit={handleLogin} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="email" className="text-sm font-medium">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="border border-gray-300 rounded px-3 py-2 text-sm"
              placeholder="you@example.com"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="password" className="text-sm font-medium">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="border border-gray-300 rounded px-3 py-2 text-sm"
              placeholder="Your password"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="bg-black text-white rounded px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {loading ? 'Logging in...' : 'Log in'}
          </button>
        </form>

        {error && (
          <p className="mt-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
            {error}
          </p>
        )}

        <p className="mt-6 text-sm text-gray-600 text-center">
          Don&apos;t have an account?{' '}
          <a href="/signup" className="underline">
            Sign up
          </a>
        </p>
      </div>
    </main>
  )
}