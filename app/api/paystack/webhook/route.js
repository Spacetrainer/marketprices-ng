import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

export async function POST(request) {
  const secret = process.env.PAYSTACK_SECRET_KEY

  // 1. Read the raw body exactly as Paystack sent it (needed for the signature check)
  const rawBody = await request.text()

  // 2. Verify the signature so we know it's really from Paystack
  const signature = request.headers.get('x-paystack-signature')
  const hash = crypto.createHmac('sha512', secret).update(rawBody).digest('hex')

  if (hash !== signature) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  // 3. Now it's safe to read the event
  let event
  try {
    event = JSON.parse(rawBody)
  } catch (err) {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const type = event.event
  const data = event.data || {}

  // Find which user this event belongs to
  async function findProfileId() {
    const metaUserId = data?.metadata?.user_id
    if (metaUserId) return metaUserId

    const email = data?.customer?.email
    if (!email) return null

    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', email)
      .single()

    return profile?.id || null
  }

  try {
    // Payment succeeded or subscription created -> activate
    if (type === 'charge.success' || type === 'subscription.create') {
      const profileId = await findProfileId()
      if (profileId) {
        let periodEnd
        if (data?.next_payment_date) {
          periodEnd = data.next_payment_date
        } else {
          const d = new Date()
          d.setDate(d.getDate() + 30)
          periodEnd = d.toISOString()
        }

        const customerCode = data?.customer?.customer_code || null

        await supabase
          .from('profiles')
          .update({
            subscription_status: 'active',
            current_period_end: periodEnd,
            ...(customerCode ? { paystack_customer_code: customerCode } : {}),
          })
          .eq('id', profileId)
      }
    }

    // Subscription stopped or will not renew -> cancelled
    if (type === 'subscription.disable' || type === 'subscription.not_renew') {
      const profileId = await findProfileId()
      if (profileId) {
        await supabase
          .from('profiles')
          .update({ subscription_status: 'cancelled' })
          .eq('id', profileId)
      }
    }

    // A renewal payment failed -> past_due
    if (type === 'invoice.payment_failed') {
      const profileId = await findProfileId()
      if (profileId) {
        await supabase
          .from('profiles')
          .update({ subscription_status: 'past_due' })
          .eq('id', profileId)
      }
    }

    return NextResponse.json({ received: true }, { status: 200 })
  } catch (err) {
    console.error('Webhook handler error:', err)
    return NextResponse.json({ error: 'Handler error' }, { status: 500 })
  }
}