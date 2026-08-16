-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" TIMESTAMP(3),
    "name" TEXT,
    "image" TEXT,
    "role" TEXT NOT NULL DEFAULT 'ATHLETE',
    "googleId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "AthleteProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "coachId" TEXT,
    "displayName" TEXT,
    "inviteEmail" TEXT,
    "inviteToken" TEXT,
    "inviteStatus" TEXT NOT NULL DEFAULT 'NONE',
    "invitedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AthleteProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExerciseCatalog" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "impactCoefficient" DOUBLE PRECISION NOT NULL DEFAULT 1.0,

    CONSTRAINT "ExerciseCatalog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Athlete1RM" (
    "id" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Athlete1RM_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FatigueCoefficient" (
    "id" TEXT NOT NULL,
    "percent1rm" DOUBLE PRECISION NOT NULL,
    "coefficient" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "FatigueCoefficient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RpeTable" (
    "id" TEXT NOT NULL,
    "reps" INTEGER NOT NULL,
    "rpe" DOUBLE PRECISION NOT NULL,
    "percent1rm" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "RpeTable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cycle" (
    "id" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "weeks" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Cycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Microcycle" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "weekNumber" INTEGER NOT NULL,

    CONSTRAINT "Microcycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Workout" (
    "id" TEXT NOT NULL,
    "microcycleId" TEXT NOT NULL,
    "scheduledDate" TIMESTAMP(3) NOT NULL,
    "dayNumber" INTEGER NOT NULL,

    CONSTRAINT "Workout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExerciseEntry" (
    "id" TEXT NOT NULL,
    "workoutId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "multiplier" DOUBLE PRECISION NOT NULL DEFAULT 1.0,

    CONSTRAINT "ExerciseEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SetEntry" (
    "id" TEXT NOT NULL,
    "exerciseEntryId" TEXT NOT NULL,
    "setNumber" INTEGER NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL,
    "reps" INTEGER NOT NULL,
    "rpe" DOUBLE PRECISION,

    CONSTRAINT "SetEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");
CREATE UNIQUE INDEX "AthleteProfile_userId_key" ON "AthleteProfile"("userId");
CREATE UNIQUE INDEX "AthleteProfile_inviteToken_key" ON "AthleteProfile"("inviteToken");
CREATE UNIQUE INDEX "ExerciseCatalog_name_key" ON "ExerciseCatalog"("name");
CREATE UNIQUE INDEX "Athlete1RM_athleteId_exerciseId_key" ON "Athlete1RM"("athleteId", "exerciseId");
CREATE UNIQUE INDEX "FatigueCoefficient_percent1rm_key" ON "FatigueCoefficient"("percent1rm");
CREATE UNIQUE INDEX "RpeTable_reps_rpe_key" ON "RpeTable"("reps", "rpe");
CREATE INDEX "Cycle_athleteId_idx" ON "Cycle"("athleteId");
CREATE UNIQUE INDEX "Microcycle_cycleId_weekNumber_key" ON "Microcycle"("cycleId", "weekNumber");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AthleteProfile" ADD CONSTRAINT "AthleteProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AthleteProfile" ADD CONSTRAINT "AthleteProfile_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Athlete1RM" ADD CONSTRAINT "Athlete1RM_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "AthleteProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Athlete1RM" ADD CONSTRAINT "Athlete1RM_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "ExerciseCatalog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Cycle" ADD CONSTRAINT "Cycle_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "AthleteProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Microcycle" ADD CONSTRAINT "Microcycle_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "Cycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Workout" ADD CONSTRAINT "Workout_microcycleId_fkey" FOREIGN KEY ("microcycleId") REFERENCES "Microcycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExerciseEntry" ADD CONSTRAINT "ExerciseEntry_workoutId_fkey" FOREIGN KEY ("workoutId") REFERENCES "Workout"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExerciseEntry" ADD CONSTRAINT "ExerciseEntry_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "ExerciseCatalog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SetEntry" ADD CONSTRAINT "SetEntry_exerciseEntryId_fkey" FOREIGN KEY ("exerciseEntryId") REFERENCES "ExerciseEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
