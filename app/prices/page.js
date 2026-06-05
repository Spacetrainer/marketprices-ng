import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getPrices } from '@/lib/prices'
import PricesTable from './PricesTable'

export const dynamic = 'force-dynamic'

const FREE_PREVIEW_ROWS = 5

export default async function PricesPage() {
  // 1. Check who is logged in (server-side, secure)
  const supabase = await createClient()
  const { data: userData } = await supabase.auth.getUser()

  // Not logged in -> send to login
  if (!userData?.user) {
    redirect('/login')
  }

  // 2. Read this user's subscription status from their profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('subscription_status')
    .eq('id', userData.user.id)
    .single()

  const isActive = profile?.subscription_status === 'active'

  // 3. Fetch the prices
  let allPrices = []
  let error = null
  try {
    allPrices = await getPrices()
  } catch (err) {
    console.error('Prices page error:', err)
    error = 'Could not load prices right now. Please try again shortly.'
  }

  // 4. Decide what the browser is allowed to receive.
  //    Free users ONLY get the preview rows — the rest never leave the server.
  const totalCount = allPrices.length
  const visiblePrices = isActive ? allPrices : allPrices.slice(0, FREE_PREVIEW_ROWS)

  return (
    <PricesTable
      prices={visiblePrices}
      isActive={isActive}
      totalCount={totalCount}
      error={error}
    />
  )
}