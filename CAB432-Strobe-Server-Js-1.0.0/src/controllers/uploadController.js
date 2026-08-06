import * as uploadService from "../services/uploadService.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { HTTP_STATUS, RESPONSE_MESSAGES } from "../config/constants.js";

/**
 * POST /v1/uploads/url
 * Get a presigned S3 upload URL for uploading a file directly to S3
 */
export const getUploadUrl = asyncHandler(async (req, res) => {
  const { postId, contentType } = req.body;
  const { url, fileId, key } = await uploadService.getUploadUrl(
    req.userId,
    postId,
    contentType,
  );

  res.status(HTTP_STATUS.OK).json({
    message: RESPONSE_MESSAGES.SUCCESS,
    uploadUrl: url,
    fileId,
    key,
  });
});
