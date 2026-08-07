import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;

  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;

    const [key, ...valueParts] = trimmed.split("=");
    const value = valueParts.join("=").trim().replace(/^['"]|['"]$/g, "");
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

// Only meaningful for local dev - Lambda deployments never ship a .env file
// and get real values injected as environment variables instead. Bundling
// (esbuild -> CJS) strips import.meta.url down to `undefined`, so this must
// tolerate that rather than crash the whole module on load.
try {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  loadEnvFile(path.resolve(__dirname, "../../.env"));
} catch {
  // Not running from a real file URL (e.g. bundled for Lambda) - nothing to load.
}

const {
  PORT = "3000",
  HOST = "0.0.0.0",
  NODE_ENV = "development",
  JWT_SECRET = "dev-secret-change-in-production",
  AWS_REGION = "ap-southeast-2",
  COGNITO_USER_POOL_ID = "",
  COGNITO_CLIENT_ID = "",
  DDB_TABLE_USERS = "n12191434-ddb-users",
  DDB_TABLE_POSTS = "n12191434-ddb-post",
  DDB_TABLE_COMMENTS = "n12191434-ddb-comments",
  DDB_TABLE_LIKES = "n12191434-ddb-likes",
  DDB_TABLE_FOLLOWS = "n12191434-ddb-follows",
  DDB_TABLE_MOMENTS = "n12191434-ddb-moments",
  S3_MEDIA_BUCKET = "n12191434-strobe-media",
} = process.env;

export const config = {
  port: Number(PORT),
  host: HOST,
  nodeEnv: NODE_ENV,
  jwtSecret: JWT_SECRET,
  awsRegion: AWS_REGION,
  cognito: {
    region: AWS_REGION,
    userPoolId: COGNITO_USER_POOL_ID,
    clientId: COGNITO_CLIENT_ID,
  },
  dynamo: {
    tables: {
      users: DDB_TABLE_USERS,
      posts: DDB_TABLE_POSTS,
      comments: DDB_TABLE_COMMENTS,
      likes: DDB_TABLE_LIKES,
      follows: DDB_TABLE_FOLLOWS,
      moments: DDB_TABLE_MOMENTS,
    },
  },
  s3: {
    mediaBucket: S3_MEDIA_BUCKET,
  },
};
