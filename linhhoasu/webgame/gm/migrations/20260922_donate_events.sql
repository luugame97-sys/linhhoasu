-- Additive migration; never resets Donate, wallets, claims or delivery history.
CREATE TABLE IF NOT EXISTS donate_events (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 title VARCHAR(120) NOT NULL,
 banner_path VARCHAR(255) NOT NULL DEFAULT '',
 starts_at DATETIME NOT NULL,
 ends_at DATETIME NOT NULL,
 tiers_json MEDIUMTEXT NOT NULL,
 is_active TINYINT NOT NULL DEFAULT 0,
 published_at DATETIME NULL,
 edit_version INT UNSIGNED NOT NULL DEFAULT 1,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 KEY idx_event_window(is_active, ends_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS donate_event_claims (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 event_id BIGINT UNSIGNED NOT NULL,
 tier_id INT UNSIGNED NOT NULL,
 account_name VARCHAR(64) NOT NULL,
 server_id VARCHAR(32) NOT NULL,
 delivery_id BIGINT UNSIGNED NOT NULL,
 qualified_amount BIGINT UNSIGNED NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY uq_event_claim(event_id, tier_id, account_name),
 UNIQUE KEY uq_event_delivery(delivery_id),
 KEY idx_event_account(account_name,event_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
