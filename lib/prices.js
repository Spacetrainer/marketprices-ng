import Papa from 'papaparse'

// Turns "₦46,800" into the number 46800. Returns null if it can't.
function cleanPrice(raw) {
  if (!raw) return null
  const digitsOnly = String(raw).replace(/[^0-9.]/g, '')
  if (digitsOnly === '') return null
  const num = Number(digitsOnly)
  return Number.isFinite(num) ? num : null
}

// Turns "11/05/2026 18:13" (day/month/year) into a real Date object.
function parseNgDate(raw) {
  if (!raw) return null
  const text = String(raw).trim()
  const [datePart, timePart] = text.split(' ')
  if (!datePart) return null
  const [day, month, year] = datePart.split('/')
  if (!day || !month || !year) return null
  let hours = 0
  let minutes = 0
  if (timePart) {
    const [h, m] = timePart.split(':')
    hours = Number(h) || 0
    minutes = Number(m) || 0
  }
  const d = new Date(Number(year), Number(month) - 1, Number(day), hours, minutes)
  return isNaN(d.getTime()) ? null : d
}

// Trims whitespace; returns '' for empty.
function clean(value) {
  return value ? String(value).trim() : ''
}

export async function getPrices() {
  const url = process.env.PRICES_CSV_URL
  if (!url) {
    throw new Error('PRICES_CSV_URL is not set')
  }

  // Fetch the CSV. Cache for 10 minutes so we are fast and not always re-fetching.
  const response = await fetch(url, { next: { revalidate: 600 } })
  if (!response.ok) {
    throw new Error('Could not fetch prices CSV: ' + response.status)
  }

  const text = await response.text()

  // Parse the raw CSV text into rows.
  const parsed = Papa.parse(text, {
    header: true,        // use row 1 as the column names
    skipEmptyLines: true,
  })

  const rows = parsed.data || []

  // Row 1 is headers (handled by Papa). The FIRST data row is the sub-label
  // row ("General Market / Market Name / Product Name..."), so we drop it.
  const dataRows = rows.slice(1)

  // Clean each row into a tidy shape our page can use.
  const cleaned = dataRows
    .map((row) => {
      const priceNumber = cleanPrice(row['Price (₦)'])
      const date = parseNgDate(row['Timestamp'])
      return {
        timestamp: clean(row['Timestamp']),
        date: date ? date.toISOString() : null,
        category: clean(row['Category']),
        location: clean(row['Location']),
        mainItem: clean(row['Main Item']),
        subItem: clean(row['Sub Item']),
        detail: clean(row['Detail']),
        source: clean(row['Source']),
        unit: clean(row['Unit']),
        priceText: clean(row['Price (₦)']),
        price: priceNumber,
        priceDirection: clean(row['Price Direction']),
        condition: clean(row['Condition']),
        collector: clean(row['Data Collector']),
      }
    })
    // Keep only rows that have at least a product and a usable price.
    .filter((row) => row.mainItem && row.price !== null)

  // Sort newest first by date.
  cleaned.sort((a, b) => {
    if (!a.date) return 1
    if (!b.date) return -1
    return new Date(b.date) - new Date(a.date)
  })

  return cleaned
}