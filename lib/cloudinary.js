import { v2 as cloudinary } from 'cloudinary'

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
})

// Turn a folder name like "ile-epo" into a display title like "Ile-Epo".
function titleFromFolder(folder) {
  const last = folder.split('/').pop() || folder
  return last
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('-')
}

// Fetch all photos under experience/, grouped by market subfolder.
// Uses the dynamic-folder methods Cloudinary recommends (no search wildcards).
// Returns: [ { folder, title, photos: [ { id, width, height } ] } ]
export async function getExperienceMarkets() {
  // 1. List the market subfolders inside "experience".
  const folderResult = await cloudinary.api.sub_folders('experience')
  const subFolders = folderResult.folders || []

  const markets = []

  // 2. For each market folder, fetch its photos by exact asset folder path.
  for (const f of subFolders) {
    const path = f.path // e.g. "experience/ile-epo"

    const assetResult = await cloudinary.api.resources_by_asset_folder(path, {
      max_results: 500,
    })

    const photos = (assetResult.resources || []).map((r) => ({
      id: r.public_id,
      width: r.width,
      height: r.height,
    }))

    if (photos.length > 0) {
      markets.push({
        folder: path,
        title: titleFromFolder(path),
        photos,
      })
    }
  }

  // 3. Sort markets alphabetically by folder name for a stable order.
  markets.sort((a, b) => a.folder.localeCompare(b.folder))

  return markets
}

// Build a delivery URL for a photo.
// blurred=true serves a heavily blurred, low-quality version (for non-subscribers).
// blurred=false serves a clear, optimized version (for subscribers).
export function photoUrl(publicId, blurred) {
  const transformation = blurred
    ? 'e_blur:2000,q_auto:low,f_auto,w_800'
    : 'q_auto:good,f_auto,w_1200'

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME
  return `https://res.cloudinary.com/${cloudName}/image/upload/${transformation}/${publicId}`
}