/**
 * Build the Storage object key for a media upload.
 * Convention: group/{groupId}/{postId}/{uuid}.{ext}
 */
export function buildMediaKey(
  groupId: string,
  postId: string,
  fileId: string,
  mimeType: string
): string {
  const ext = mimeToExt(mimeType);
  return `group/${groupId}/${postId}/${fileId}.${ext}`;
}

function mimeToExt(mime: string): string {
  switch (mime) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    default:
      return "bin";
  }
}
