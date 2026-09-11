alter table memory_metadata add column if not exists safety_flag text;
-- Set when the app overrides an extracted type/reminder because
-- screenForCrisisContent() or classifyIntent() (lib/services/safety.ts)
-- flagged the note's text - e.g. "self_harm_blocked", "violence_blocked".
-- Null for the overwhelming majority of ordinary notes.
