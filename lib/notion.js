import { Client } from '@notionhq/client'

const notion = new Client({ auth: process.env.NOTION_TOKEN })

// Pull a plain-text value out of a Notion property, whatever its type.
function readText(prop) {
  if (!prop) return ''
  if (prop.type === 'title') return (prop.title || []).map((t) => t.plain_text).join('')
  if (prop.type === 'rich_text') return (prop.rich_text || []).map((t) => t.plain_text).join('')
  if (prop.type === 'select') return prop.select ? prop.select.name : ''
  if (prop.type === 'date') return prop.date ? prop.date.start : ''
  if (prop.type === 'checkbox') return prop.checkbox
  return ''
}

// Find the cover image URL for a page (page cover, file or external).
function readCover(page) {
  const cover = page.cover
  if (!cover) return null
  if (cover.type === 'external') return cover.external?.url || null
  if (cover.type === 'file') return cover.file?.url || null
  return null
}

// Turn a Notion page (database row) into a tidy article object.
function toArticle(page) {
  const props = page.properties || {}
  return {
    id: page.id,
    title: readText(props['Name']),
    category: readText(props['Category']),
    date: readText(props['Date']),
    author: readText(props['Author']),
    excerpt: readText(props['Excerpt']),
    published: readText(props['Published']) === true,
    cover: readCover(page),
  }
}

// Fetch all PUBLISHED articles, newest first.
export async function getArticles() {
  const databaseId = process.env.NOTION_ARTICLES_DB_ID
  if (!databaseId) {
    throw new Error('NOTION_ARTICLES_DB_ID is not set')
  }

  const response = await notion.databases.query({
    database_id: databaseId,
    filter: {
      property: 'Published',
      checkbox: { equals: true },
    },
    sorts: [
      { property: 'Date', direction: 'descending' },
    ],
  })

  return (response.results || []).map(toArticle)
}

// Fetch a single article's metadata by its Notion page ID.
export async function getArticle(id) {
  const page = await notion.pages.retrieve({ page_id: id })
  return toArticle(page)
}

// Fetch all content blocks for a Notion page (handles pagination).
export async function getArticleBlocks(id) {
  const blocks = []
  let cursor = undefined

  do {
    const response = await notion.blocks.children.list({
      block_id: id,
      page_size: 100,
      start_cursor: cursor,
    })
    blocks.push(...response.results)
    cursor = response.has_more ? response.next_cursor : undefined
  } while (cursor)

  return blocks
}

// Pull plain text out of a block's rich_text array.
export function blockText(richText) {
  if (!richText) return ''
  return richText.map((t) => t.plain_text).join('')
}