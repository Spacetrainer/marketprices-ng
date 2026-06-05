'use client'

import { useMemo } from 'react'
import {
  ResponsiveContainer,
  BarChart, Bar,
  LineChart, Line,
  PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from 'recharts'

const COLORS = ['#1f6f43', '#2f9e63', '#7fc89b', '#c2e4cf', '#0f3d24', '#5aa97a', '#a8d8bd']

function naira(n) {
  return '₦' + Number(n || 0).toLocaleString('en-NG')
}

export default function PriceCharts({ rows }) {
  // Average price by market (bar)
  const byMarket = useMemo(() => {
    const map = {}
    rows.forEach((r) => {
      if (!r.location || r.price == null) return
      if (!map[r.location]) map[r.location] = { total: 0, count: 0 }
      map[r.location].total += r.price
      map[r.location].count += 1
    })
    return Object.entries(map)
      .map(([name, v]) => ({ name, avg: Math.round(v.total / v.count) }))
      .sort((a, b) => b.avg - a.avg)
  }, [rows])

  // Average price over time (line) — grouped by date
  const overTime = useMemo(() => {
    const map = {}
    rows.forEach((r) => {
      if (!r.date || r.price == null) return
      const day = new Date(r.date).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })
      if (!map[day]) map[day] = { total: 0, count: 0, sortKey: new Date(r.date).getTime() }
      map[day].total += r.price
      map[day].count += 1
    })
    return Object.entries(map)
      .map(([name, v]) => ({ name, avg: Math.round(v.total / v.count), sortKey: v.sortKey }))
      .sort((a, b) => a.sortKey - b.sortKey)
  }, [rows])

  // Share of records by market (pie)
  const shareByMarket = useMemo(() => {
    const map = {}
    rows.forEach((r) => {
      if (!r.location) return
      map[r.location] = (map[r.location] || 0) + 1
    })
    return Object.entries(map).map(([name, value]) => ({ name, value }))
  }, [rows])

  if (rows.length === 0) {
    return null
  }

  return (
    <div className="mt-8 space-y-8">
      <h2 className="text-xl font-medium">Charts</h2>

      {/* Bar: avg price by market */}
      <div className="border border-gray-200 rounded p-4">
        <p className="text-sm font-medium mb-3">Average price by market</p>
        <div style={{ width: '100%', height: 280 }}>
          <ResponsiveContainer>
            <BarChart data={byMarket} margin={{ top: 10, right: 10, left: 10, bottom: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-20} textAnchor="end" interval={0} height={60} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => '₦' + (v / 1000) + 'k'} />
              <Tooltip formatter={(v) => naira(v)} />
              <Bar dataKey="avg" fill="#1f6f43" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Line: avg price over time */}
      <div className="border border-gray-200 rounded p-4">
        <p className="text-sm font-medium mb-3">Average price over time</p>
        {overTime.length < 2 ? (
          <p className="text-xs text-gray-500">Not enough dates yet to draw a trend. This chart fills in as prices are recorded across more days.</p>
        ) : (
          <div style={{ width: '100%', height: 280 }}>
            <ResponsiveContainer>
              <LineChart data={overTime} margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => '₦' + (v / 1000) + 'k'} />
                <Tooltip formatter={(v) => naira(v)} />
                <Line type="monotone" dataKey="avg" stroke="#1f6f43" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Pie: share of records by market */}
      <div className="border border-gray-200 rounded p-4">
        <p className="text-sm font-medium mb-3">Share of records by market</p>
        {shareByMarket.length < 2 ? (
          <p className="text-xs text-gray-500">Only one market in view. This chart compares markets once more are recorded.</p>
        ) : (
          <div style={{ width: '100%', height: 280 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie data={shareByMarket} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>
                  {shareByMarket.map((entry, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  )
}