-- CreateTable
CREATE TABLE "RpeTable" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reps" INTEGER NOT NULL,
    "rpe" REAL NOT NULL,
    "percent1rm" REAL NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "RpeTable_reps_rpe_key" ON "RpeTable"("reps", "rpe");
