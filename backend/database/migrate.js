import '../config/env.js';
import mysql from 'mysql2/promise';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { dbConfig } from '../config/env.js';

const columns = [
  { name: 'content_description', sql: 'ALTER TABLE resources ADD COLUMN content_description TEXT NULL AFTER description' },
  { name: 'age_range', sql: 'ALTER TABLE resources ADD COLUMN age_range VARCHAR(80) NULL AFTER content_description' },
];

const categoryColumns = [
  { name: 'parent_id', sql: 'ALTER TABLE categories ADD COLUMN parent_id INT NULL AFTER slug' },
  { name: 'nav_visible', sql: 'ALTER TABLE categories ADD COLUMN nav_visible TINYINT(1) NOT NULL DEFAULT 1 AFTER sort_order' },
  { name: 'is_archived', sql: 'ALTER TABLE categories ADD COLUMN is_archived TINYINT(1) NOT NULL DEFAULT 0 AFTER nav_visible' },
];

const resourceColumns = [
  { name: 'display_mode', sql: "ALTER TABLE resources ADD COLUMN display_mode ENUM('default','grid') NOT NULL DEFAULT 'default' AFTER age_range" },
  { name: 'download_limit_max', sql: 'ALTER TABLE resources ADD COLUMN download_limit_max INT NULL AFTER display_mode' },
  { name: 'download_limit_period', sql: "ALTER TABLE resources ADD COLUMN download_limit_period VARCHAR(20) NULL AFTER download_limit_max" },
  { name: 'page_layout', sql: 'ALTER TABLE resources ADD COLUMN page_layout LONGTEXT NULL' },
  { name: 'google_slides_url', sql: 'ALTER TABLE resources ADD COLUMN google_slides_url VARCHAR(500) NULL' },
  { name: 'canva_url', sql: 'ALTER TABLE resources ADD COLUMN canva_url VARCHAR(500) NULL' },
  { name: 'keywords', sql: 'ALTER TABLE resources ADD COLUMN keywords TEXT NULL' },
  { name: 'action_visibility', sql: 'ALTER TABLE resources ADD COLUMN action_visibility LONGTEXT NULL AFTER keywords' },
  { name: 'material_type', sql: 'ALTER TABLE resources ADD COLUMN material_type VARCHAR(80) NULL' },
  { name: 'school_only', sql: 'ALTER TABLE resources ADD COLUMN school_only TINYINT(1) NOT NULL DEFAULT 0' },
  { name: 'is_archived', sql: 'ALTER TABLE resources ADD COLUMN is_archived TINYINT(1) NOT NULL DEFAULT 0' },
  { name: 'sort_order', sql: 'ALTER TABLE resources ADD COLUMN sort_order INT NOT NULL DEFAULT 0' },
  { name: 'cover_hidden', sql: 'ALTER TABLE resources ADD COLUMN cover_hidden TINYINT(1) NOT NULL DEFAULT 0 AFTER cover_image' },
];

const fileColumns = [
  { name: 'label', sql: 'ALTER TABLE resource_files ADD COLUMN label VARCHAR(120) NULL AFTER original_name' },
  { name: 'sort_order', sql: 'ALTER TABLE resource_files ADD COLUMN sort_order INT NOT NULL DEFAULT 0 AFTER label' },
  { name: 'is_archived', sql: 'ALTER TABLE resource_files ADD COLUMN is_archived TINYINT(1) NOT NULL DEFAULT 0 AFTER sort_order' },
  { name: 'is_bundle', sql: 'ALTER TABLE resource_files ADD COLUMN is_bundle TINYINT(1) NOT NULL DEFAULT 0' },
  { name: 'premium_only', sql: 'ALTER TABLE resource_files ADD COLUMN premium_only TINYINT(1) NOT NULL DEFAULT 0' },
  { name: 'thumbnail', sql: 'ALTER TABLE resource_files ADD COLUMN thumbnail VARCHAR(500) NULL' },
];

const downloadColumns = [
  { name: 'request_id', sql: 'ALTER TABLE downloads ADD COLUMN request_id VARCHAR(128) NULL UNIQUE AFTER user_agent' },
  { name: 'status', sql: "ALTER TABLE downloads ADD COLUMN status ENUM('reserved','completed') NOT NULL DEFAULT 'completed' AFTER request_id" },
  { name: 'reserved_until', sql: 'ALTER TABLE downloads ADD COLUMN reserved_until DATETIME NULL AFTER status' },
  { name: 'completed_at', sql: 'ALTER TABLE downloads ADD COLUMN completed_at DATETIME NULL AFTER reserved_until' },
];

const pageViewColumns = [
  { name: 'utm_source', sql: 'ALTER TABLE page_views ADD COLUMN utm_source VARCHAR(120) NULL AFTER session_id' },
  { name: 'utm_medium', sql: 'ALTER TABLE page_views ADD COLUMN utm_medium VARCHAR(80) NULL AFTER utm_source' },
  { name: 'utm_campaign', sql: 'ALTER TABLE page_views ADD COLUMN utm_campaign VARCHAR(120) NULL AFTER utm_medium' },
  { name: 'traffic_source', sql: 'ALTER TABLE page_views ADD COLUMN traffic_source VARCHAR(80) NULL AFTER utm_campaign' },
  { name: 'referrer_host', sql: 'ALTER TABLE page_views ADD COLUMN referrer_host VARCHAR(200) NULL AFTER traffic_source' },
];

const userColumns = [
  { name: 'account_type', sql: "ALTER TABLE users ADD COLUMN account_type ENUM('free','paid','school') NOT NULL DEFAULT 'free' AFTER is_blocked" },
  { name: 'signup_method', sql: "ALTER TABLE users ADD COLUMN signup_method VARCHAR(20) NULL AFTER account_type" },
  { name: 'signup_source', sql: 'ALTER TABLE users ADD COLUMN signup_source VARCHAR(80) NULL AFTER signup_method' },
  { name: 'signup_referrer', sql: 'ALTER TABLE users ADD COLUMN signup_referrer VARCHAR(500) NULL AFTER signup_source' },
  { name: 'signup_utm_source', sql: 'ALTER TABLE users ADD COLUMN signup_utm_source VARCHAR(120) NULL AFTER signup_referrer' },
  { name: 'signup_utm_medium', sql: 'ALTER TABLE users ADD COLUMN signup_utm_medium VARCHAR(80) NULL AFTER signup_utm_source' },
  { name: 'signup_utm_campaign', sql: 'ALTER TABLE users ADD COLUMN signup_utm_campaign VARCHAR(120) NULL AFTER signup_utm_medium' },
  { name: 'signup_landing_path', sql: 'ALTER TABLE users ADD COLUMN signup_landing_path VARCHAR(300) NULL AFTER signup_utm_campaign' },
  { name: 'stripe_customer_id', sql: 'ALTER TABLE users ADD COLUMN stripe_customer_id VARCHAR(255) NULL AFTER account_type' },
  { name: 'stripe_subscription_id', sql: 'ALTER TABLE users ADD COLUMN stripe_subscription_id VARCHAR(255) NULL AFTER stripe_customer_id' },
];

const contactMessageColumns = [
  { name: 'status', sql: "ALTER TABLE contact_messages ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'unread' AFTER message" },
  { name: 'read_at', sql: 'ALTER TABLE contact_messages ADD COLUMN read_at TIMESTAMP NULL AFTER status' },
  { name: 'notification_status', sql: "ALTER TABLE contact_messages ADD COLUMN notification_status VARCHAR(30) NOT NULL DEFAULT 'not_configured' AFTER read_at" },
];

async function columnExists(conn, table, column) {
  const [rows] = await conn.execute(
    `SELECT 1 FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1`,
    [dbConfig.database, table, column]
  );
  return rows.length > 0;
}

async function tableExists(conn, table) {
  const [rows] = await conn.execute(
    `SELECT 1 FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? LIMIT 1`,
    [dbConfig.database, table]
  );
  return rows.length > 0;
}

export async function migrate(existingConnection = null) {
  const conn = existingConnection || await mysql.createConnection(dbConfig);
  const ownsConnection = !existingConnection;
  try {
  for (const col of columns) {
    if (!(await columnExists(conn, 'resources', col.name))) {
      await conn.query(col.sql);
      console.log('Coluna adicionada: resources.' + col.name);
    }
  }
  for (const col of categoryColumns) {
    if (!(await columnExists(conn, 'categories', col.name))) {
      await conn.query(col.sql);
      console.log('Coluna adicionada: categories.' + col.name);
    }
  }
  for (const col of resourceColumns) {
    if (!(await columnExists(conn, 'resources', col.name))) {
      await conn.query(col.sql);
      console.log('Coluna adicionada: resources.' + col.name);
    }
  }
  // display_mode ganhou a opção 'gallery'; amplia o ENUM se ainda não tiver (idempotente).
  const [dmRows] = await conn.execute(
    `SELECT COLUMN_TYPE FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'resources' AND COLUMN_NAME = 'display_mode' LIMIT 1`,
    [dbConfig.database]
  );
  if (dmRows.length && !String(dmRows[0].COLUMN_TYPE).includes('gallery')) {
    await conn.query("ALTER TABLE resources MODIFY COLUMN display_mode ENUM('default','grid','gallery') NOT NULL DEFAULT 'default'");
    console.log("Coluna atualizada: resources.display_mode (+gallery)");
  }
  for (const col of fileColumns) {
    if (!(await columnExists(conn, 'resource_files', col.name))) {
      await conn.query(col.sql);
      console.log('Coluna adicionada: resource_files.' + col.name);
    }
  }

  for (const col of downloadColumns) {
    if (!(await columnExists(conn, 'downloads', col.name))) {
      await conn.query(col.sql);
      console.log('Coluna adicionada: downloads.' + col.name);
    }
  }
  if (await tableExists(conn, 'downloads')) {
    await conn.query(
      'CREATE INDEX idx_download_quota ON downloads (user_id, status, reserved_until, created_at)'
    ).catch((error) => {
      // MySQL has no portable CREATE INDEX IF NOT EXISTS.  A duplicate index
      // means the migration already ran and is safe to ignore.
      if (error.code !== 'ER_DUP_KEYNAME') throw error;
    });
  }

  if (!(await tableExists(conn, 'editor_upload_sessions'))) {
    await conn.query(`
      CREATE TABLE editor_upload_sessions (
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
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('Tabela criada: editor_upload_sessions');
  }
  for (const col of userColumns) {
    if (!(await columnExists(conn, 'users', col.name))) {
      await conn.query(col.sql);
      console.log('Coluna adicionada: users.' + col.name);
    }
  }

  if (!(await tableExists(conn, 'contact_messages'))) {
    await conn.query(`
      CREATE TABLE contact_messages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(150) NOT NULL,
        email VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'unread',
        read_at TIMESTAMP NULL,
        notification_status VARCHAR(30) NOT NULL DEFAULT 'not_configured',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('Tabela criada: contact_messages');
  }
  for (const col of contactMessageColumns) {
    if (!(await columnExists(conn, 'contact_messages', col.name))) {
      await conn.query(col.sql);
      console.log('Coluna adicionada: contact_messages.' + col.name);
    }
  }

  if (!(await tableExists(conn, 'page_views'))) {
    await conn.query(`
      CREATE TABLE page_views (
        id INT AUTO_INCREMENT PRIMARY KEY,
        path VARCHAR(500) NOT NULL,
        page_title VARCHAR(200) NULL,
        referrer VARCHAR(500) NULL,
        user_agent VARCHAR(500) NULL,
        session_id VARCHAR(64) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_page_views_created (created_at),
        INDEX idx_page_views_path (path(191)),
        INDEX idx_page_views_session (session_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('Tabela criada: page_views');
  }
  for (const col of pageViewColumns) {
    if (!(await columnExists(conn, 'page_views', col.name))) {
      await conn.query(col.sql);
      console.log('Coluna adicionada: page_views.' + col.name);
    }
  }

  const defaultSettings = [
    ['download_limit_enabled', 'true'],
    ['download_limit_max', '10'],
    ['download_limit_period', 'day'],
    ['download_limit_mode', 'global'],
    ['classroom_enabled', 'true'],
    ['classroom_share_url', ''],
    ['pinterest_enabled', 'true'],
    ['social_pinterest', 'https://www.pinterest.com/jewisheducationalresources1/'],
    ['material_action_preview', 'true'],
    ['material_action_worksheet', 'true'],
    ['material_action_answers', 'true'],
    ['material_action_classroom', 'true'],
    ['material_action_pinterest', 'true'],
    ['material_action_bookmark', 'true'],
    ['theme_color_primary', '#3bafb8'],
    ['theme_color_primary_dark', '#2a929a'],
    ['theme_color_secondary', '#5d6dbe'],
    ['theme_color_secondary_dark', '#4a57a8'],
    ['theme_color_accent', '#89d14f'],
    ['theme_color_sky', '#7ec8f5'],
    ['theme_color_sky_light', '#e0f2ff'],
    ['theme_color_text', '#2c3e50'],
    ['theme_color_text_muted', '#5a6a7a'],
    ['theme_color_background', '#ffffff'],
    ['theme_color_header_bg', '#ffffff'],
    ['theme_color_footer_bg', '#1a2836'],
    ['theme_color_border', '#dce8f0'],
    ['theme_font_family', "'Nunito', system-ui, sans-serif"],
    ['theme_font_size_base', '16'],
    ['theme_border_radius', '12'],
    ['theme_button_radius', '999'],
    ['hero_title', 'Where learning flourishes'],
    ['hero_lead', ''],
    ['hero_cta_text', 'Sign up free'],
    ['hero_cta_link', '/sign-up'],
    ['hero_content_align', 'left'],
    ['home_hero_cta_primary_show', 'true'],
    ['home_hero_cta_secondary_show', 'true'],
    ['hero_bg_image', ''],
    ['hero_show_illustration', 'true'],
    ['block_hero_show', 'true'],
    ['block_library_show', 'true'],
    ['section_library_title', 'Our learning library'],
    ['section_library_lead', 'With hundreds of digital and printable resources, find the best material for your students and community.'],
    ['section_library_cta', 'Explore now'],
    ['block_potential_show', 'true'],
    ['section_potential_title', 'Unlock every student’s potential'],
    ['section_potential_lead', 'Access PDFs, presentations, and worksheets organized by category, with search, filters, and integrated online preview.'],
    ['section_potential_image', '/images/potential/landscape-scene.png'],
    ['block_recent_show', 'true'],
    ['section_recent_title', 'Recent materials'],
    ['block_community_show', 'true'],
    ['section_community_title', 'Join our community!'],
    ['block_access_show', 'true'],
    ['section_access_title', 'Get access today!'],
    ['section_access_cta_text', 'Sign up for free'],
    ['section_access_cta_link', '/sign-up'],
    ['section_access_bg_image', '/images/cta/banner-bg.png'],
    ['section_access_mascot_image', '/images/cta/banner-mascot.png?v=11'],
    ['footer_tagline', ''],
    ['footer_copyright', ''],
    ['footer_show', 'false'],
    ['library_page_head_icon_show', 'false'],
    ['library_subtopics_show', 'false'],
    ['library_results_heading_show', 'false'],
    ['library_material_types_show', 'true'],
    ['library_root_catalog_show', 'false'],
    ['landing_activity_cards', JSON.stringify([
      { img: '/images/potential/activity-chanukah.png', title: 'Activity: Chanukah', pos: 'pos-1' },
      { img: '/images/potential/activity-parasha.png', title: 'Weekly Parashah', pos: 'pos-2' },
      { img: '/images/potential/activity-rosh-hashanah.png', title: 'Rosh Hashanah', pos: 'pos-3' },
      { img: '/images/potential/activity-purim.png', title: 'Atividade: Purim', pos: 'pos-4' },
    ])],
    ['theme_custom_css', ''],
    ['landing_blocks_order', JSON.stringify(['hero', 'library', 'potential', 'recent', 'community', 'access'])],
    ['paywall_plan_name', 'Premium'],
    ['paywall_plan_price', ''],
    ['paywall_upgrade_url', ''],
    ['paywall_limit_title', 'Download limit reached'],
    ['paywall_premium_title', 'Full PDF — Premium only'],
    ['paypal_enabled', 'false'],
    ['paypal_mode', 'sandbox'],
    ['paypal_client_id', ''],
    ['paypal_client_secret', ''],
    ['paypal_plan_amount', '9.99'],
    ['paypal_plan_currency', 'USD'],
    ['paypal_plan_months', '12'],
    ['stripe_product_id', ''],
    ['stripe_price_id', ''],
    ['stripe_plan_months', '1'],
    ['nav_hide_empty', 'true'],
    ['nav_max_top_level', '0'],
  ];
  for (const [key, value] of defaultSettings) {
    await conn.query(
      'INSERT INTO settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_key = setting_key',
      [key, value]
    );
  }

  const [plans] = await conn.query('SELECT COUNT(*) AS c FROM plans');
  if (plans[0].c === 0) {
    await conn.query(
      `INSERT INTO plans (name, slug, description, price, interval_type) VALUES
       ('Premium', 'premium', 'Unlimited downloads and full PDFs', 0, 'monthly')`
    );
    console.log('Plano padrão Premium criado.');
  }

  if (!(await tableExists(conn, 'download_intents'))) {
    await conn.query(`
      CREATE TABLE download_intents (
        id INT AUTO_INCREMENT PRIMARY KEY,
        resource_id INT NOT NULL,
        file_id INT NULL,
        user_id INT NULL,
        ip_address VARCHAR(45) NULL,
        user_agent VARCHAR(500) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE,
        FOREIGN KEY (file_id) REFERENCES resource_files(id) ON DELETE SET NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
      )
    `);
    console.log('Tabela download_intents criada.');
  }

  if (!(await tableExists(conn, 'download_quota_locks'))) {
    await conn.query(`
      CREATE TABLE download_quota_locks (
        quota_key VARCHAR(180) PRIMARY KEY,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('Tabela download_quota_locks criada.');
  }

  if (!(await tableExists(conn, 'analytics_interactions'))) {
    await conn.query(`
      CREATE TABLE analytics_interactions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        event_key VARCHAR(128) NULL,
        event_name VARCHAR(64) NOT NULL,
        resource_id INT NULL,
        file_id INT NULL,
        resource_title VARCHAR(200) NULL,
        file_label VARCHAR(200) NULL,
        page_index INT NULL,
        path VARCHAR(500) NULL,
        session_id VARCHAR(64) NULL,
        user_id INT NULL,
        ip_address VARCHAR(45) NULL,
        user_agent VARCHAR(500) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_analytics_interactions_event (event_name),
        INDEX idx_analytics_interactions_file (resource_id, file_id),
        INDEX idx_analytics_interactions_created (created_at),
        UNIQUE KEY uq_analytics_interactions_event_key (event_key),
        FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE SET NULL,
        FOREIGN KEY (file_id) REFERENCES resource_files(id) ON DELETE SET NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
      )
    `);
    console.log('Tabela analytics_interactions criada.');
  }
  if (await tableExists(conn, 'analytics_interactions')) {
    if (!(await columnExists(conn, 'analytics_interactions', 'event_key'))) {
      await conn.query('ALTER TABLE analytics_interactions ADD COLUMN event_key VARCHAR(128) NULL AFTER id');
      console.log('Coluna adicionada: analytics_interactions.event_key');
    }
    await conn.query(
      'CREATE UNIQUE INDEX uq_analytics_interactions_event_key ON analytics_interactions (event_key)'
    ).catch((error) => {
      // ER_DUP_ENTRY means existing data violates the new uniqueness
      // invariant and must be fixed explicitly. Silently continuing would
      // leave analytics retries non-idempotent after the migration.
      if (error.code !== 'ER_DUP_KEYNAME') throw error;
    });
  }

  if (!(await tableExists(conn, 'stripe_webhook_events'))) {
    await conn.query(`
      CREATE TABLE stripe_webhook_events (
        event_id VARCHAR(255) PRIMARY KEY,
        status ENUM('processing', 'completed') NOT NULL DEFAULT 'processing',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('Tabela stripe_webhook_events criada.');
  }

  if (await tableExists(conn, 'subscriptions')) {
    const cols = await conn.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'subscriptions' AND COLUMN_NAME = 'renewal_reminder_sent_at'`
    );
    if (!cols[0]?.length) {
      await conn.query('ALTER TABLE subscriptions ADD COLUMN renewal_reminder_sent_at DATETIME NULL');
      console.log('Coluna renewal_reminder_sent_at adicionada em subscriptions.');
    }
    if (!(await columnExists(conn, 'subscriptions', 'tier'))) {
      await conn.query("ALTER TABLE subscriptions ADD COLUMN tier VARCHAR(20) NOT NULL DEFAULT 'standard'");
      console.log('Coluna tier adicionada em subscriptions.');
    }
  }

  if (!(await tableExists(conn, 'favorite_folders'))) {
    await conn.query(`
      CREATE TABLE favorite_folders (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        name VARCHAR(80) NOT NULL,
        is_default TINYINT(1) NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    console.log('Tabela favorite_folders criada.');
  }

  if (await tableExists(conn, 'favorites')) {
    const favCols = await conn.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'favorites' AND COLUMN_NAME = 'folder_id'`
    );
    if (!favCols[0]?.length) {
      await conn.query('ALTER TABLE favorites ADD COLUMN folder_id INT NULL AFTER resource_id');
      await conn.query(
        'ALTER TABLE favorites ADD FOREIGN KEY (folder_id) REFERENCES favorite_folders(id) ON DELETE SET NULL'
      );
      console.log('Coluna folder_id adicionada em favorites.');
    }
  }

    console.log('Migrations OK.');
  } finally {
    if (ownsConnection) await conn.end();
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  migrate().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
