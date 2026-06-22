import Link from 'next/link'
import { getPrices } from '@/lib/prices'
import { getArticles } from '@/lib/notion'
import Ticker from './Ticker'

export const dynamic = 'force-dynamic'

function formatDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })
}

export default async function HomePage() {
  // Fetch prices for the ticker (fail quietly — homepage must still render).
  let tickerItems = []
  try {
    const prices = await getPrices()
    tickerItems = prices
      .filter((p) => p.mainItem && p.priceText)
      .slice(0, 20)
      .map((p) => ({
        product: p.mainItem,
        market: p.location || '',
        price: p.priceText,
      }))
  } catch (err) {
    console.error('Homepage ticker error:', err)
  }

  // Fetch latest articles for the teaser (also fail quietly).
  let articles = []
  try {
    articles = (await getArticles()).slice(0, 8)
  } catch (err) {
    console.error('Homepage articles error:', err)
  }

  return (
    <>
      <Ticker items={tickerItems} />

      <main className="flex-1">
        {/* HERO */}
        <section className="max-w-5xl mx-auto px-6 py-16 text-center">
          <h1 className="text-4xl sm:text-5xl font-semibold text-gray-900 mb-4">
            Nigerian food market prices, in one place.
          </h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto mb-8">
            Track real commodity prices across Lagos markets — plus the stories, data, and
            insight behind what Nigerians actually pay for food.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/prices"
              className="inline-block bg-green-700 text-white font-medium px-6 py-3 rounded no-underline"
            >
              Browse Prices
            </Link>
            <Link
              href="/subscribe"
              className="inline-block border border-gray-300 text-gray-800 font-medium px-6 py-3 rounded no-underline"
            >
              Subscribe
            </Link>
          </div>
        </section>

        {/* THREE PILLARS */}
        <section className="max-w-5xl mx-auto px-6 pb-16">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <Link href="/prices" className="block border border-gray-200 rounded-lg p-6 no-underline">
              <h2 className="text-lg font-medium text-gray-900 mb-2">Live Prices</h2>
              <p className="text-sm text-gray-600">
                Search and compare current commodity prices across Lagos markets, updated regularly.
              </p>
            </Link>
            <Link href="/food-and-drinks" className="block border border-gray-200 rounded-lg p-6 no-underline">
              <h2 className="text-lg font-medium text-gray-900 mb-2">Food &amp; Drinks</h2>
              <p className="text-sm text-gray-600">
                Market intelligence, brand stories, and food insight from across Nigeria.
              </p>
            </Link>
            <Link href="/learn" className="block border border-gray-200 rounded-lg p-6 no-underline">
              <h2 className="text-lg font-medium text-gray-900 mb-2">Learn</h2>
              <p className="text-sm text-gray-600">
                Books and courses to deepen your knowledge of Nigerian food markets and agribusiness.
              </p>
            </Link>
          </div>
        </section>

        {/* LATEST ARTICLES TEASER */}
        {articles.length > 0 ? (
          <section className="max-w-5xl mx-auto px-6 pb-20">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-medium text-gray-900">Latest reads</h2>
              <Link href="/food-and-drinks" className="text-sm text-green-700 no-underline hover:underline">
                View all →
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {articles.map((article) => (
                <Link
                  key={article.id}
                  href={`/food-and-drinks/${article.id}`}
                  className="block border border-gray-200 rounded-lg overflow-hidden no-underline"
                >
                  {article.cover ? (
                    <img src={article.cover} alt="" className="w-full h-40 object-cover" />
                  ) : (
                    <div className="w-full h-40 bg-gray-100" />
                  )}
                  <div className="p-4">
                    {article.category ? (
                      <span className="text-xs font-medium text-green-700 uppercase tracking-wide">
                        {article.category}
                      </span>
                    ) : null}
                    <h3 className="text-base font-medium text-gray-900 mt-1 mb-1">{article.title}</h3>
                    <p className="text-xs text-gray-500">{formatDate(article.date)}</p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ) : null}
      </main>
    </>
  )
}