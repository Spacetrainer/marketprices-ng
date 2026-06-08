import { getArticle, getArticleBlocks, blockText } from '@/lib/notion'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

function formatDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })
}

// Convert one Notion block into a React element.
function renderBlock(block) {
  const type = block.type
  const value = block[type]

  if (type === 'paragraph') {
    const text = blockText(value.rich_text)
    if (!text) return <div key={block.id} className="h-4" />
    return <p key={block.id} className="text-gray-800 leading-relaxed mb-4">{text}</p>
  }

  if (type === 'heading_1') {
    return <h2 key={block.id} className="text-2xl font-medium mt-8 mb-3">{blockText(value.rich_text)}</h2>
  }

  if (type === 'heading_2') {
    return <h3 key={block.id} className="text-xl font-medium mt-6 mb-2">{blockText(value.rich_text)}</h3>
  }

  if (type === 'heading_3') {
    return <h4 key={block.id} className="text-lg font-medium mt-4 mb-2">{blockText(value.rich_text)}</h4>
  }

  if (type === 'bulleted_list_item') {
    return <li key={block.id} className="text-gray-800 leading-relaxed mb-1 ml-6 list-disc">{blockText(value.rich_text)}</li>
  }

  if (type === 'numbered_list_item') {
    return <li key={block.id} className="text-gray-800 leading-relaxed mb-1 ml-6 list-decimal">{blockText(value.rich_text)}</li>
  }

  if (type === 'quote') {
    return <blockquote key={block.id} className="border-l-4 border-gray-300 pl-4 italic text-gray-700 my-4">{blockText(value.rich_text)}</blockquote>
  }

  if (type === 'image') {
    const src = value.type === 'external' ? value.external?.url : value.file?.url
    if (!src) return null
    const caption = blockText(value.caption)
    return (
      <figure key={block.id} className="my-6">
        <img src={src} alt={caption} className="w-full rounded-lg" />
        {caption ? <figcaption className="text-xs text-gray-500 mt-2 text-center">{caption}</figcaption> : null}
      </figure>
    )
  }

  if (type === 'divider') {
    return <hr key={block.id} className="my-8 border-gray-200" />
  }

  return null
}

export default async function ArticlePage({ params }) {
  const { id } = await params

  let article = null
  let blocks = []
  let error = null

  try {
    article = await getArticle(id)
    blocks = await getArticleBlocks(id)
  } catch (err) {
    console.error('Article page error:', err)
    error = 'Could not load this article right now. Please try again shortly.'
  }

  return (
    <main className="min-h-screen p-8 max-w-3xl mx-auto">
      <Link href="/food-and-drinks" className="text-sm text-green-700 hover:underline">
        ← Back to Food &amp; Drinks
      </Link>

      {error ? (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3 mt-6">
          {error}
        </p>
      ) : !article ? (
        <p className="text-sm text-gray-600 mt-6">Article not found.</p>
      ) : (
        <article className="mt-6">
          {article.cover ? (
            <img src={article.cover} alt="" className="w-full h-64 object-cover rounded-lg mb-6" />
          ) : null}

          {article.category ? (
            <span className="text-xs font-medium text-green-700 uppercase tracking-wide">
              {article.category}
            </span>
          ) : null}

          <h1 className="text-3xl font-medium mt-2 mb-3">{article.title}</h1>

          <div className="text-sm text-gray-500 mb-8">
            {article.author ? <span>{article.author}</span> : null}
            {article.author && article.date ? <span> · </span> : null}
            {article.date ? <span>{formatDate(article.date)}</span> : null}
          </div>

          <div>
            {blocks.map((block) => renderBlock(block))}
          </div>
        </article>
      )}
    </main>
  )
}