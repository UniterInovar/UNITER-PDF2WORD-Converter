CREATE TABLE `conversions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`originalFilename` varchar(255) NOT NULL,
	`conversionType` enum('pdf_to_word','word_to_pdf') NOT NULL,
	`status` enum('pending','processing','completed','failed') NOT NULL DEFAULT 'pending',
	`errorMessage` text,
	`fileSize` int,
	`duration` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `conversions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `conversions` ADD CONSTRAINT `conversions_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;