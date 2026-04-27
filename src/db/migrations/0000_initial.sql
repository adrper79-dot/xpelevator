-- xpelevator initial migration
-- Members, journeys, enrollments, milestones, subscriptions

CREATE TABLE IF NOT EXISTS "members" (
  "id"                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id"            TEXT NOT NULL UNIQUE,
  "email"              TEXT NOT NULL UNIQUE,
  "display_name"       TEXT NOT NULL,
  "avatar_url"         TEXT,
  "plan"               TEXT NOT NULL DEFAULT 'free',
  "stripe_customer_id" TEXT,
  "created_at"         TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "journeys" (
  "id"            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "title"         TEXT NOT NULL,
  "description"   TEXT,
  "category"      TEXT NOT NULL,
  "difficulty"    TEXT NOT NULL DEFAULT 'beginner',
  "duration_days" INTEGER NOT NULL,
  "status"        TEXT NOT NULL DEFAULT 'draft',
  "metadata"      JSONB,
  "created_at"    TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "enrollments" (
  "id"           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "member_id"    UUID NOT NULL REFERENCES "members"("id") ON DELETE CASCADE,
  "journey_id"   UUID NOT NULL REFERENCES "journeys"("id"),
  "status"       TEXT NOT NULL DEFAULT 'active',
  "progress_pct" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "started_at"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  "completed_at" TIMESTAMPTZ,
  "created_at"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "milestones" (
  "id"            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "enrollment_id" UUID NOT NULL REFERENCES "enrollments"("id") ON DELETE CASCADE,
  "journey_id"    UUID NOT NULL REFERENCES "journeys"("id"),
  "title"         TEXT NOT NULL,
  "day_number"    INTEGER NOT NULL,
  "completed"     BOOLEAN NOT NULL DEFAULT false,
  "completed_at"  TIMESTAMPTZ,
  "notes"         TEXT,
  "created_at"    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "subscriptions" (
  "id"                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "member_id"            UUID NOT NULL UNIQUE REFERENCES "members"("id") ON DELETE CASCADE,
  "stripe_customer_id"   TEXT NOT NULL UNIQUE,
  "stripe_price_id"      TEXT NOT NULL,
  "status"               TEXT NOT NULL,
  "current_period_end"   TIMESTAMPTZ NOT NULL,
  "created_at"           TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_enrollments_member_id ON "enrollments"("member_id");
CREATE INDEX IF NOT EXISTS idx_enrollments_journey_id ON "enrollments"("journey_id");
CREATE INDEX IF NOT EXISTS idx_milestones_enrollment_id ON "milestones"("enrollment_id");
CREATE INDEX IF NOT EXISTS idx_subscriptions_member_id ON "subscriptions"("member_id");
CREATE INDEX IF NOT EXISTS idx_journeys_status ON "journeys"("status");
CREATE INDEX IF NOT EXISTS idx_journeys_category ON "journeys"("category");
