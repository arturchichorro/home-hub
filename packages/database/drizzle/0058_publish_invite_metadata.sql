-- Publish owner-readable invitation metadata only. Never replicate token hashes
-- or put plaintext invitation tokens into Zero mutation arguments/results.
ALTER PUBLICATION home_hub_zero ADD TABLE household_invites
  (id, household_id, expires_at, accepted_at, revoked_at, created_at);
