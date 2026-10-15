-- Initial schema for the Mini RFQ Portal (MySQL 8).
-- Tables are created first, foreign keys are added at the end so circular references
-- (Rfq.awardedQuoteId -> Quote, Quote -> Rfq) can be created safely.

-- CreateTable
CREATE TABLE `User` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `passwordHash` VARCHAR(100) NOT NULL,
    `role` ENUM('BUYER', 'VENDOR', 'ADMIN') NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `User_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Rfq` (
    `id` VARCHAR(191) NOT NULL,
    `buyerId` VARCHAR(191) NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `description` TEXT NOT NULL,
    `category` VARCHAR(100) NOT NULL,
    `deliveryLocation` VARCHAR(200) NOT NULL,
    `budget` DECIMAL(16, 2) NULL,
    `currency` CHAR(3) NOT NULL DEFAULT 'INR',
    `deadline` DATETIME(3) NOT NULL,
    `status` ENUM('DRAFT', 'PUBLISHED', 'CLOSED', 'AWARDED') NOT NULL DEFAULT 'DRAFT',
    `publishedAt` DATETIME(3) NULL,
    `awardedAt` DATETIME(3) NULL,
    `awardedById` VARCHAR(191) NULL,
    `awardedQuoteId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Rfq_awardedQuoteId_key`(`awardedQuoteId`),
    INDEX `Rfq_status_deadline_idx`(`status`, `deadline`),
    INDEX `Rfq_buyerId_status_idx`(`buyerId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RfqLineItem` (
    `id` VARCHAR(191) NOT NULL,
    `rfqId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(200) NOT NULL,
    `quantity` INTEGER NOT NULL,
    `unit` VARCHAR(30) NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,

    INDEX `RfqLineItem_rfqId_sortOrder_idx`(`rfqId`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Quote` (
    `id` VARCHAR(191) NOT NULL,
    `rfqId` VARCHAR(191) NOT NULL,
    `vendorId` VARCHAR(191) NOT NULL,
    `status` ENUM('SUBMITTED', 'SHORTLISTED', 'ACCEPTED', 'REJECTED') NOT NULL DEFAULT 'SUBMITTED',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Quote_rfqId_vendorId_key`(`rfqId`, `vendorId`),
    INDEX `Quote_vendorId_idx`(`vendorId`),
    INDEX `Quote_rfqId_status_idx`(`rfqId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `QuoteRevision` (
    `id` VARCHAR(191) NOT NULL,
    `quoteId` VARCHAR(191) NOT NULL,
    `revisionNumber` INTEGER NOT NULL,
    `deliveryDays` INTEGER NOT NULL,
    `notes` TEXT NULL,
    `totalAmount` DECIMAL(16, 2) NOT NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `QuoteRevision_quoteId_revisionNumber_key`(`quoteId`, `revisionNumber`),
    INDEX `QuoteRevision_quoteId_createdAt_idx`(`quoteId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `QuoteRevisionLineItem` (
    `id` VARCHAR(191) NOT NULL,
    `revisionId` VARCHAR(191) NOT NULL,
    `rfqLineItemId` VARCHAR(191) NOT NULL,
    `itemName` VARCHAR(200) NOT NULL,
    `quantity` INTEGER NOT NULL,
    `unit` VARCHAR(30) NOT NULL,
    `unitPrice` DECIMAL(16, 2) NOT NULL,
    `lineTotal` DECIMAL(16, 2) NOT NULL,

    UNIQUE INDEX `QuoteRevisionLineItem_revisionId_rfqLineItemId_key`(`revisionId`, `rfqLineItemId`),
    INDEX `QuoteRevisionLineItem_rfqLineItemId_idx`(`rfqLineItemId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FileAttachment` (
    `id` VARCHAR(191) NOT NULL,
    `rfqId` VARCHAR(191) NULL,
    `quoteId` VARCHAR(191) NULL,
    `kind` ENUM('PDF', 'XLSX') NOT NULL,
    `originalName` VARCHAR(255) NOT NULL,
    `storageKey` VARCHAR(80) NOT NULL,
    `mimeType` VARCHAR(100) NOT NULL,
    `sizeBytes` INTEGER NOT NULL,
    `uploadedById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `FileAttachment_storageKey_key`(`storageKey`),
    INDEX `FileAttachment_rfqId_idx`(`rfqId`),
    INDEX `FileAttachment_quoteId_idx`(`quoteId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StatusHistory` (
    `id` VARCHAR(191) NOT NULL,
    `entityType` ENUM('RFQ', 'QUOTE') NOT NULL,
    `entityId` VARCHAR(191) NOT NULL,
    `fromStatus` VARCHAR(32) NULL,
    `toStatus` VARCHAR(32) NOT NULL,
    `actorId` VARCHAR(191) NULL,
    `metadata` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `StatusHistory_entityType_entityId_createdAt_idx`(`entityType`, `entityId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Rfq` ADD CONSTRAINT `Rfq_buyerId_fkey` FOREIGN KEY (`buyerId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Rfq` ADD CONSTRAINT `Rfq_awardedById_fkey` FOREIGN KEY (`awardedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Rfq` ADD CONSTRAINT `Rfq_awardedQuoteId_fkey` FOREIGN KEY (`awardedQuoteId`) REFERENCES `Quote`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RfqLineItem` ADD CONSTRAINT `RfqLineItem_rfqId_fkey` FOREIGN KEY (`rfqId`) REFERENCES `Rfq`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Quote` ADD CONSTRAINT `Quote_rfqId_fkey` FOREIGN KEY (`rfqId`) REFERENCES `Rfq`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Quote` ADD CONSTRAINT `Quote_vendorId_fkey` FOREIGN KEY (`vendorId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `QuoteRevision` ADD CONSTRAINT `QuoteRevision_quoteId_fkey` FOREIGN KEY (`quoteId`) REFERENCES `Quote`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `QuoteRevision` ADD CONSTRAINT `QuoteRevision_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `QuoteRevisionLineItem` ADD CONSTRAINT `QuoteRevisionLineItem_revisionId_fkey` FOREIGN KEY (`revisionId`) REFERENCES `QuoteRevision`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `QuoteRevisionLineItem` ADD CONSTRAINT `QuoteRevisionLineItem_rfqLineItemId_fkey` FOREIGN KEY (`rfqLineItemId`) REFERENCES `RfqLineItem`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FileAttachment` ADD CONSTRAINT `FileAttachment_rfqId_fkey` FOREIGN KEY (`rfqId`) REFERENCES `Rfq`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FileAttachment` ADD CONSTRAINT `FileAttachment_quoteId_fkey` FOREIGN KEY (`quoteId`) REFERENCES `Quote`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FileAttachment` ADD CONSTRAINT `FileAttachment_uploadedById_fkey` FOREIGN KEY (`uploadedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StatusHistory` ADD CONSTRAINT `StatusHistory_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
