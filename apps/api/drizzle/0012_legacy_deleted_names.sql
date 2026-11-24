-- Deletions before #47 named leftover members "Usunięty użytkownik" / "Deleted user" (the deleting user's language).
-- ADR-0019 stores the null marker instead, which every viewer names in their own language. Only members without an account.
UPDATE "members" SET "display_name" = NULL
WHERE "user_id" IS NULL
  AND "display_name" IN ('Usunięty użytkownik', 'Deleted user');--> statement-breakpoint
UPDATE "claims" SET "claimer_name" = NULL
WHERE "user_id" IS NULL
  AND "claimer_name" IN ('Usunięty użytkownik', 'Deleted user');--> statement-breakpoint
UPDATE "changes" SET
  "before" = CASE WHEN "before"->>'displayName' IN ('Usunięty użytkownik', 'Deleted user') THEN jsonb_set("before", '{displayName}', 'null'::jsonb) ELSE "before" END,
  "after" = CASE WHEN "after"->>'displayName' IN ('Usunięty użytkownik', 'Deleted user') THEN jsonb_set("after", '{displayName}', 'null'::jsonb) ELSE "after" END
WHERE "kind" IN ('member.add', 'member.join', 'member.rename')
  AND "target_id" IN (SELECT "id" FROM "members" WHERE "user_id" IS NULL)
  AND ("before"->>'displayName' IN ('Usunięty użytkownik', 'Deleted user') OR "after"->>'displayName' IN ('Usunięty użytkownik', 'Deleted user'));
