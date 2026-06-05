'use client'

import { useMemo } from 'react'

function naira(n) {
  return '₦' + Math.round(Number(n) || 0).toLocaleString('en-NG')
}

export default function PriceInsights({ rows }) {
  const insights = useMemo(() => {
    const priced = rows.filter((r) => r.price != null && r.mainItem)
    if (priced.length === 0) return []

    const out = []

    // Highest and lowest single price
    const sorted = [...priced].sort((a, b) => a.price - b.price)
    const cheapest = sorted[0]
    const dearest = sorted[sorted.length - 1]
    if (dearest && cheapest && dearest !== cheapest) {
      out.push(
        `Prices in view range from ${naira(cheapest.price)} (${cheapest.mainItem}${cheapest.location ? ', ' + cheapest.location : ''}) to ${naira(dearest.price)} (${dearest.mainItem}${dearest.location ? ', ' + dearest.location : ''}).`
      )
    }

    // Average price per product (top by average)
    const byProduct = {}
    priced.forEach((r) => {
      if (!byProduct[r.mainItem]) byProduct[r.mainItem] = { total: 0, count: 0 }
      byProduct[r.mainItem].total += r.price
      byProduct[r.mainItem].count += 1
    })
    const productAverages = Object.entries(byProduct)
      .map(([name, v]) => ({ name, avg: v.total / v.count, count: v.count }))
      .sort((a, b) => b.avg - a.avg)

    if (productAverages.length >= 2) {
      const top = productAverages[0]
      const bottom = productAverages[productAverages.length - 1]
      out.push(
        `${top.name} is the most expensive product on average at ${naira(top.avg)}, while ${bottom.name} is the most affordable at ${naira(bottom.avg)}.`
      )
    } else if (productAverages.length === 1) {
      const only = productAverages[0]
      out.push(`${only.name} averages ${naira(only.avg)} across ${only.count} record${only.count > 1 ? 's' : ''}.`)
    }

    // Cheapest market on average (if more than one market)
    const byMarket = {}
    priced.forEach((r) => {
      if (!r.location) return
      if (!byMarket[r.location]) byMarket[r.location] = { total: 0, count: 0 }
      byMarket[r.location].total += r.price
      byMarket[r.location].count += 1
    })
    const marketAverages = Object.entries(byMarket)
      .map(([name, v]) => ({ name, avg: v.total / v.count }))
      .sort((a, b) => a.avg - b.avg)

    if (marketAverages.length >= 2) {
      const cheapestMarket = marketAverages[0]
      out.push(
        `On average, ${cheapestMarket.name} has the lowest prices in view at ${naira(cheapestMarket.avg)} per record.`
      )
    }

    // Frozen vs fresh comparison (if both present)
    const frozen = priced.filter((r) => /frozen/i.test(r.subItem))
    const fresh = priced.filter((r) => /fresh/i.test(r.subItem))
    if (frozen.length && fresh.length) {
      const frozenAvg = frozen.reduce((s, r) => s + r.price, 0) / frozen.length
      const freshAvg = fresh.reduce((s, r) => s + r.price, 0) / fresh.length
      const cheaper = frozenAvg < freshAvg ? 'Frozen' : 'Fresh'
      out.push(
        `${cheaper} stock is cheaper on average (frozen ${naira(frozenAvg)} vs fresh ${naira(freshAvg)}).`
      )
    }

    // Overall average + count
    const overallAvg = priced.reduce((s, r) => s + r.price, 0) / priced.length
    out.push(`Across ${priced.length} record${priced.length > 1 ? 's' : ''} in view, the average price is ${naira(overallAvg)}.`)

    return out
  }, [rows])

  if (insights.length === 0) return null

  return (
    <div className="mb-6 border border-gray-200 rounded p-4 bg-green-50/40">
      <p className="text-sm font-medium mb-2">Insights</p>
      <ul className="space-y-1.5">
        {insights.map((line, i) => (
          <li key={i} className="text-sm text-gray-700 flex gap-2">
            <span className="text-green-700">•</span>
            <span>{line}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}