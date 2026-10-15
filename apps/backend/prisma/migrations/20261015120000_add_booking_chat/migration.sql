-- AlterEnum
ALTER TYPE "notification_type" ADD VALUE 'BOOKING_MESSAGE';

-- CreateTable
CREATE TABLE "booking_messages" (
    "id" SERIAL NOT NULL,
    "booking_id" INTEGER NOT NULL,
    "sender_id" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "booking_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_chat_reads" (
    "id" SERIAL NOT NULL,
    "booking_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "last_read_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "booking_chat_reads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "booking_messages_booking_id_created_at_idx" ON "booking_messages"("booking_id", "created_at");

-- CreateIndex
CREATE INDEX "booking_messages_sender_id_idx" ON "booking_messages"("sender_id");

-- CreateIndex
CREATE INDEX "booking_chat_reads_user_id_idx" ON "booking_chat_reads"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "booking_chat_reads_booking_id_user_id_key" ON "booking_chat_reads"("booking_id", "user_id");

-- AddForeignKey
ALTER TABLE "booking_messages" ADD CONSTRAINT "booking_messages_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_messages" ADD CONSTRAINT "booking_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_chat_reads" ADD CONSTRAINT "booking_chat_reads_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_chat_reads" ADD CONSTRAINT "booking_chat_reads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

