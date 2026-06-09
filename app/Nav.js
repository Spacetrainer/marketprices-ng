import Link from 'next/link'

export default function Nav() {
  const links = [
    { href: '/prices', label: 'Prices' },
    { href: '/food-and-drinks', label: 'Food & Drinks' },
    { href: '/experience', label: 'Experience' },
    { href: '/learn', label: 'Learn' },
  ]

  return (
    <header className="border-b border-gray-200 bg-white">
      <nav className="max-w-6xl mx-auto px-6 py-4 flex flex-wrap items-center gap-x-6 gap-y-2">
        <Link href="/" className="text-lg font-semibold text-gray-900 no-underline mr-2">
          MarketPrices
        </Link>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-gray-700 no-underline hover:text-green-700"
            >
              {link.label}
            </Link>
          ))}
        </div>

        <Link
          href="/account"
          className="ml-auto text-sm font-medium text-green-700 no-underline hover:underline"
        >
          Account
        </Link>
      </nav>
    </header>
  )
}