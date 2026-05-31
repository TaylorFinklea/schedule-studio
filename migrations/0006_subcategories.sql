-- Two-level category hierarchy. A category with parent_id = NULL is a
-- top-level parent; a non-NULL parent_id points at the owning parent.
-- App code enforces depth <= 2 (a parent_id may only reference a category
-- that is itself top-level). Existing rows stay top-level (NULL default),
-- so this migration is fully backwards compatible.
ALTER TABLE categories ADD COLUMN parent_id TEXT REFERENCES categories(id);
