import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// POST /api/paystack/initialize
//
// Server-side endpoint that:
// 1. Verifies the user is logged in (returns 401 if not)
// 2. Calls Paystack's API to initialize a transaction
// 3. Returns the Paystack-hosted checkout URL to the browser
//
// The browser then redirects the user to that URL to complete payment.

export async function POST(request) {
  try {
    // Step 1: Get the currently logged-in user from Supabase session cookies.
    const supabase = await createClient()
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json(
        { error: 'You must be logged in to subscribe.' },
        { status: 401 }
      )
    }

    // Step 2: Read Paystack config from environment variables.
    const secretKey = process.env.PAYSTACK_SECRET_KEY
    const planCode = process.env.NEXT_PUBLIC_PAYSTACK_PLAN_CODE

    if (!secretKey || !planCode) {
      console.error('Missing Paystack environment variables')
      return NextResponse.json(
        { error: 'Server configuration error. Please try again later.' },
        { status: 500 }
      )
    }

    // Step 3: Determine the callback URL Paystack should redirect to after payment.
    // We use the request's own origin so this works in both dev and production
    // without needing a separate env var.
    const origin = request.headers.get('origin') || request.headers.get('referer') || ''
    const callbackUrl = `${origin.replace(/\/$/, '')}/account?payment=completed`

    // Step 4: Call Paystack's transaction initialize endpoint.
    // Amount is in kobo (1 NGN = 100 kobo). 3500 NGN = 350000 kobo.
    // We pass the plan code so this becomes a recurring subscription.
    const paystackResponse = await fetch(
      'https://api.paystack.co/transaction/initialize',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${secretKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: user.email,
          amount: 350000, // ₦3,500 in kobo
          plan: planCode,
          callback_url: callbackUrl,
          metadata: {
            user_id: user.id,
          },
        }),
      }
    )

    const paystackData = await paystackResponse.json()

    if (!paystackData.status) {
      console.error('Paystack init failed:', paystackData)
      return NextResponse.json(
        { error: paystackData.message || 'Could not start the payment.' },
        { status: 500 }
      )
    }

    // Step 5: Return the authorization URL so the browser can redirect to it.
    return NextResponse.json({
      authorization_url: paystackData.data.authorization_url,
    })
  } catch (err) {
    console.error('Initialize route error:', err)
    return NextResponse.json(
      { error: 'Something went wrong. Please try again.' },
      { status: 500 }
    )
  }
}