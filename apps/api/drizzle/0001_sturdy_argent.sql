
ALTER TABLE "role_permissions" DROP CONSTRAINT "role_permissions_role_id_roles_id_fk";
--> statement-breakpoint
ALTER TABLE "role_permissions" DROP CONSTRAINT "role_permissions_permission_id_permissions_id_fk";
--> statement-breakpoint
ALTER TABLE "role_permissions" ADD COLUMN "scope_type" "role_scope" NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "permissions_id_scope_unique" ON "permissions" USING btree ("id","scope_type");
--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_scope_fk" FOREIGN KEY ("role_id","scope_type") REFERENCES "public"."roles"("id","scope_type") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_scope_fk" FOREIGN KEY ("permission_id","scope_type") REFERENCES "public"."permissions"("id","scope_type") ON DELETE cascade ON UPDATE no action;
