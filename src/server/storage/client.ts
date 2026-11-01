import "server-only";
import { S3Client } from "@aws-sdk/client-s3";
import { getStorageEnv } from "@/config/env";

let client: S3Client | undefined;
export function getStorage() {
  const env = getStorageEnv();
  client ??= new S3Client({
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
    credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY },
    maxAttempts: 2,
  });
  return { client, bucket: env.S3_BUCKET };
}
