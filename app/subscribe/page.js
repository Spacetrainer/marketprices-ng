'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function SubscribePage() {
  const router = useRouter()
  const [error, setError] = useState('')

  useEffect(() => {
    async function startPayment() {
      try {
        const response = await fetch('/api/paystack/initialize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
        const data = await response.json()
        if (!response.ok) {
          if (response.status === 401) { router.push('/login'); return }
          setError(data.error || 'Could not start the payment.')
          return
        }
        if (!data.authorization_url) {
          setError('No checkout URL returned. Please try again.')
          return
        }
        window.location.href = data.authorization_url
      } catch (err) {
        console.error('Subscribe page error:', err)
        setError('Something went wrong. Please try again.')
      }
    }
    startPayment()
  }, [router])

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8">
      <div className="w-full max-w-sm text-center">
        {error ? (
          <>
            <h1 className="text-2xl font-medium mb-2">Payment couldn&apos;t start</h1>
            <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2 mb-6">{error}</p>
            <a href="/account" className="inline-block text-sm underline">Back to your account</a>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-medium mb-2">Starting payment...</h1>
            <p className="text-sm text-gray-600">You&apos;re being redirected to our secure payment provider.</p>
          </>
        )}
      </div>
    </main>
  )
}
