const API_KEY = process.env.YOUTUBE_API_KEY;
const CHANNEL_ID = process.env.YOUTUBE_CHANNEL_ID;

// Convert an ISO 8601 duration (e.g. "PT1M24S") into total seconds.
function parseDuration(iso) {
  if (!iso) return 0;
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const hours = parseInt(match[1] || "0", 10);
  const minutes = parseInt(match[2] || "0", 10);
  const seconds = parseInt(match[3] || "0", 10);
  return hours * 3600 + minutes * 60 + seconds;
}

// Fetch the channel's latest videos, each tagged as Short or long-form.
export async function getVideos(limit = 24) {
  if (!API_KEY || !CHANNEL_ID) {
    throw new Error("YOUTUBE_API_KEY or YOUTUBE_CHANNEL_ID is not set");
  }

  // Step 1: get the uploads playlist ID for the channel.
  const channelRes = await fetch(
    `https://www.googleapis.com/youtube/v3/channels?part=contentDetails&id=${CHANNEL_ID}&key=${API_KEY}`,
    { next: { revalidate: 300 } }
  );
  if (!channelRes.ok) throw new Error("Failed to fetch channel from YouTube");

  const channelData = await channelRes.json();
  const uploadsPlaylistId =
    channelData.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploadsPlaylistId) return [];

  // Step 2: get the latest items from the uploads playlist.
  const playlistRes = await fetch(
    `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${uploadsPlaylistId}&maxResults=${limit}&key=${API_KEY}`,
    { next: { revalidate: 300 } }
  );
  if (!playlistRes.ok) throw new Error("Failed to fetch videos from YouTube");

  const playlistData = await playlistRes.json();
  const baseVideos = (playlistData.items || [])
    .map((item) => {
      const snippet = item.snippet || {};
      const thumbnails = snippet.thumbnails || {};
      const thumb =
        thumbnails.maxres ||
        thumbnails.high ||
        thumbnails.medium ||
        thumbnails.default ||
        {};
      return {
        id: snippet.resourceId?.videoId || "",
        title: snippet.title || "",
        description: snippet.description || "",
        publishedAt: snippet.publishedAt || "",
        thumbnail: thumb.url || "",
      };
    })
    .filter((v) => v.id);

  if (baseVideos.length === 0) return [];

  // Step 3: fetch durations for all videos in one call to classify Shorts.
  const ids = baseVideos.map((v) => v.id).join(",");
  const detailsRes = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${ids}&key=${API_KEY}`,
    { next: { revalidate: 300 } }
  );

  let durations = {};
  if (detailsRes.ok) {
    const detailsData = await detailsRes.json();
    (detailsData.items || []).forEach((item) => {
      durations[item.id] = parseDuration(item.contentDetails?.duration);
    });
  }

  // Tag each video. Treat <= 60s as a Short.
  return baseVideos.map((v) => {
    const seconds = durations[v.id] || 0;
    return {
      ...v,
      durationSeconds: seconds,
      isShort: seconds > 0 && seconds <= 60,
    };
  });
}