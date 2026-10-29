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