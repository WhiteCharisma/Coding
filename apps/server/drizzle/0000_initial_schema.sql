CREATE TABLE `app_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL,
	`updated_by` text
);
--> statement-breakpoint
CREATE TABLE `audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`scope` text NOT NULL,
	`community_id` text,
	`actor_id` text,
	`action` text NOT NULL,
	`target_type` text,
	`target_id` text,
	`target_label` text,
	`reason` text,
	`metadata` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`community_id`) REFERENCES `communities`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "audit_events_scope_ck" CHECK("audit_events"."scope" in ('platform','community'))
);
--> statement-breakpoint
CREATE INDEX `audit_events_scope_idx` ON `audit_events` (`scope`,`created_at`);--> statement-breakpoint
CREATE INDEX `audit_events_community_idx` ON `audit_events` (`community_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `channel_categories` (
	`id` text PRIMARY KEY NOT NULL,
	`community_id` text NOT NULL,
	`name` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`community_id`) REFERENCES `communities`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `channel_categories_community_idx` ON `channel_categories` (`community_id`);--> statement-breakpoint
CREATE TABLE `channel_overwrites` (
	`channel_id` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`allow` integer DEFAULT 0 NOT NULL,
	`deny` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`channel_id`, `target_type`, `target_id`),
	FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "channel_overwrites_type_ck" CHECK("channel_overwrites"."target_type" in ('role','member'))
);
--> statement-breakpoint
CREATE TABLE `channel_participants` (
	`channel_id` text NOT NULL,
	`user_id` text NOT NULL,
	`joined_at` integer NOT NULL,
	PRIMARY KEY(`channel_id`, `user_id`),
	FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `channel_participants_user_idx` ON `channel_participants` (`user_id`);--> statement-breakpoint
CREATE TABLE `channels` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`community_id` text,
	`category_id` text,
	`name` text DEFAULT '' NOT NULL,
	`topic` text DEFAULT '' NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`owner_id` text,
	`dm_key` text,
	`last_message_id` text,
	`last_message_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`community_id`) REFERENCES `communities`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `channel_categories`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "channels_kind_ck" CHECK("channels"."kind" in ('text','dm','group_dm')),
	CONSTRAINT "channels_scope_ck" CHECK(("channels"."kind" = 'text' and "channels"."community_id" is not null) or ("channels"."kind" <> 'text' and "channels"."community_id" is null))
);
--> statement-breakpoint
CREATE INDEX `channels_community_idx` ON `channels` (`community_id`,`position`);--> statement-breakpoint
CREATE UNIQUE INDEX `channels_dm_key_uq` ON `channels` (`dm_key`);--> statement-breakpoint
CREATE TABLE `communities` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`icon_id` text,
	`visibility` text DEFAULT 'private' NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`owner_id` text NOT NULL,
	`member_count` integer DEFAULT 0 NOT NULL,
	`is_demo` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`icon_id`) REFERENCES `uploads`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "communities_visibility_ck" CHECK("communities"."visibility" in ('public','private'))
);
--> statement-breakpoint
CREATE INDEX `communities_visibility_idx` ON `communities` (`visibility`,`member_count`);--> statement-breakpoint
CREATE INDEX `communities_owner_idx` ON `communities` (`owner_id`);--> statement-breakpoint
CREATE TABLE `community_bans` (
	`community_id` text NOT NULL,
	`user_id` text NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`banned_by` text,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`community_id`, `user_id`),
	FOREIGN KEY (`community_id`) REFERENCES `communities`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`banned_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `community_members` (
	`community_id` text NOT NULL,
	`user_id` text NOT NULL,
	`joined_at` integer NOT NULL,
	PRIMARY KEY(`community_id`, `user_id`),
	FOREIGN KEY (`community_id`) REFERENCES `communities`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `community_members_user_idx` ON `community_members` (`user_id`);--> statement-breakpoint
CREATE TABLE `email_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`purpose` text NOT NULL,
	`token_hash` text NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "email_tokens_purpose_ck" CHECK("email_tokens"."purpose" in ('verify_email','reset_password'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `email_tokens_hash_uq` ON `email_tokens` (`token_hash`);--> statement-breakpoint
CREATE INDEX `email_tokens_user_idx` ON `email_tokens` (`user_id`,`purpose`);--> statement-breakpoint
CREATE TABLE `invites` (
	`code` text PRIMARY KEY NOT NULL,
	`community_id` text NOT NULL,
	`inviter_id` text,
	`target_user_id` text,
	`max_uses` integer,
	`uses` integer DEFAULT 0 NOT NULL,
	`expires_at` integer,
	`revoked_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`community_id`) REFERENCES `communities`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`inviter_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`target_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `invites_community_idx` ON `invites` (`community_id`);--> statement-breakpoint
CREATE INDEX `invites_target_idx` ON `invites` (`target_user_id`);--> statement-breakpoint
CREATE TABLE `member_roles` (
	`community_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role_id` text NOT NULL,
	PRIMARY KEY(`community_id`, `user_id`, `role_id`),
	FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`community_id`,`user_id`) REFERENCES `community_members`(`community_id`,`user_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `member_roles_role_idx` ON `member_roles` (`role_id`);--> statement-breakpoint
CREATE TABLE `message_mentions` (
	`message_id` text NOT NULL,
	`user_id` text NOT NULL,
	PRIMARY KEY(`message_id`, `user_id`),
	FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `message_mentions_user_idx` ON `message_mentions` (`user_id`,`message_id`);--> statement-breakpoint
CREATE TABLE `message_reactions` (
	`message_id` text NOT NULL,
	`user_id` text NOT NULL,
	`emoji` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`message_id`, `emoji`, `user_id`),
	FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`seq` integer PRIMARY KEY NOT NULL,
	`id` text NOT NULL,
	`channel_id` text NOT NULL,
	`author_id` text NOT NULL,
	`content` text NOT NULL,
	`kind` text DEFAULT 'default' NOT NULL,
	`reply_to_id` text,
	`nonce` text,
	`mention_everyone` integer DEFAULT false NOT NULL,
	`edited_at` integer,
	`deleted_at` integer,
	`pinned_at` integer,
	`pinned_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reply_to_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "messages_kind_ck" CHECK("messages"."kind" in ('default','system'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `messages_id_uq` ON `messages` (`id`);--> statement-breakpoint
CREATE INDEX `messages_channel_idx` ON `messages` (`channel_id`,`id`);--> statement-breakpoint
CREATE INDEX `messages_author_idx` ON `messages` (`author_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `messages_author_nonce_uq` ON `messages` (`author_id`,`nonce`);--> statement-breakpoint
CREATE INDEX `messages_pinned_idx` ON `messages` (`channel_id`,`pinned_at`) WHERE "messages"."pinned_at" is not null;--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`actor_id` text,
	`community_id` text,
	`channel_id` text,
	`message_id` text,
	`data` text DEFAULT '{}' NOT NULL,
	`count` integer DEFAULT 1 NOT NULL,
	`read_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`community_id`) REFERENCES `communities`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `notifications_user_idx` ON `notifications` (`user_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `notifications_unread_idx` ON `notifications` (`user_id`,`read_at`);--> statement-breakpoint
CREATE INDEX `notifications_channel_idx` ON `notifications` (`channel_id`);--> statement-breakpoint
CREATE TABLE `read_states` (
	`user_id` text NOT NULL,
	`channel_id` text NOT NULL,
	`last_read_id` text,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `channel_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `registration_invites` (
	`code` text PRIMARY KEY NOT NULL,
	`created_by` text,
	`note` text DEFAULT '' NOT NULL,
	`max_uses` integer,
	`uses` integer DEFAULT 0 NOT NULL,
	`expires_at` integer,
	`revoked_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `reports` (
	`id` text PRIMARY KEY NOT NULL,
	`reporter_id` text,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`community_id` text,
	`reason` text NOT NULL,
	`details` text DEFAULT '' NOT NULL,
	`snapshot` text DEFAULT '{}' NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`resolved_by` text,
	`resolution_note` text DEFAULT '' NOT NULL,
	`resolved_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`reporter_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`resolved_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "reports_status_ck" CHECK("reports"."status" in ('open','resolved','dismissed'))
);
--> statement-breakpoint
CREATE INDEX `reports_status_idx` ON `reports` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `reports_target_idx` ON `reports` (`target_type`,`target_id`);--> statement-breakpoint
CREATE TABLE `roles` (
	`id` text PRIMARY KEY NOT NULL,
	`community_id` text NOT NULL,
	`name` text NOT NULL,
	`color` text,
	`position` integer NOT NULL,
	`permissions` integer DEFAULT 0 NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`hoist` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`community_id`) REFERENCES `communities`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `roles_community_idx` ON `roles` (`community_id`,`position`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`user_agent` text DEFAULT '' NOT NULL,
	`ip` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_token_hash_uq` ON `sessions` (`token_hash`);--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `sessions_expires_idx` ON `sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `uploads` (
	`id` text PRIMARY KEY NOT NULL,
	`uploader_id` text NOT NULL,
	`purpose` text NOT NULL,
	`channel_id` text,
	`message_id` text,
	`name` text NOT NULL,
	`mime` text NOT NULL,
	`size` integer NOT NULL,
	`storage_key` text NOT NULL,
	`width` integer,
	`height` integer,
	`duration_ms` integer,
	`waveform` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`uploader_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "uploads_purpose_ck" CHECK("uploads"."purpose" in ('attachment','avatar','community_icon')),
	CONSTRAINT "uploads_status_ck" CHECK("uploads"."status" in ('pending','attached','deleted'))
);
--> statement-breakpoint
CREATE INDEX `uploads_message_idx` ON `uploads` (`message_id`);--> statement-breakpoint
CREATE INDEX `uploads_status_idx` ON `uploads` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `uploads_uploader_idx` ON `uploads` (`uploader_id`);--> statement-breakpoint
CREATE TABLE `user_blocks` (
	`blocker_id` text NOT NULL,
	`blocked_id` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`blocker_id`, `blocked_id`),
	FOREIGN KEY (`blocker_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`blocked_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `user_blocks_blocked_idx` ON `user_blocks` (`blocked_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`email` text NOT NULL,
	`email_verified_at` integer,
	`password_hash` text NOT NULL,
	`display_name` text NOT NULL,
	`avatar_id` text,
	`headline` text DEFAULT '' NOT NULL,
	`bio` text DEFAULT '' NOT NULL,
	`disciplines` text DEFAULT '[]' NOT NULL,
	`location` text DEFAULT '' NOT NULL,
	`timezone` text DEFAULT '' NOT NULL,
	`links` text DEFAULT '[]' NOT NULL,
	`current_projects` text DEFAULT '' NOT NULL,
	`banner_hue` integer,
	`platform_role` text DEFAULT 'member' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`suspended_until` integer,
	`suspension_reason` text,
	`presence` text DEFAULT 'online' NOT NULL,
	`dm_policy` text DEFAULT 'everyone' NOT NULL,
	`notification_prefs` text DEFAULT '{}' NOT NULL,
	`muted_community_ids` text DEFAULT '[]' NOT NULL,
	`onboarding_completed_at` integer,
	`is_demo` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`avatar_id`) REFERENCES `uploads`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "users_platform_role_ck" CHECK("users"."platform_role" in ('member','moderator','admin')),
	CONSTRAINT "users_status_ck" CHECK("users"."status" in ('active','suspended','deleted'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_uq` ON `users` (`username`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_uq` ON `users` (`email`);--> statement-breakpoint
CREATE INDEX `users_status_idx` ON `users` (`status`);