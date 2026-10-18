-- Additive migration; retain every legacy claim and never adjust old balances.
CREATE TABLE IF NOT EXISTS daily_checkin_account_claims (
    account_name VARCHAR(64) NOT NULL,
    claim_date DATE NOT NULL,
    source_server_id VARCHAR(32) NOT NULL,
    reward_xu INT UNSIGNED NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (account_name, claim_date),
    KEY idx_account_checkin_date (claim_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Runtime still consults legacy history, so a pre-migration or concurrent old
-- row remains protected. Backfill first original row, without granting Xu.
INSERT IGNORE INTO daily_checkin_account_claims(account_name,claim_date,source_server_id,reward_xu,created_at)
SELECT d.account_name,d.claim_date,d.server_id,d.reward_xu,d.created_at
FROM daily_checkins d
ORDER BY d.id ASC;
