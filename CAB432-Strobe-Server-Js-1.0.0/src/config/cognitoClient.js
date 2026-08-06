import { CognitoIdentityProviderClient } from "@aws-sdk/client-cognito-identity-provider";
import { config } from "./index.js";

export const cognitoClient = new CognitoIdentityProviderClient({
  region: config.cognito.region,
});
