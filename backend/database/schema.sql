-- Jewish Educational Resources — schema inicial + tabelas futuras

CREATE DATABASE IF NOT EXISTS jewish_educational_resources
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE jewish_educational_resources;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('user', 'admin') NOT NULL DEFAULT 'user',
  is_blocked TINYINT(1) NOT NULL DEFAULT 0,
  avatar_url VARCHAR(500) NULL,
  reset_token VARCHAR(255) NULL,
  reset_token_expires DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  slug VARCHAR(180) NOT NULL UNIQUE,
  parent_id INT NULL,
  description TEXT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  nav_visible TINYINT(1) NOT NULL DEFAULT 1,
  is_archived TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS resources (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  slug VARCHAR(280) NOT NULL UNIQUE,
  description TEXT NULL,
  content_description TEXT NULL,
  age_range VARCHAR(80) NULL,
  keywords TEXT NULL,
  action_visibility LONGTEXT NULL,
  display_mode ENUM('default','grid','gallery') NOT NULL DEFAULT 'default',
  download_limit_max INT NULL,
  download_limit_period VARCHAR(20) NULL,
  grade_level VARCHAR(80) NULL,
  material_type VARCHAR(80) NULL,
  google_slides_url VARCHAR(500) NULL,
  canva_url VARCHAR(500) NULL,
  category_id INT NULL,
  cover_image VARCHAR(500) NULL,
  cover_hidden TINYINT(1) NOT NULL DEFAULT 0,
  page_layout LONGTEXT NULL,
  is_published TINYINT(1) NOT NULL DEFAULT 1,
  is_archived TINYINT(1) NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0,
  is_premium TINYINT(1) NOT NULL DEFAULT 0,
  school_only TINYINT(1) NOT NULL DEFAULT 0,
  view_count INT NOT NULL DEFAULT 0,
  download_count INT NOT NULL DEFAULT 0,
  created_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS resource_files (
  id INT AUTO_INCREMENT PRIMARY KEY,
  resource_id INT NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  label VARCHAR(120) NULL,
  sort_order INT NOT NULL DEFAULT 0,
  file_type ENUM('pdf', 'docx', 'ppt', 'pptx', 'other') NOT NULL,
  file_size INT NOT NULL DEFAULT 0,
  mime_type VARCHAR(100) NULL,
  is_primary TINYINT(1) NOT NULL DEFAULT 0,
  is_archived TINYINT(1) NOT NULL DEFAULT 0,
  is_bundle TINYINT(1) NOT NULL DEFAULT 0,
  premium_only TINYINT(1) NOT NULL DEFAULT 0,
  thumbnail VARCHAR(500) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS editor_upload_sessions (
  upload_id VARCHAR(64) PRIMARY KEY,
  owner_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(120) NOT NULL,
  size_bytes BIGINT NOT NULL,
  kind ENUM('file','cover') NOT NULL DEFAULT 'file',
  chunk_size INT NOT NULL DEFAULT 8388608,
  storage_path VARCHAR(500) NULL,
  session_url TEXT NULL,
  staged_path VARCHAR(500) NULL,
  status ENUM('started','uploading','complete','cancelled','expired') NOT NULL DEFAULT 'started',
  received_bytes BIGINT NOT NULL DEFAULT 0,
  last_chunk INT NOT NULL DEFAULT -1,
  expires_at DATETIME NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_editor_upload_owner (owner_id),
  INDEX idx_editor_upload_expiry (expires_at),
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS downloads (
  id INT AUTO_INCREMENT PRIMARY KEY,
  resource_id INT NOT NULL,
  file_id INT NULL,
  user_id INT NULL,
  ip_address VARCHAR(45) NULL,
  user_agent VARCHAR(500) NULL,
  request_id VARCHAR(128) NULL UNIQUE,
  status ENUM('reserved','completed') NOT NULL DEFAULT 'completed',
  reserved_until DATETIME NULL,
  completed_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_download_quota (user_id, status, reserved_until, created_at),
  FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE,
  FOREIGN KEY (file_id) REFERENCES resource_files(id) ON DELETE SET NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS download_quota_locks (
  quota_key VARCHAR(180) PRIMARY KEY,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS stripe_webhook_events (
  event_id VARCHAR(255) PRIMARY KEY,
  status ENUM('processing', 'completed') NOT NULL DEFAULT 'processing',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS settings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  setting_key VARCHAR(100) NOT NULL UNIQUE,
  setting_value TEXT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Tabelas preparadas para crescimento futuro
CREATE TABLE IF NOT EXISTS favorites (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  resource_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_favorite (user_id, resource_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS comments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  resource_id INT NOT NULL,
  content TEXT NOT NULL,
  is_approved TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tags (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  slug VARCHAR(120) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS resource_tags (
  resource_id INT NOT NULL,
  tag_id INT NOT NULL,
  PRIMARY KEY (resource_id, tag_id),
  FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS plans (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  slug VARCHAR(180) NOT NULL UNIQUE,
  description TEXT NULL,
  price DECIMAL(10, 2) NOT NULL DEFAULT 0,
  interval_type ENUM('monthly', 'yearly', 'lifetime') NOT NULL DEFAULT 'monthly',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  plan_id INT NOT NULL,
  status ENUM('active', 'cancelled', 'expired') NOT NULL DEFAULT 'active',
  tier VARCHAR(20) NOT NULL DEFAULT 'standard',
  starts_at DATETIME NOT NULL,
  ends_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS payments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  subscription_id INT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  status ENUM('pending', 'paid', 'failed', 'refunded') NOT NULL DEFAULT 'pending',
  provider VARCHAR(50) NULL,
  provider_ref VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS contact_messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  email VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'unread',
  read_at TIMESTAMP NULL,
  notification_status VARCHAR(30) NOT NULL DEFAULT 'not_configured',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_contact_messages_created (created_at),
  INDEX idx_contact_messages_status (status)
);

INSERT INTO settings (setting_key, setting_value) VALUES
  ('site_name', 'Jewish Educational Resources'),
  ('site_logo', ''),
  ('site_description', 'Jewish educational materials library'),
  ('seo_keywords', 'education, resources, Jewish'),
  ('social_facebook', ''),
  ('social_instagram', ''),
  ('social_youtube', ''),
  ('google_analytics_id', ''),
  ('download_limit_enabled', 'true'),
  ('download_limit_max', '10'),
  ('download_limit_period', 'day'),
  ('download_limit_mode', 'global')
ON DUPLICATE KEY UPDATE setting_key = setting_key;
