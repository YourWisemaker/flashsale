/**
 * These two scripts are the whole concurrency story. Redis runs a Lua
 * script to completion before it looks at the next command, so "check
 * the window, check the buyer, check the stock, decrement, record the
 * buyer" happens as one indivisible step. Two requests racing for the
 * last unit cannot both pass: the second one re-reads a GET of 0 that
 * the first one's DECR already produced, inside the same script run.
 *
 * This replaces a separate "acquire lock / do work / release lock"
 * round trip with a single round trip that cannot deadlock, cannot
 * leak a held lock if a client dies, and needs no lock TTL tuning.
 *
 * `redis.call('TIME')` reads Redis's own clock, not the caller's. With
 * several API instances, their system clocks can drift from each
 * other; the sale window is enforced against one shared clock instead.
 */

export const PURCHASE_SCRIPT = `
local configKey = KEYS[1]
local stockKey = KEYS[2]
local buyersKey = KEYS[3]
local userId = ARGV[1]

local startsAt = tonumber(redis.call('HGET', configKey, 'startsAt'))
local endsAt = tonumber(redis.call('HGET', configKey, 'endsAt'))

if not startsAt or not endsAt then
  return {'not_configured'}
end

local time = redis.call('TIME')
local now = (tonumber(time[1]) * 1000) + math.floor(tonumber(time[2]) / 1000)

if now < startsAt then
  return {'upcoming'}
end

if now > endsAt then
  return {'ended'}
end

if redis.call('SISMEMBER', buyersKey, userId) == 1 then
  return {'already_purchased'}
end

local stock = tonumber(redis.call('GET', stockKey))

if not stock then
  return {'not_configured'}
end

if stock <= 0 then
  return {'sold_out'}
end

local remaining = redis.call('DECR', stockKey)
redis.call('SADD', buyersKey, userId)

return {'reserved', tostring(remaining)}
`;

/**
 * Compensates a reservation that never made it onto the queue (see
 * sale-gate.ts). Only releases stock if this user actually held a
 * reservation, so a retried or out-of-order call can't hand back a
 * unit twice.
 */
export const RELEASE_SCRIPT = `
local stockKey = KEYS[1]
local buyersKey = KEYS[2]
local userId = ARGV[1]

local removed = redis.call('SREM', buyersKey, userId)

if removed == 1 then
  redis.call('INCR', stockKey)
  return {'released'}
end

return {'noop'}
`;
