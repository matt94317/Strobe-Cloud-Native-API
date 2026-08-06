import {
  getById,
  putItem,
  updateById,
  deleteById,
  queryAll,
} from "../utils/dynamoHelpers.js";
import { config } from "../config/index.js";

const TABLE_NAME = config.dynamo.tables.moments;
const USER_INDEX = "userId-createdAt-index";

function sortByNewestFirst(items) {
  return items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

/**
 * Create a new moment
 * @param {Object} momentData - Moment data
 * @returns {Object} Created moment object
 */
export async function createMoment(momentData) {
  return putItem(TABLE_NAME, momentData);
}

/**
 * Find a moment by ID
 * @param {string} momentId - The moment's ID
 * @returns {Object|null} Moment object or null
 */
export async function findMomentById(momentId) {
  return getById(TABLE_NAME, momentId);
}

/**
 * Update a moment
 * @param {string} momentId - The moment's ID
 * @param {Object} updates - Fields to update
 * @returns {Object|null} Updated moment object or null if not found
 */
export async function updateMoment(momentId, updates) {
  return updateById(TABLE_NAME, momentId, {
    ...updates,
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Delete a moment
 * @param {string} momentId - The moment's ID
 * @returns {boolean} True if moment was deleted, false if not found
 */
export async function deleteMoment(momentId) {
  return deleteById(TABLE_NAME, momentId);
}

/**
 * Get moments for a list of user IDs
 * @param {Array} userIds - Array of user IDs
 * @returns {Array} Array of moment objects sorted newest first
 */
export async function getMomentsByUserIds(userIds) {
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
  return sortByNewestFirst(results.flat());
}

/**
 * Get moments for one user
 * @param {string} userId - The user's ID
 * @returns {Array} Array of moment objects sorted newest first
 */
export async function getMomentsByUserId(userId) {
  return queryAll(TABLE_NAME, {
    IndexName: USER_INDEX,
    KeyConditionExpression: "userId = :userId",
    ExpressionAttributeValues: { ":userId": userId },
    ScanIndexForward: false,
  });
}

/**
 * Delete all moments for a user (when the user is deleted)
 * @param {string} userId - The user's ID
 * @returns {void}
 */
export async function deleteMomentsByUserId(userId) {
  const items = await queryAll(TABLE_NAME, {
    IndexName: USER_INDEX,
    KeyConditionExpression: "userId = :userId",
    ExpressionAttributeValues: { ":userId": userId },
    ProjectionExpression: "id",
  });
  await Promise.all(items.map((m) => deleteById(TABLE_NAME, m.id)));
}
