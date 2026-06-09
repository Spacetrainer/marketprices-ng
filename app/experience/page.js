import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { getExperienceMarkets, photoUrl } from '@/lib/cloudinary'

export const dynamic = 'force-dynamic'

export default async function ExperiencePage() {
  // 1. Figure out who is viewing and whether they're a paying subscriber.
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let isSubscriber = false
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('subscription_status')
      .eq('id', user.id)
      .single()
    isSubscriber = profile?.subscription_status === 'active'
  }

  // 2. Fetch the photos, grouped by market.
  let sections = []
  let error = null
  try {
    sections = await getExperienceMarkets()
  } catch (err) {
    console.error('Experience page error:', err)
    error = 'Could not load the gallery right now. Please try again shortly.'
  }

  return (
    <main className="min-h-screen p-8 max-w-6xl mx-auto">
      <h1 className="text-3xl font-medium mb-2">Experience</h1>
      <p className="text-gray-600 text-sm mb-8">
        Inside Lagos markets — the colour, the produce, and the people behind the prices.
      </p>

      {!isSubscriber ? (
        <div className="border border-green-200 bg-green-50 rounded-lg p-5 mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p className="font-medium text-green-900">Subscriber gallery</p>
            <p className="text-sm text-green-800">
              These photos are blurred. Subscribe to see every market visit in full clarity.
            </p>
          </div>
          <Link
            href={user ? '/subscribe' : '/login'}
            className="inline-block bg-green-700 text-white text-sm font-medium px-5 py-2.5 rounded no-underline whitespace-nowrap"
          >
            {user ? 'Subscribe to view' : 'Log in to subscribe'}
          </Link>
        </div>
      ) : null}

      {error ? (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3">
          {error}
        </p>
      ) : sections.length === 0 ? (
        <p className="text-sm text-gray-600">No photos yet. Check back soon.</p>
      ) : (
        <div className="space-y-12">
          {sections.map((section) => (
            <section key={section.folder}>
              <h2 className="text-xl font-medium mb-4">{section.title}</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {section.photos.map((photo) => (
                  <div
                    key={photo.id}
                    className="aspect-square overflow-hidden rounded-lg bg-gray-100"
                  >
                    <img
                      src={photoUrl(photo.id, !isSubscriber)}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </main>
  )
}