-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AthleteProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "coachId" TEXT,
    "displayName" TEXT,
    "inviteEmail" TEXT,
    "inviteToken" TEXT,
    "inviteStatus" TEXT NOT NULL DEFAULT 'NONE',
    "invitedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AthleteProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AthleteProfile_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_AthleteProfile" ("coachId", "createdAt", "id", "userId") SELECT "coachId", "createdAt", "id", "userId" FROM "AthleteProfile";
DROP TABLE "AthleteProfile";
ALTER TABLE "new_AthleteProfile" RENAME TO "AthleteProfile";
CREATE UNIQUE INDEX "AthleteProfile_userId_key" ON "AthleteProfile"("userId");
CREATE UNIQUE INDEX "AthleteProfile_inviteToken_key" ON "AthleteProfile"("inviteToken");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
