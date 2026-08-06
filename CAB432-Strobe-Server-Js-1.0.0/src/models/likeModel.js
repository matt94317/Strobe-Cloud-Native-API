import {
  putItem,
  deleteById,
  scanAll,
  queryAll,
  queryCount,
} from "../utils/dynamoHelpers.js";
import { config } from "../config/index.js";

const TABLE_NAME = config.dynamo.tables.likes;
const POST_USER_INDEX = "postId-userId-index";

/**
 * Find a like by post and user
 * @param {string} postId - The post's ID
 * @param {string} userId - The user's ID
 * @returns {Object|null} Like object or null
 */
export async function findLike(postId, userId) {
  const items = await queryAll(TABLE_NAME, {
    IndexName: POST_USER_INDEX,
    KeyConditionExpression: "postId = :postId AND userId = :userId",
    ExpressionAttributeValues: { ":postId": postId, ":userId": userId },
  });
  return items[0] || null;
}

/**
 * Check if a user has liked a post
 * @param {string} postId - The post's ID
 * @param {string} userId - The user's ID
 * @returns {boolean} True if user has liked the post
 */
export async function hasUserLikedPost(postId, userId) {
  return (await findLike(postId, userId)) !== null;
}

/**
 * Get like count for a post
 * @param {string} postId - The post's ID
 * @returns {number} Number of likes
 */
export async function getLikeCountByPostId(postId) {
  return queryCount(TABLE_NAME, {
    IndexName: POST_USER_INDEX,
    KeyConditionExpression: "postId = :postId",
    ExpressionAttributeValues: { ":postId": postId },
  });
}

/**
 * Add a like
 * @param {Object} likeData - Like data { id, postId, userId, createdAt }
 * @returns {Object} Created like object
 */
export async function createLike(likeData) {
  return putItem(TABLE_NAME, likeData);
}

/**
 * Remove a like
 * @param {string} postId - The post's ID
 * @param {string} userId - The user's ID
 * @returns {boolean} True if like was removed, false if not found
 */
export async function removeLike(postId, userId) {
  const like = await findLike(postId, userId);
  if (!like) return false;
  return deleteById(TABLE_NAME, like.id);
}

/**
 * Remove all likes for a post (when post is deleted)
 * @param {string} postId - The post's ID
 * @returns {void}
 */
export async function removeLikesByPostId(postId) {
  const items = await queryAll(TABLE_NAME, {
    IndexName: POST_USER_INDEX,
    KeyConditionExpression: "postId = :postId",
    ExpressionAttributeValues: { ":postId": postId },
    ProjectionExpression: "id",
  });
  await Promise.all(items.map((l) => deleteById(TABLE_NAME, l.id)));
}

/**
 * Remove all likes made by a user (when the user is deleted)
 * @param {string} userId - The user's ID
 * @returns {void}
 */
export async function removeLikesByUserId(userId) {
  const items = await scanAll(TABLE_NAME, {
    FilterExpression: "userId = :userId",
    ExpressionAttributeValues: { ":userId": userId },
    ProjectionExpression: "id",
  });
  await Promise.all(items.map((l) => deleteById(TABLE_NAME, l.id)));
}
