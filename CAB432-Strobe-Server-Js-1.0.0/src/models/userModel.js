import * as postModel from "./postModel.js";
import * as commentModel from "./commentModel.js";
import * as likeModel from "./likeModel.js";
import * as followModel from "./followModel.js";
import * as momentModel from "./momentModel.js";
import { getById, putItem, updateById, deleteById, scanAll } from "../utils/dynamoHelpers.js";
import { config } from "../config/index.js";

const TABLE_NAME = config.dynamo.tables.users;

/**
 * Find a user by ID
 * @param {string} userId - The user's ID
 * @returns {Object|null} User object or null
 */
export async function findUserById(userId) {
  return getById(TABLE_NAME, userId);
}

/**
 * Find a user by email
 * @param {string} email - The email to search for
 * @returns {Object|null} User object or null
 */
export async function findUserAuthByEmail(email) {
  const needle = (email || "").trim().toLowerCase();
  const items = await scanAll(TABLE_NAME, {
    FilterExpression: "email = :email",
    ExpressionAttributeValues: { ":email": needle },
  });
  return items[0] || null;
}

/**
 * Get all users
 * @returns {Array} Array of user objects
 */
export async function getAllUsers() {
  return scanAll(TABLE_NAME);
}

/**
 * Create a new user
 * @param {Object} userData - User data { id, username, email, createdAt }
 * @returns {Object} Created user object
 */
export async function createUser(userData) {
  return putItem(TABLE_NAME, userData);
}

/**
 * Update a user
 * @param {string} userId - The user's ID
 * @param {Object} updates - Fields to update
 * @returns {Object|null} Updated user object or null if not found
 */
export async function updateUser(userId, updates) {
  return updateById(TABLE_NAME, userId, {
    ...updates,
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Delete a user
 * @param {string} userId - The user's ID
 * @returns {boolean} True if user was deleted, false if not found
 */
export async function deleteUser(userId) {
  return deleteById(TABLE_NAME, userId);
}

/**
 * Delete a user and all related data (posts, comments, likes, follows, moments)
 * @param {string} userId - The user's ID
 * @returns {boolean} True if user was deleted, false if not found
 */
export async function deleteUserWithCascade(userId) {
  const existing = await findUserById(userId);
  if (!existing) return false;

  const ownedPosts = await postModel.getPostsByUserId(
    userId,
    Number.MAX_SAFE_INTEGER,
    0,
  );
  for (const post of ownedPosts) {
    await likeModel.removeLikesByPostId(post.id);
    await commentModel.deleteCommentsByPostId(post.id);
    await postModel.deletePost(post.id);
  }

  await commentModel.deleteCommentsByUserId(userId);
  await likeModel.removeLikesByUserId(userId);
  await followModel.removeFollowsByUserId(userId);
  await momentModel.deleteMomentsByUserId(userId);

  await deleteUser(userId);
  return true;
}

/**
 * Check if username exists
 * @param {string} username - Username to check
 * @returns {boolean} True if username exists
 */
export async function usernameExists(username) {
  const items = await scanAll(TABLE_NAME, {
    FilterExpression: "username = :username",
    ExpressionAttributeValues: { ":username": username },
    ProjectionExpression: "id",
  });
  return items.length > 0;
}

/**
 * Check if email exists
 * @param {string} email - Email to check
 * @returns {boolean} True if email exists
 */
export async function emailExists(email) {
  const needle = (email || "").trim().toLowerCase();
  const items = await scanAll(TABLE_NAME, {
    FilterExpression: "email = :email",
    ExpressionAttributeValues: { ":email": needle },
    ProjectionExpression: "id",
  });
  return items.length > 0;
}

/**
 * Search users by username
 * @param {string} query - Search query
 * @param {number} limit - Maximum results to return
 * @returns {Array} Array of matching users
 */
export async function searchUsers(query, limit = 10) {
  const lowerQuery = (query || "").toLowerCase();
  const items = await scanAll(TABLE_NAME);
  return items
    .filter((u) => (u.username || "").toLowerCase().includes(lowerQuery))
    .slice(0, limit);
}
