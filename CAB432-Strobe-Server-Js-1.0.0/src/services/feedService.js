import * as followModel from "../models/followModel.js";
import * as postModel from "../models/postModel.js";
import * as userModel from "../models/userModel.js";
import { enrichPosts } from "../utils/enrichment.js";
import { notFoundError } from "../middleware/errorHandler.js";
import { ERROR_MESSAGES, ROLES } from "../config/constants.js";

/**
 * Get the personalised feed for a user
 *
 * @param {string} userId - Current user ID
 * @param {number} limit - Maximum posts to return
 * @param {number} offset - Pagination offset
 * @param {string} userRole - Current user role
 * @returns {Promise<Array>} Array of posts from the caller and followed users (enriched)
 */
export async function getUserFeed(
  userId,
  limit = 20,
  offset = 0,
  userRole = ROLES.USER,
) {
  // Verify user exists
  const user = await userModel.findUserById(userId);
  if (!user) {
    throw notFoundError(ERROR_MESSAGES.USER_NOT_FOUND);
  }

  // Get list of users being followed. The caller is included so their own
  // posts show up in their feed - a brand new account follows nobody, and an
  // empty feed there would hide the posts they just made.
  const followingUserIds = await followModel.getFollowing(userId);
  const authorIds = followingUserIds.includes(userId)
    ? followingUserIds
    : [...followingUserIds, userId];

  // Get posts from the caller and the users they follow
  const posts = await postModel.getPostsFromUsers(authorIds, limit, offset);

  const visiblePosts = posts.filter((post) => {
    if (userRole === ROLES.MODERATOR || post.userId === userId) {
      return true;
    }

    return post.status !== "hidden";
  });

  // Enrich with likes/comments counts and current user's interactions
  return enrichPosts(visiblePosts, userId);
}
