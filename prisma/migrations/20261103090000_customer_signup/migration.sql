CREATE TABLE "Customer" (
"id" TEXT NOT NULL, "name" TEXT NOT NULL, "email" TEXT NOT NULL,
"passwordHash" VARCHAR(255), "emailVerifiedAt" TIMESTAMP(3) NOT NULL,
"disabledAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
"updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "Customer_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "Customer_email_key" ON "Customer"("email");
CREATE TABLE "CustomerIdentity" (
"id" TEXT NOT NULL, "customerId" TEXT NOT NULL, "provider" TEXT NOT NULL,
"subject" TEXT NOT NULL, CONSTRAINT "CustomerIdentity_pkey" PRIMARY KEY ("id"),
CONSTRAINT "CustomerIdentity_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE);
CREATE UNIQUE INDEX "CustomerIdentity_provider_subject_key" ON "CustomerIdentity"("provider","subject");
CREATE INDEX "CustomerIdentity_customerId_idx" ON "CustomerIdentity"("customerId");
CREATE TABLE "CustomerSignupChallenge" (
"id" TEXT NOT NULL, "email" TEXT NOT NULL, "name" TEXT NOT NULL,
"passwordHash" VARCHAR(255) NOT NULL, "codeHash" CHAR(64) NOT NULL,
"attempts" INTEGER NOT NULL DEFAULT 0, "expiresAt" TIMESTAMP(3) NOT NULL,
"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "consumedAt" TIMESTAMP(3),
CONSTRAINT "CustomerSignupChallenge_pkey" PRIMARY KEY ("id"),
CONSTRAINT "CustomerSignupChallenge_attempts_check" CHECK ("attempts" BETWEEN 0 AND 5));
CREATE UNIQUE INDEX "CustomerSignupChallenge_email_key" ON "CustomerSignupChallenge"("email");
CREATE INDEX "CustomerSignupChallenge_expiresAt_idx" ON "CustomerSignupChallenge"("expiresAt");
CREATE TABLE "CustomerRateLimit" (
"key" CHAR(64) NOT NULL, "count" INTEGER NOT NULL DEFAULT 1, "expiresAt" TIMESTAMP(3) NOT NULL,
CONSTRAINT "CustomerRateLimit_pkey" PRIMARY KEY ("key"));
CREATE INDEX "CustomerRateLimit_expiresAt_idx" ON "CustomerRateLimit"("expiresAt");
