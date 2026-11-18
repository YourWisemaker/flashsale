import { PutObjectCommand } from "@aws-sdk/client-s3";
import { describe, expect, it, vi } from "vitest";
import { createS3Store } from "../../../libs/aws/index.js";

describe("createS3Store", () => {
  it("puts an encrypted object and returns its s3:// address", async () => {
    const send = vi.fn(async () => ({}));
    const store = createS3Store("ops-profiles", { send } as never);

    const where = await store.put("freeze-1.cpuprofile", "{}", "application/json");

    expect(where).toBe("s3://ops-profiles/freeze-1.cpuprofile");
    expect(send).toHaveBeenCalledTimes(1);
    const command = (send.mock.calls[0] as unknown[])[0] as PutObjectCommand;
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect(command.input).toEqual({
      Bucket: "ops-profiles",
      Key: "freeze-1.cpuprofile",
      Body: "{}",
      ContentType: "application/json",
      ServerSideEncryption: "AES256",
    });
  });

  it("lets S3 errors reach the caller", async () => {
    const store = createS3Store("b", { send: async () => Promise.reject(new Error("AccessDenied")) } as never);
    await expect(store.put("k", "x", "text/plain")).rejects.toThrow("AccessDenied");
  });
});
