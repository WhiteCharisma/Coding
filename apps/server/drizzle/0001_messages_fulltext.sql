-- Full-text search index for message content (SQLite FTS5, external content).
-- The index stores only tokens; message text lives in `messages` and is joined
-- on messages.seq (a stable INTEGER PRIMARY KEY). Triggers keep it in sync.
-- Authorization is NOT handled here: every search query must restrict results
-- to channels the requesting user can read (see src/search/service.ts).
CREATE VIRTUAL TABLE `messages_fts` USING fts5(
  content,
  content='messages',
  content_rowid='seq',
  tokenize='unicode61 remove_diacritics 2'
);
--> statement-breakpoint
CREATE TRIGGER `messages_fts_ai` AFTER INSERT ON `messages` BEGIN
  INSERT INTO `messages_fts`(rowid, content) VALUES (new.seq, new.content);
END;
--> statement-breakpoint
CREATE TRIGGER `messages_fts_ad` AFTER DELETE ON `messages` BEGIN
  INSERT INTO `messages_fts`(`messages_fts`, rowid, content) VALUES ('delete', old.seq, old.content);
END;
--> statement-breakpoint
CREATE TRIGGER `messages_fts_au` AFTER UPDATE OF content ON `messages` BEGIN
  INSERT INTO `messages_fts`(`messages_fts`, rowid, content) VALUES ('delete', old.seq, old.content);
  INSERT INTO `messages_fts`(rowid, content) VALUES (new.seq, new.content);
END;
