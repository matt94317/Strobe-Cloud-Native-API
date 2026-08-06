import * as userModel from "../models/userModel.js";
import jwt from "jsonwebtoken";
import {
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  AdminInitiateAuthCommand,
  AdminDeleteUserCommand,
  InitiateAuthCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { cognitoClient } from "../config/cognitoClient.js";
import {
  validationError,
  conflictError,
  notFoundError,
  forbiddenError,
  unauthorisedError,
} from "../middleware/errorHandler.js";
import {
  validateEmail,
  validatePassword,
  validateRole,
} from "../utils/validation.js";
import { ERROR_MESSAGES, ROLES } from "../config/constants.js";
import { config } from "../config/index.js";
import { enrichUsers } from "../utils/enrichment.js";

function normaliseEmail(value) {
  return (value || "").trim().toLowerCase();
}

/**
 * Register a new user
 * @param {Object} userData - { email, password, role }
 * @returns {Promise<Object>} { user, token }
 */
export async function registerUser(userData) {
  const { email, password, role } = userData;
  const normalisedEmail = normaliseEmail(email);
  // Username is always set to match email (Cognito pool uses email as username/alias)
  const username = normalisedEmail;

  // Validate inputs
  const emailValidation = validateEmail(normalisedEmail);
  if (!emailValidation.valid) {
    throw validationError(emailValidation.error);
  }

  const passwordValidation = validatePassword(password);
  if (!passwordValidation.valid) {
    throw validationError(passwordValidation.error);
  }

  const requestedRole = role ?? ROLES.USER;
  const roleValidation = validateRole(requestedRole);
  if (!roleValidation.valid) {
    throw validationError(roleValidation.error);
  }

  // Cognito is the source of truth for uniqueness (email = username)
  let cognitoSub;
  try {
    const created = await cognitoClient.send(
      new AdminCreateUserCommand({
        UserPoolId: config.cognito.userPoolId,
        Username: normalisedEmail,
        UserAttributes: [
          { Name: "email", Value: normalisedEmail },
          { Name: "email_verified", Value: "true" },
        ],
        MessageAction: "SUPPRESS",
      }),
    );
    cognitoSub = created.User.Attributes.find((a) => a.Name === "sub").Value;

    await cognitoClient.send(
      new AdminSetUserPasswordCommand({
        UserPoolId: config.cognito.userPoolId,
        Username: normalisedEmail,
        Password: password,
        Permanent: true,
      }),
    );
  } catch (err) {
    if (err.name === "UsernameExistsException") {
      throw conflictError(ERROR_MESSAGES.EMAIL_ALREADY_EXISTS);
    }
    throw err;
  }

  // Persist the app-level row using the Cognito sub as the durable id.
  // Both the identity and the row must exist, or neither should.
  const now = new Date().toISOString();
  let user;
  try {
    user = await userModel.createUser({
      id: cognitoSub,
      username,
      email: normalisedEmail,
      role: requestedRole,
      createdAt: now,
      updatedAt: now,
    });
  } catch (err) {
    await cognitoClient.send(
      new AdminDeleteUserCommand({
        UserPoolId: config.cognito.userPoolId,
        Username: normalisedEmail,
      }),
    );
    throw err;
  }

  const authResult = await cognitoClient.send(
    new AdminInitiateAuthCommand({
      UserPoolId: config.cognito.userPoolId,
      ClientId: config.cognito.clientId,
      AuthFlow: "ADMIN_USER_PASSWORD_AUTH",
      AuthParameters: {
        USERNAME: normalisedEmail,
        PASSWORD: password,
      },
    }),
  );

  return {
    user,
    token: authResult.AuthenticationResult.AccessToken,
  };
}

/**
 * Login a user
 * @param {Object} credentials - { email, password }
 * @returns {Promise<Object>} { user, token }
 */
export async function loginUser(credentials) {
  const { email, password } = credentials;
  const normalisedEmail = normaliseEmail(email);

  // Validate inputs
  if (!normalisedEmail || !password) {
    throw validationError(ERROR_MESSAGES.MISSING_REQUIRED_FIELDS);
  }

  let authResult;
  try {
    authResult = await cognitoClient.send(
      new InitiateAuthCommand({
        ClientId: config.cognito.clientId,
        AuthFlow: "USER_PASSWORD_AUTH",
        AuthParameters: {
          USERNAME: normalisedEmail,
          PASSWORD: password,
        },
      }),
    );
  } catch (err) {
    if (
      err.name === "NotAuthorizedException" ||
      err.name === "UserNotFoundException"
    ) {
      throw unauthorisedError(ERROR_MESSAGES.INVALID_CREDENTIALS);
    }
    throw err;
  }

  const accessToken = authResult.AuthenticationResult.AccessToken;
  // Decoding (not verifying) is safe here: the token was just issued to us
  // directly by Cognito over TLS in this same call, not supplied by the client.
  const { sub } = jwt.decode(accessToken);

  const user = await userModel.findUserById(sub);
  if (!user) {
    throw notFoundError(ERROR_MESSAGES.USER_NOT_FOUND);
  }

  return {
    user,
    token: accessToken,
  };
}

/**
 * Get user profile
 * @param {string} userId - User ID
 * @returns {Promise<Object>} User object
 */
export async function getUserProfile(userId) {
  const user = await userModel.findUserById(userId);

  if (!user) {
    throw notFoundError(ERROR_MESSAGES.USER_NOT_FOUND);
  }

  return user;
}

/**
 * List users for discovery/search
 * @param {string} query - Optional username query
 * @param {number} limit - Maximum users to return
 * @param {string|null} currentUserId - Optional current user ID for enrichment
 * @returns {Promise<Array>} Enriched user list
 */
export async function listUsers(query = "", limit = 20, currentUserId = null) {
  const users = query
    ? await userModel.searchUsers(query, limit)
    : (await userModel.getAllUsers()).slice(0, limit);

  return enrichUsers(users, currentUserId);
}

/**
 * Delete an authenticated user's own account
 * @param {string} authenticatedUserId - User ID from auth token
 * @param {string} targetUserId - User ID in request path
 * @returns {Promise<void>}
 */
export async function deleteUserAccount(authenticatedUserId, targetUserId) {
  if (authenticatedUserId !== targetUserId) {
    throw forbiddenError(ERROR_MESSAGES.CANNOT_DELETE_USER);
  }

  const existingUser = await userModel.findUserById(targetUserId);
  if (!existingUser) {
    throw notFoundError(ERROR_MESSAGES.USER_NOT_FOUND);
  }

  await userModel.deleteUserWithCascade(targetUserId);

  await cognitoClient.send(
    new AdminDeleteUserCommand({
      UserPoolId: config.cognito.userPoolId,
      Username: existingUser.email,
    }),
  );
}
