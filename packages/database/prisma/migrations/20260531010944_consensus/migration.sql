-- CreateTable
CREATE TABLE "PendingAction" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "command" TEXT NOT NULL,
    "initiator" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "requiredVotes" INTEGER NOT NULL DEFAULT 2,
    "status" TEXT NOT NULL,

    CONSTRAINT "PendingAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsensusApproval" (
    "id" TEXT NOT NULL,
    "actionId" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approver" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "signature" TEXT NOT NULL,

    CONSTRAINT "ConsensusApproval_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ConsensusApproval" ADD CONSTRAINT "ConsensusApproval_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "PendingAction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
