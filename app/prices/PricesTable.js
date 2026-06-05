'use client'

import { useState, useMemo } from 'react'
import PriceCharts from './PriceCharts'
import PriceInsights from './PriceInsights'

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-NG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

// Wrap a value so commas/quotes inside it don't break the CSV.
function csvCell(value) {
  const s = value == null ? '' : String(value)
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"'
  }
  return s
}

export default function PricesTable({ prices, isActive, totalCount, error }) {
  const [search, setSearch] = useState('')
  const [market, setMarket] = useState('all')
  const [product, setProduct] = useState('all')

  const marketOptions = useMemo(() => {
    const set = new Set(prices.map((r) => r.location).filter(Boolean))
    return Array.from(set).sort()
  }, [prices])

  const productOptions = useMemo(() => {
    const set = new Set(prices.map((r) => r.mainItem).filter(Boolean))
    return Array.from(set).sort()
  }, [prices])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return prices.filter((r) => {
      if (market !== 'all' && r.location !== market) return false
      if (product !== 'all' && r.mainItem !== product) return false
      if (term) {
        const haystack = [r.location, r.mainItem, r.subItem, r.detail, r.unit]
          .join(' ')
          .toLowerCase()
        if (!haystack.includes(term)) return false
      }
      return true
    })
  }, [prices, search, market, product])

  function handleExport() {
    const headers = ['Date', 'Market', 'Product', 'Form', 'Size', 'Unit', 'Price (NGN)']
    const lines = [headers.join(',')]
    filtered.forEach((r) => {
      lines.push([
        csvCell(formatDate(r.date)),
        csvCell(r.location),
        csvCell(r.mainItem),
        csvCell(r.subItem),
        csvCell(r.detail),
        csvCell(r.unit),
        csvCell(r.price),
      ].join(','))
    })
    const csv = lines.join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'marketprices-export.csv'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  if (error) {
    return (
      <main className="min-h-screen p-8 max-w-5xl mx-auto">
        <h1 className="text-3xl font-medium mb-2">Market Prices</h1>
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
          {error}
        </p>
      </main>
    )
  }

  const lockedCount = totalCount - prices.length

  return (
    <main className="min-h-screen p-8 max-w-5xl mx-auto">
      <h1 className="text-3xl font-medium mb-2">Market Prices</h1>
      <p className="text-gray-600 text-sm mb-6">
        Live food and commodity prices across Lagos markets.
      </p>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search product, market, size..."
          className="flex-1 border border-gray-300 rounded px-3 py-2 text-sm"
        />
        <select
          value={market}
          onChange={(e) => setMarket(e.target.value)}
          className="border border-gray-300 rounded px-3 py-2 text-sm"
        >
          <option value="all">All markets</option>
          {marketOptions.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
        <select
          value={product}
          onChange={(e) => setProduct(e.target.value)}
          className="border border-gray-300 rounded px-3 py-2 text-sm"
        >
          <option value="all">All products</option>
          {productOptions.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      </div>

      <div className="flex items-center justify-between mb-4">
        {isActive ? (
          <p className="text-xs text-gray-500">Showing {filtered.length} of {totalCount} records.</p>
        ) : (
          <p className="text-xs text-gray-500">
            Showing {filtered.length} of {prices.length} preview rows ({totalCount} total — subscribe to see all).
          </p>
        )}

        {isActive ? (
          <button
            onClick={handleExport}
            disabled={filtered.length === 0}
            className="border border-gray-300 rounded px-3 py-1.5 text-xs font-medium disabled:opacity-40"
          >
            Export CSV
          </button>
        ) : null}
      </div>

      {isActive ? <PriceInsights rows={filtered} /> : null}

      <div className="overflow-x-auto border border-gray-200 rounded">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left">
            <tr>
              <th className="px-3 py-2 font-medium">Date</th>
              <th className="px-3 py-2 font-medium">Market</th>
              <th className="px-3 py-2 font-medium">Product</th>
              <th className="px-3 py-2 font-medium">Form</th>
              <th className="px-3 py-2 font-medium">Size</th>
              <th className="px-3 py-2 font-medium">Unit</th>
              <th className="px-3 py-2 font-medium text-right">Price (₦)</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-gray-500 text-sm">
                  No records match your search.
                </td>
              </tr>
            ) : (
              filtered.map((row, i) => (
                <tr key={i} className="border-t border-gray-100">
                  <td className="px-3 py-2 whitespace-nowrap text-gray-600">{formatDate(row.date)}</td>
                  <td className="px-3 py-2">{row.location || '—'}</td>
                  <td className="px-3 py-2">{row.mainItem || '—'}</td>
                  <td className="px-3 py-2 text-gray-600">{row.subItem || '—'}</td>
                  <td className="px-3 py-2 text-gray-600">{row.detail || '—'}</td>
                  <td className="px-3 py-2 text-gray-600">{row.unit || '—'}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">₦{row.price.toLocaleString('en-NG')}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {isActive ? <PriceCharts rows={filtered} /> : null}

      {!isActive && lockedCount > 0 ? (
        <div className="mt-6 border border-gray-200 rounded p-6 text-center bg-gray-50">
          <p className="text-sm font-medium mb-1">{lockedCount} more price records are locked</p>
          <p className="text-xs text-gray-500 mb-4">
            Subscribe for ₦3,500/month to unlock all market prices, charts, search, and export.
          </p>
          <a href="/subscribe" className="inline-block bg-black text-white rounded px-5 py-2 text-sm font-medium">
            Upgrade to Premium — ₦3,500/month
          </a>
        </div>
      ) : null}
    </main>
  )
}