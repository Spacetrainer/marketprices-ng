import { getVideos } from "@/lib/youtube";

export const dynamic = "force-dynamic";

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric" });
}

export default async function VideosPage() {
  let videos = [];
  let error = null;

  try {
    videos = await getVideos(24);
  } catch (err) {
    console.error("Videos page error:", err);
    error = "Could not load videos right now. Please try again shortly.";
  }

  const longForm = videos.filter((v) => !v.isShort);
  const shorts = videos.filter((v) => v.isShort);

  return (
    <main className="min-h-screen p-8 max-w-6xl mx-auto">
      <h1 className="text-3xl font-medium mb-2">Videos</h1>
      <p className="text-gray-600 text-sm mb-10">
        Market visits, price breakdowns, and food stories from across Nigeria.
      </p>

      {error ? (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-4">
          {error}
        </p>
      ) : videos.length === 0 ? (
        <p className="text-sm text-gray-600">No videos yet. Check back soon.</p>
      ) : (
        <>
          {longForm.length > 0 && (
            <section className="mb-14">
              <h2 className="text-xl font-medium text-gray-900 mb-1">Featured videos</h2>
              <p className="text-sm text-gray-500 mb-6">In-depth market stories and breakdowns.</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {longForm.map((video) => (
                  <div key={video.id} className="flex flex-col">
                    <div className="relative w-full" style={{ paddingBottom: "56.25%" }}>
                      <iframe
                        className="absolute top-0 left-0 w-full h-full rounded-lg"
                        src={`https://www.youtube.com/embed/${video.id}`}
                        title={video.title}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                      />
                    </div>
                    <h3 className="text-base font-medium text-gray-900 mt-3">{video.title}</h3>
                    <p className="text-xs text-gray-500 mt-1">{formatDate(video.publishedAt)}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {shorts.length > 0 && (
            <section>
              <h2 className="text-xl font-medium text-gray-900 mb-1">Shorts</h2>
              <p className="text-sm text-gray-500 mb-6">Quick takes — tap to watch on YouTube.</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
                {shorts.map((video) => (
                  <a
                    key={video.id }
                    href={`https://www.youtube.com/shorts/${video.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group block no-underline"
                  >
                    <div className="relative w-full overflow-hidden rounded-lg bg-gray-100" style={{ paddingBottom: "177.78%" }}>
                      {video.thumbnail ? (
                        <img
                          src={video.thumbnail}
                          alt={video.title}
                          className="absolute top-0 left-0 w-full h-full object-cover group-hover:scale-105 transition-transform"
                        />
                      ) : (
                        <div className="absolute top-0 left-0 w-full h-full bg-gray-200" />
                      )}
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-black/60">
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                            <path d="M8 5v14l11-7z" />
                          </svg>
                        </span>
                      </div>
                    </div>
                    <h3 className="text-sm font-medium text-gray-900 mt-2 group-hover:text-green-700">{video.title}</h3>
                    <p className="text-xs text-gray-500 mt-1">{formatDate(video.publishedAt)}</p>
                  </a>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </main>
  );
}