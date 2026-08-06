import {
  getById,
  putItem,
  deleteById,
  scanAll,
  queryAll,
  queryCount,
} from "../utils/dynamoHelpers.js";
import { config } from "../config/index.js";

const TABLE_NAME = config.dynamo.tables.comments;
const POST_INDEX = "postId-createdAt-index";

/**
 * Find a comment by ID
 * @param {string} commentId - The comment's ID
 * @returns {Object|null} Comment object or null
 */
export async function findCommentById(commentId) {
  return getById(TABLE_NAME, commentId);
}

/**
 * Get all comments for a post
 * @param {string} postId - The post's ID
 * @returns {Array} Array of comment objects
 */
export async function getCommentsByPostId(postId) {
  return queryAll(TABLE_NAME, {
    IndexName: POST_INDEX,
    KeyConditionExpression: "postId = :postId",
    ExpressionAttributeValues: { ":postId": postId },
    ScanIndexForward: true,
  });
}

/**
 * Create a new comment
 * @param {Object} commentData - Comment data
 * @returns {Object} Created comment object
 */
export async function createComment(commentData) {
  return putItem(TABLE_NAME, commentData);
}

/**
 * Delete a comment
 * @param {string} commentId - The comment's ID
 * @returns {boolean} True if comment was deleted, false if not found
 */
export async function deleteComment(commentId) {
  return deleteById(TABLE_NAME, commentId);
}

/**
 * Get comment count for a post
 * @param {string} postId - The post's ID
 * @returns {number} Number of comments
 */
export async function getCommentCountByPostId(postId) {
  return queryCount(TABLE_NAME, {
    IndexName: POST_INDEX,
    KeyConditionExpression: "postId = :postId",
    ExpressionAttributeValues: { ":postId": postId },
  });
}

/**
 * Delete all comments for a post (when post is deleted)
 * @param {string} postId - The post's ID
 * @returns {void}
 */
export async function deleteCommentsByPostId(postId) {
  const items = await queryAll(TABLE_NAME, {
    IndexName: POST_INDEX,
    KeyConditionExpression: "postId = :postId",
    ExpressionAttributeValues: { ":postId": postId },
    ProjectionExpression: "id",
  });
  await Promise.all(items.map((c) => deleteById(TABLE_NAME, c.id)));
}

/**
 * Delete all comments authored by a user (when the user is deleted)
 * @param {string} userId - The user's ID
 * @returns {void}
 */
export async function deleteCommentsByUserId(userId) {
  const items = await scanAll(TABLE_NAME, {
    FilterExpression: "userId = :userId",
    ExpressionAttributeValues: { ":userId": userId },
    ProjectionExpression: "id",
  });
  await Promise.all(items.map((c) => deleteById(TABLE_NAME, c.id)));
}
