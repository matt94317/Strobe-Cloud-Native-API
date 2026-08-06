import { putItem, deleteById, queryAll, queryCount } from "../utils/dynamoHelpers.js";
import { config } from "../config/index.js";

const TABLE_NAME = config.dynamo.tables.follows;
const FOLLOWER_INDEX = "followerId-followeeId-index";
const FOLLOWEE_INDEX = "followeeId-followerId-index";

/**
 * Find a follow relationship
 * @param {string} followerId - The user doing the following
 * @param {string} followeeId - The user being followed
 * @returns {Object|null} Follow object or null
 */
export async function findFollow(followerId, followeeId) {
  const items = await queryAll(TABLE_NAME, {
    IndexName: FOLLOWER_INDEX,
    KeyConditionExpression: "followerId = :followerId AND followeeId = :followeeId",
    ExpressionAttributeValues: {
      ":followerId": followerId,
      ":followeeId": followeeId,
    },
  });
  return items[0] || null;
}

/**
 * Check if a user is following another user
 * @param {string} followerId - The user doing the following
 * @param {string} followeeId - The user being followed
 * @returns {boolean} True if follower is following followee
 */
export async function isFollowing(followerId, followeeId) {
  return (await findFollow(followerId, followeeId)) !== null;
}

/**
 * Get all users that a user is following
 * @param {string} userId - The user's ID
 * @returns {Array} Array of followee IDs
 */
export async function getFollowing(userId) {
  const items = await queryAll(TABLE_NAME, {
    IndexName: FOLLOWER_INDEX,
    KeyConditionExpression: "followerId = :followerId",
    ExpressionAttributeValues: { ":followerId": userId },
  });
  return items.map((f) => f.followeeId);
}

/**
 * Get all users following a user
 * @param {string} userId - The user's ID
 * @returns {Array} Array of follower IDs
 */
export async function getFollowers(userId) {
  const items = await queryAll(TABLE_NAME, {
    IndexName: FOLLOWEE_INDEX,
    KeyConditionExpression: "followeeId = :followeeId",
    ExpressionAttributeValues: { ":followeeId": userId },
  });
  return items.map((f) => f.followerId);
}

/**
 * Get following count for a user
 * @param {string} userId - The user's ID
 * @returns {number} Number of users being followed
 */
export async function getFollowingCount(userId) {
  return queryCount(TABLE_NAME, {
    IndexName: FOLLOWER_INDEX,
    KeyConditionExpression: "followerId = :followerId",
    ExpressionAttributeValues: { ":followerId": userId },
  });
}

/**
 * Get follower count for a user
 * @param {string} userId - The user's ID
 * @returns {number} Number of followers
 */
export async function getFollowerCount(userId) {
  return queryCount(TABLE_NAME, {
    IndexName: FOLLOWEE_INDEX,
    KeyConditionExpression: "followeeId = :followeeId",
    ExpressionAttributeValues: { ":followeeId": userId },
  });
}

/**
 * Add a follow relationship
 * @param {Object} followData - Follow data { id, followerId, followeeId, createdAt }
 * @returns {Object} Created follow object
 */
export async function createFollow(followData) {
  return putItem(TABLE_NAME, followData);
}

/**
 * Remove a follow relationship
 * @param {string} followerId - The user doing the following
 * @param {string} followeeId - The user being followed
 * @returns {boolean} True if follow was removed, false if not found
 */
export async function removeFollow(followerId, followeeId) {
  const follow = await findFollow(followerId, followeeId);
  if (!follow) return false;
  return deleteById(TABLE_NAME, follow.id);
}

/**
 * Remove every follow relationship involving a user, as follower or
 * followee (when the user is deleted)
 * @param {string} userId - The user's ID
 * @returns {void}
 */
export async function removeFollowsByUserId(userId) {
  const [asFollower, asFollowee] = await Promise.all([
    queryAll(TABLE_NAME, {
      IndexName: FOLLOWER_INDEX,
      KeyConditionExpression: "followerId = :userId",
      ExpressionAttributeValues: { ":userId": userId },
      ProjectionExpression: "id",
    }),
    queryAll(TABLE_NAME, {
      IndexName: FOLLOWEE_INDEX,
      KeyConditionExpression: "followeeId = :userId",
      ExpressionAttributeValues: { ":userId": userId },
      ProjectionExpression: "id",
    }),
  ]);
  await Promise.all(
    [...asFollower, ...asFollowee].map((f) => deleteById(TABLE_NAME, f.id)),
  );
}
