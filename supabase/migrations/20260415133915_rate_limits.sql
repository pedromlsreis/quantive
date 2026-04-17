CREATE TABLE rate_limits (
  ip TEXT PRIMARY KEY,
  request_count INT NOT NULL DEFAULT 1,
  window_start TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION check_rate_limit(
  p_ip TEXT,
  p_max_requests INT DEFAULT 5,
  p_window_seconds INT DEFAULT 60
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_allowed BOOLEAN;
BEGIN
  INSERT INTO rate_limits (ip, request_count, window_start)
  VALUES (p_ip, 1, NOW())
  ON CONFLICT (ip) DO UPDATE
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
