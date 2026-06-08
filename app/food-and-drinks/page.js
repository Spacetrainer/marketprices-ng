import { getArticles } from '@/lib/notion'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

function formatDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })
}

export default async function FoodAndDrinksPage() {
  let articles = []
  let error = null

  try {
    articles = await getArticles()
  } catch (err) {
    console.error('Food & drinks page error:', err)
    error = 'Could not load articles right now. Please try again shortly.'
  }

  return (
    <main className="min-h-screen p-8 max-w-5xl mx-auto">
      <h1 className="text-3xl font-medium mb-2">Food &amp; Drinks</h1>
      <p className="text-gray-600 text-sm mb-8">
        Market intelligence, brand stories, and food insights from Nigeria.
      </p>

      {error ? (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3">
          {error}
        </p>
      ) : articles.length === 0 ? (
        <p className="text-sm text-gray-600">No articles published yet. Check back soon.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {articles.map((article) => (
            <Link
              key={article.id}
              href={`/food-and-drinks/${article.id}`}
              className="block no-underline text-inherit"
            >
              <article className="border border-gray-200 rounded overflow-hidden flex flex-col h-full">
                {article.cover ? (
                  <img src={article.cover} alt="" className="w-full h-44 object-cover" />
                ) : (
                  <div className="w-full h-44 bg-gray-100" />
                )}
                <div className="p-4 flex flex-col flex-1">
                  {article.category ? (
                    <span className="text-xs font-medium text-green-700 uppercase tracking-wide mb-1">
                      {article.category}
                    </span>
                  ) : null}
                  <h2 className="text-lg font-medium leading-snug mb-2">{article.title}</h2>
                  {article.excerpt ? (
                    <p className="text-sm text-gray-600 mb-3 flex-1">{article.excerpt}</p>
                  ) : (
                    <div className="flex-1" />
                  )}
                  <div className="text-xs text-gray-500">
                    {article.author ? <span>{article.author}</span> : null}
                    {article.author && article.date ? <span> · </span> : null}
                    {article.date ? <span>{formatDate(article.date)}</span> : null}
                  </div>
                </div>
              </article>
            </Link>
          ))}
        </div>
      )}
    </main>
  )
}