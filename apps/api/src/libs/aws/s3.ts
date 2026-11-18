import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

/** Somewhere to put a file and get back where it went. The freeze profiler writes through this. */
export interface ObjectStore {
  put(key: string, body: string, contentType: string): Promise<string>;
}

/**
 * S3-backed store. Credentials and region come from the standard AWS
 * chain (env, shared config, instance role), so nothing secret lives in
 * this repo. Objects are encrypted at rest; the bucket should be private.
 */
export function createS3Store(bucket: string, client: Pick<S3Client, "send"> = new S3Client({})): ObjectStore {
  return {
    async put(key, body, contentType) {
      await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType, ServerSideEncryption: "AES256" }));
      return `s3://${bucket}/${key}`;
    },
  };
}
