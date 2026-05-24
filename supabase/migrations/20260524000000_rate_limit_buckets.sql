-- Per-endpoint rate-limit buckets.
--
-- The original rate_limits table keyed solely by IP, so every edge function
-- shared one counter. Five submit-feedback hits could lock the same IP out
-- of checkout for 60s. This migration partitions the counter by an opaque
-- `bucket` string so each function gets its own window without affecting
-- the others.
--
-- The legacy `check_rate_limit(p_ip, ...)` RPC keeps working — it forwards
-- to the bucketed implementation with bucket='legacy' so callers that
-- haven't been redeployed yet still throttle cleanly during the rollout.

ALTER TABLE rate_limits ADD COLUMN bucket TEXT NOT NULL DEFAULT 'legacy';

ALTER TABLE rate_limits DROP CONSTRAINT rate_limits_pkey;
ALTER TABLE rate_limits ADD PRIMARY KEY (ip, bucket);

CREATE OR REPLACE FUNCTION check_rate_limit_bucket(
  p_ip TEXT,
  p_bucket TEXT,
  p_max_requests INT DEFAULT 5,
  p_window_seconds INT DEFAULT 60
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_allowed BOOLEAN;
BEGIN
  IF p_ip IS NULL OR p_ip = '' OR p_ip = 'unknown' THEN
    -- An anonymous or unidentified caller cannot be throttled fairly:
    -- bucketing them all into one row punishes everyone who shares the
    -- fallback. Refuse the request and let the function return a 429.
    RETURN FALSE;
  END IF;

  INSERT INTO rate_limits (ip, bucket, request_count, window_start)
  VALUES (p_ip, p_bucket, 1, NOW())
  ON CONFLICT (ip, bucket) DO UPDATE
    SET
      request_count = CASE
        WHEN rate_limits.window_start < NOW() - (p_window_seconds || ' seconds')::INTERVAL
        THEN 1
        ELSE rate_limits.request_count + 1
      END,
      window_start = CASE
        WHEN rate_limits.window_start < NOW() - (p_window_seconds || ' seconds')::INTERVAL
        THEN NOW()
        ELSE rate_limits.window_start
      END
  RETURNING (request_count <= p_max_requests) INTO v_allowed;

  RETURN v_allowed;
END;
$$;

-- Back-compat shim: old single-arg callers keep working until they're
-- redeployed. They share the 'legacy' bucket so a stale function does not
-- collide with a freshly-deployed one.
CREATE OR REPLACE FUNCTION check_rate_limit(
  p_ip TEXT,
  p_max_requests INT DEFAULT 5,
  p_window_seconds INT DEFAULT 60
) RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT check_rate_limit_bucket(p_ip, 'legacy', p_max_requests, p_window_seconds);
$$;
