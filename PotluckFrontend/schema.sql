CREATE DATABASE IF NOT EXISTS potluck CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE potluck;

CREATE TABLE IF NOT EXISTS users (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    name VARCHAR(60) NOT NULL,
    password VARCHAR(255) NOT NULL,
    email VARCHAR(254) NOT NULL,
    description TEXT,
    PRIMARY KEY (id),
    UNIQUE KEY uq_users_name (name),
    UNIQUE KEY uq_users_email (email)
) ENGINE = InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS assets (
    id CHAR(36) NOT NULL,
    user_id INT UNSIGNED NOT NULL,
    name VARCHAR(60) NOT NULL,
    scene LONGTEXT NOT NULL,
    thumbnail MEDIUMTEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_assets_user_updated (user_id, updated_at),
    CONSTRAINT fk_assets_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;