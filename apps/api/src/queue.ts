import { ORDER_JOB_OPTIONS, ORDER_QUEUE_NAME, type OrderJobData } from "@flashsale/core";
import { Queue } from "bullmq";
import type { Redis } from "ioredis";

export function createOrderQueue(connection: Redis): Queue<OrderJobData> {
  return new Queue<OrderJobData>(ORDER_QUEUE_NAME, { connection, defaultJobOptions: ORDER_JOB_OPTIONS });
}
