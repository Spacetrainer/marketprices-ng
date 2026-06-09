export const dynamic = 'force-dynamic'

// Your Selar products. To add a new book/course later, copy one block,
// paste it, and edit the four fields. Order here = order on the page.
const products = [
  {
    title: 'African Catfish Farmers Handbook',
    description:
      'A complete guide for farmers starting catfish production from zero knowledge — everything you need to raise catfish anywhere in Africa.',
    price: '₦10,000',
    cover:
      'https://files.selar.co/product-images/2026/products/abolaji-osilowo2808332/african-catfish-farmers-h-selar.com-6a282f4be8f5f.png',
    link: 'https://selar.com/4ql3tv1u18',
  },
]

export default function LearnPage() {
  return (
    <main className="min-h-screen p-8 max-w-5xl mx-auto">
      <h1 className="text-3xl font-medium mb-2">Learn</h1>
      <p className="text-gray-600 text-sm mb-8">
        Books and courses to deepen your knowledge of Nigerian food markets and agribusiness.
      </p>

      {products.length === 0 ? (
        <p className="text-sm text-gray-600">No products yet. Check back soon.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {products.map((product) => (
            <div
              key={product.link}
              className="border border-gray-200 rounded-lg overflow-hidden flex flex-col"
            >
              {product.cover ? (
                <img
                  src={product.cover}
                  alt={product.title}
                  className="w-full h-48 object-cover"
                />
              ) : (
                <div className="w-full h-48 bg-gray-100" />
              )}
              <div className="p-4 flex flex-col flex-1">
                <h2 className="text-lg font-medium leading-snug mb-2">{product.title}</h2>
                <p className="text-sm text-gray-600 mb-4 flex-1">{product.description}</p>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-base font-medium text-gray-900">{product.price}</span>
                  <a
                    href={product.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block bg-green-700 text-white text-sm font-medium px-4 py-2 rounded no-underline whitespace-nowrap"
                  >
                    Get it on Selar
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  )
}