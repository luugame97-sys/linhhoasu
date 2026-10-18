-- Additive migration only. Do not delete/rewrite legacy claims or reward rows.
-- Execute before loading reward_delivery.php. MySQL 5.7 / PHP 7.4 compatible.
CREATE TABLE IF NOT EXISTS web_reward_deliveries (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    kind ENUM('giftcode','recharge') NOT NULL,
    account_name VARCHAR(64) NOT NULL,
    server_id VARCHAR(32) NOT NULL,
    source_id BIGINT UNSIGNED NOT NULL,
    claim_period VARCHAR(64) NOT NULL DEFAULT 'total',
    role_id VARCHAR(64) NOT NULL,
    label VARCHAR(255) NOT NULL,
    reward_snapshot LONGTEXT NOT NULL,
    status ENUM('pending_delivery','sent') NOT NULL DEFAULT 'pending_delivery',
    delivered_batches INT UNSIGNED NOT NULL DEFAULT 0,
    lease_token VARCHAR(64) NULL,
    lease_until DATETIME NULL,
    attempts INT UNSIGNED NOT NULL DEFAULT 0,
    last_error VARCHAR(1000) NOT NULL DEFAULT '',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    sent_at DATETIME NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_reward_claim (kind,account_name,server_id,source_id,claim_period),
    KEY idx_reward_pending (account_name,server_id,status,created_at),
    KEY idx_reward_capacity (kind,source_id,status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
