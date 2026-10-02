CREATE TABLE IF NOT EXISTS `app_states` (
  `owner_id` text PRIMARY KEY NOT NULL,
  `data` text NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);

