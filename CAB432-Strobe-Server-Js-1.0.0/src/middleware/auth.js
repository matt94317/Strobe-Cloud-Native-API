import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { config } from '../config/index.js';
import { HTTP_STATUS, ERROR_MESSAGES, ERROR_TYPES, ROLES } from '../config/constants.js';

const verifier = CognitoJwtVerifier.create({
  userPoolId: config.cognito.userPoolId,
  tokenUse: 'access',
  clientId: config.cognito.clientId,
});

function roleFromGroups(groups) {
  return Array.isArray(groups) && groups.includes('moderators')
    ? ROLES.MODERATOR
    : ROLES.USER;
}

/**
 * Middleware to verify a Cognito access token (JWKS verification)
 * Attaches user ID to request if token is valid
 */
export async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(HTTP_STATUS.UNAUTHORISED).json({
        error: ERROR_TYPES.UNAUTHORISED,
        message: ERROR_MESSAGES.UNAUTHORISED,
      });
    }

    const token = authHeader.substring(7); // Remove "Bearer " prefix
    const payload = await verifier.verify(token);

    req.userId = payload.sub;
    req.userRole = roleFromGroups(payload['cognito:groups']);
    req.username = payload.username;

    next();
  } catch (error) {
    return res.status(HTTP_STATUS.UNAUTHORISED).json({
      error: ERROR_TYPES.UNAUTHORISED,
      message: ERROR_MESSAGES.INVALID_TOKEN,
    });
  }
}

/**
 * Optional authentication middleware
 * Attempts to authenticate but doesn't fail if token is missing
 */
export async function optionalAuthenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const payload = await verifier.verify(token);
      req.userId = payload.sub;
      req.userRole = roleFromGroups(payload['cognito:groups']);
      req.username = payload.username;
    }

    next();
  } catch (error) {
    // Silently ignore token errors for optional auth reqs
    next();
  }
}

export function requireModerator(req, res, next) {
  if (req.userRole !== ROLES.MODERATOR) {
    return res.status(HTTP_STATUS.FORBIDDEN).json({
      error: ERROR_TYPES.FORBIDDEN,
      message: 'Moderator role required',
    });
  }

  return next();
}
