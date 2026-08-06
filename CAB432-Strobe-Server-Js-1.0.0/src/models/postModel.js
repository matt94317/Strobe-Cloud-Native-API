import {
  getById,
  putItem,
  updateById,
  deleteById,
  scanAll,
  queryAll,
  queryCount,
} from "../utils/dynamoHelpers.js";
import { config } from "../config/index.js";

const TABLE_NAME = config.dynamo.tables.posts;
const USER_INDEX = "userId-createdAt-index";

function sortByNewestFirst(items) {
  return items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

/**
 * Find a post by ID
 * @param {string} postId - The post's ID
 * @returns {Object|null} Post object or null
 */
export async function findPostById(postId) {
  return getById(TABLE_NAME, postId);
}

/**
 * Get all posts by a user
 * @param {string} userId - The user's ID
 * @param {number} limit - Maximum results
 * @param {number} offset - Offset for pagination
 * @returns {Array} Array of post objects
 */
export async function getPostsByUserId(userId, limit = 20, offset = 0) {
  const items = await queryAll(TABLE_NAME, {
    IndexName: USER_INDEX,
    KeyConditionExpression: "userId = :userId",
    ExpressionAttributeValues: { ":userId": userId },
    ScanIndexForward: false,
  });
  return items.slice(offset, offset + limit);
}

/**
 * Get all posts (for feed queries)
 * @param {number} limit - Maximum results
 * @param {number} offset - Offset for pagination
 * @returns {Array} Array of post objects sorted by newest first
 */
export async function getAllPosts(limit = 20, offset = 0) {
  const items = await scanAll(TABLE_NAME);
  return sortByNewestFirst(items).slice(offset, offset + limit);
}

/**
 * Create a new post
 * @param {Object} postData - Post data
 * @returns {Object} Created post object
 */
export async function createPost(postData) {
  return putItem(TABLE_NAME, postData);
}

/**
 * Update a post
 * @param {string} postId - The post's ID
 * @param {Object} updates - Fields to update
 * @returns {Object|null} Updated post object or null if not found
 */
export async function updatePost(postId, updates) {
  return updateById(TABLE_NAME, postId, {
    ...updates,
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Delete a post
 * @param {string} postId - The post's ID
 * @returns {boolean} True if post was deleted, false if not found
 */
export async function deletePost(postId) {
  return deleteById(TABLE_NAME, postId);
}

/**
 * Get posts from a list of user IDs (for feed)
 * @param {Array} userIds - Array of user IDs
 * @param {number} limit - Maximum results
 * @param {number} offset - Offset for pagination
 * @returns {Array} Array of post objects
 */
export async function getPostsFromUsers(userIds, limit = 20, offset = 0) {
  if (userIds.length === 0) return [];
  const results = await Promise.all(
    userIds.map((userId) =>
      queryAll(TABLE_NAME, {
        IndexName: USER_INDEX,
        KeyConditionExpression: "userId = :userId",
        ExpressionAttributeValues: { ":userId": userId },
      }),
    ),
  );
  return sortByNewestFirst(results.flat()).slice(offset, offset + limit);
}

/**
 * Get post count for a user
 * @param {string} userId - The user's ID
 * @returns {number} Number of posts
 */
export async function getPostCountByUserId(userId) {
  return queryCount(TABLE_NAME, {
    IndexName: USER_INDEX,
    KeyConditionExpression: "userId = :userId",
    ExpressionAttributeValues: { ":userId": userId },
  });
}
