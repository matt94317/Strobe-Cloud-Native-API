import {
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3Client } from "../config/s3Client.js";
import { config } from "../config/index.js";
import { generateId } from "../utils/idGenerator.js";
import { validationError } from "../middleware/errorHandler.js";

// Allowed file types
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];

const UPLOAD_URL_EXPIRY_SECONDS = 5 * 60; // presigned PUT: ≤5 min
const READ_URL_EXPIRY_SECONDS = 10 * 60; // presigned GET: short-lived, resolved at read time

/**
 * Get file extension from mimetype
 * @param {string} mimetype - MIME type (e.g., 'image/jpeg')
 * @returns {string} File extension (e.g., 'jpg')
 */
function getFileExtension(mimetype) {
  const typeMap = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
    "image/webp": "webp",
  };
  return typeMap[mimetype] || "jpg";
}

/**
 * Generate a presigned S3 PUT URL for a client to upload directly to
 *
 * @param {string} userId - User ID (for organisation)
 * @param {string} postId - Post ID (for organisation)
 * @param {string} contentType - MIME type of the file being uploaded
 * @returns {Promise<Object>} { url, fileId, key }
 */
export async function getUploadUrl(userId, postId, contentType = "image/jpeg") {
  if (!postId) {
    throw validationError("postId is required to generate an upload URL");
  }

  if (!ALLOWED_TYPES.includes(contentType)) {
    throw validationError("Invalid file type. Allowed: JPEG, PNG, GIF, WebP");
  }

  const fileId = generateId();
  const key = `${userId}/${postId}/${fileId}.${getFileExtension(contentType)}`;

  const url = await getSignedUrl(
    s3Client,
    new PutObjectCommand({
      Bucket: config.s3.mediaBucket,
      Key: key,
      ContentType: contentType,
    }),
    { expiresIn: UPLOAD_URL_EXPIRY_SECONDS },
  );

  return { url, fileId, key };
}

/**
 * Resolve a stored S3 key to a short-lived presigned GET URL
 * @param {string} key - S3 object key
 * @returns {Promise<string>} Presigned URL
 */
export async function getReadUrl(key) {
  return getSignedUrl(
    s3Client,
    new GetObjectCommand({ Bucket: config.s3.mediaBucket, Key: key }),
    { expiresIn: READ_URL_EXPIRY_SECONDS },
  );
}

/**
 * Delete an uploaded file from S3
 * @param {string} key - S3 object key
 * @returns {Promise<boolean>} True if the delete call was issued
 */
export async function deleteUploadedFile(key) {
  if (!key) return false;

  await s3Client.send(
    new DeleteObjectCommand({ Bucket: config.s3.mediaBucket, Key: key }),
  );
  return true;
}
