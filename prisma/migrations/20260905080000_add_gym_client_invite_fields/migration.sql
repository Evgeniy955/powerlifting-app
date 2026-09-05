-- Gym clients get the same invite-by-email flow as powerlifting athletes:
-- a coach can send (or resend) an invite email, tracked with a one-time
-- token + status, mirroring AthleteProfile.inviteToken/inviteStatus/invitedAt.
ALTER TABLE "GymClient" ADD COLUMN "inviteToken" TEXT;
ALTER TABLE "GymClient" ADD COLUMN "inviteStatus" TEXT NOT NULL DEFAULT 'NONE';
ALTER TABLE "GymClient" ADD COLUMN "invitedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "GymClient_inviteToken_key" ON "GymClient"("inviteToken");

-- Backfill: clients that already signed in (userId set) are, by definition,
-- accepted — don't leave them stuck at "NONE" just because they predate this
-- column.
UPDATE "GymClient" SET "inviteStatus" = 'ACCEPTED' WHERE "userId" IS NOT NULL;
