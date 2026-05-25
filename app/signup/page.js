'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function SignupPage() {
  const router = useRouter()
  const supabase = createClient()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function handleSignup(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    setMessage('')

    const { data, error: signupError } = await supabase.auth.signUp({
      email,
      password,
    })

    setLoading(false)

    if (signupError) {
      setError(signupError.message)
      return
    }

    setMessage(
      'Check your email to confirm your account. Once confirmed, you can log in.'
    )
    setEmail('')
    setPassword('')
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8">
      <div className="w-full max-w-sm">
        <h1 className="text-3xl font-medium mb-2 text-center">Create account</h1>
        <p className="text-gray-600 text-sm mb-8 text-center">
          marketprices.ng — Nigerian food markets, in one place.
        </p>

        <form onSubmit={handleSignup} className="flex flex-col gap-4">
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
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="border border-gray-300 rounded px-3 py-2 text-sm"
              placeholder="At least 8 characters"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="bg-black text-white rounded px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {loading ? 'Creating account...' : 'Create account'}
          </button>
        </form>

        {message && (
          <p className="mt-4 text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">
            {message}
          </p>
        )}

        {error && (
          <p className="mt-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
            {error}
          </p>
        )}

        <p className="mt-6 text-sm text-gray-600 text-center">
          Already have an account?{' '}
          <a href="/login" className="underline">
            Log in
          </a>
        </p>
      </div>
    </main>
  )
}