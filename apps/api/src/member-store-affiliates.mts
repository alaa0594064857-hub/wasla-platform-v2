import type { IncomingMessage, ServerResponse } from "node:http";
import { createHash, randomBytes } from "node:crypto";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "./auth.mjs";
import { getDatabasePool } from "./database.js";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function send(res: ServerResponse, status: number, data: Record<string, unknown>) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  res.end(JSON.stringify(data));
}
async function body(req: IncomingMessage): Promise<Record<string, unknown> | null> {
  let raw = "", size = 0;
  for await (const chunk of req) {
    size += Buffer.byteLength(chunk);
    if (size > 12000) throw new Error("too_large");
    raw += chunk.toString();
  }
  const value: unknown = JSON.parse(raw);
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
async function sessionFor(req: IncomingMessage, res: ServerResponse) {
  const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
  if (!session) send(res, 401, { success: false, error: "Authentication required" });
  return session;
}
async function storePermission(storeId: string, userId: string, permissions: string[]) {
  const db = getDatabasePool();
  const result = await db.query(
    `SELECT s.id,s.account_id AS "accountId",s.slug,s.name
     FROM stores s WHERE s.id=$1 AND (
       EXISTS (SELECT 1 FROM account_members am JOIN roles r ON r.id=am.role_id AND r.scope_type=am.role_scope
         JOIN role_permissions rp ON rp.role_id=r.id AND rp.scope_type=r.scope_type
         JOIN permissions p ON p.id=rp.permission_id AND p.scope_type=rp.scope_type
         WHERE am.account_id=s.account_id AND am.user_id=$2 AND am.status='active' AND p.permission_key=ANY($3::text[]))
       OR EXISTS (SELECT 1 FROM store_members sm JOIN roles r ON r.id=sm.role_id AND r.scope_type=sm.role_scope
         JOIN role_permissions rp ON rp.role_id=r.id AND rp.scope_type=r.scope_type
         JOIN permissions p ON p.id=rp.permission_id AND p.scope_type=rp.scope_type
         WHERE sm.store_id=s.id AND sm.user_id=$2 AND sm.status='active' AND p.permission_key=ANY($3::text[]))
     ) LIMIT 1`,
    [storeId, userId, permissions],
  );
  return result.rows[0] ?? null;
}

/** Idempotent schema bootstrap for member-to-member affiliate programs and audit-safe attribution. */
export async function ensureMemberStoreAffiliateTables(): Promise<void> {
  const db = getDatabasePool();
  await db.query(`
    CREATE TABLE IF NOT EXISTS member_store_affiliate_programs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      merchant_store_id uuid NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
      name varchar(120) NOT NULL CHECK (length(trim(name)) BETWEEN 3 AND 120),
      description varchar(1200),
      commission_bps integer NOT NULL CHECK (commission_bps BETWEEN 1 AND 5000),
      status varchar(16) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','paused','closed')),
      created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      created_at timestamptz NOT NULL DEFAULT NOW(),
      updated_at timestamptz NOT NULL DEFAULT NOW(),
      UNIQUE (merchant_store_id, name)
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS member_store_affiliate_products (
      program_id uuid NOT NULL REFERENCES member_store_affiliate_programs(id) ON DELETE RESTRICT,
      product_id uuid NOT NULL REFERENCES store_products(id) ON DELETE RESTRICT,
      created_at timestamptz NOT NULL DEFAULT NOW(),
      PRIMARY KEY (program_id, product_id)
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS member_store_affiliate_applications (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      program_id uuid NOT NULL REFERENCES member_store_affiliate_programs(id) ON DELETE RESTRICT,
      affiliate_store_id uuid NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
      applicant_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      status varchar(16) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','withdrawn')),
      message varchar(1000),
      reviewed_by uuid REFERENCES users(id) ON DELETE RESTRICT,
      reviewed_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT NOW(),
      updated_at timestamptz NOT NULL DEFAULT NOW(),
      UNIQUE (program_id, affiliate_store_id)
    )
  `);
  await db.query(`CREATE INDEX IF NOT EXISTS member_store_affiliate_programs_public_idx ON member_store_affiliate_programs(status, created_at DESC)`);
  await db.query(`CREATE INDEX IF NOT EXISTS member_store_affiliate_applications_store_idx ON member_store_affiliate_applications(affiliate_store_id, created_at DESC)`);
  await db.query(`CREATE INDEX IF NOT EXISTS member_store_affiliate_applications_program_idx ON member_store_affiliate_applications(program_id, status, created_at DESC)`);

  await db.query(`
    CREATE TABLE IF NOT EXISTS member_store_affiliate_links (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      application_id uuid NOT NULL UNIQUE REFERENCES member_store_affiliate_applications(id) ON DELETE RESTRICT,
      token_hash char(64) NOT NULL UNIQUE,
      active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT NOW(),
      last_used_at timestamptz
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS member_store_order_affiliate_attributions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      order_id uuid NOT NULL REFERENCES member_store_orders(id) ON DELETE RESTRICT,
      product_id uuid NOT NULL REFERENCES store_products(id) ON DELETE RESTRICT,
      program_id uuid NOT NULL REFERENCES member_store_affiliate_programs(id) ON DELETE RESTRICT,
      application_id uuid NOT NULL REFERENCES member_store_affiliate_applications(id) ON DELETE RESTRICT,
      merchant_store_id uuid NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
      affiliate_store_id uuid NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
      quantity integer NOT NULL CHECK (quantity > 0),
      commission_bps integer NOT NULL CHECK (commission_bps BETWEEN 1 AND 5000),
      line_subtotal numeric(14,2) NOT NULL CHECK (line_subtotal >= 0),
      commission_amount numeric(14,2) NOT NULL CHECK (commission_amount >= 0),
      currency varchar(3) NOT NULL,
      created_at timestamptz NOT NULL DEFAULT NOW(),
      UNIQUE (order_id, product_id)
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS member_store_affiliate_commission_ledger (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      attribution_id uuid NOT NULL REFERENCES member_store_order_affiliate_attributions(id) ON DELETE RESTRICT,
      event_type varchar(16) NOT NULL CHECK (event_type IN ('pending','reversal')),
      amount numeric(14,2) NOT NULL,
      currency varchar(3) NOT NULL,
      idempotency_key varchar(180) NOT NULL UNIQUE,
      reference_type varchar(32) NOT NULL,
      reference_id uuid NOT NULL,
      metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT NOW()
    )
  `);
  await db.query(`CREATE INDEX IF NOT EXISTS member_store_affiliate_links_active_idx ON member_store_affiliate_links(active, application_id)`);
  await db.query(`CREATE INDEX IF NOT EXISTS member_store_order_affiliations_order_idx ON member_store_order_affiliate_attributions(order_id)`);
  await db.query(`CREATE INDEX IF NOT EXISTS member_store_order_affiliations_affiliate_idx ON member_store_order_affiliate_attributions(affiliate_store_id, created_at DESC)`);
  await db.query(`
    CREATE OR REPLACE FUNCTION wasla_reject_member_affiliate_ledger_mutation()
    RETURNS trigger LANGUAGE plpgsql AS $wasla$
    BEGIN
      RAISE EXCEPTION 'member_store_affiliate_commission_ledger is append-only';
    END;
    $wasla$
  `);
  await db.query(`DROP TRIGGER IF EXISTS member_store_affiliate_commission_ledger_immutable ON member_store_affiliate_commission_ledger`);
  await db.query(`
    CREATE TRIGGER member_store_affiliate_commission_ledger_immutable
    BEFORE UPDATE OR DELETE ON member_store_affiliate_commission_ledger
    FOR EACH ROW EXECUTE FUNCTION wasla_reject_member_affiliate_ledger_mutation()
  `);

}

/** Merchant manages their program; an affiliate store can request to join; merchant explicitly approves. */
export async function handleMemberStoreAffiliateRequest(req: IncomingMessage, res: ServerResponse, action: "programs" | "apply" | "applications", slug?: string, id?: string): Promise<void> {
  const current = await sessionFor(req, res);
  if (!current) return;
  const db = getDatabasePool();

  if (action === "programs") {
    if (!slug || !["GET", "POST"].includes(req.method ?? "")) { send(res, 405, { success: false, error: "Method not allowed" }); return; }
    const storeResult = await db.query("SELECT id FROM stores WHERE slug=$1 AND status='active' LIMIT 1", [slug]);
    if (!storeResult.rowCount) { send(res, 404, { success: false, error: "Store not found" }); return; }
    const storeId = storeResult.rows[0].id as string;
    const access = await storePermission(storeId, current.user.id, ["store.order.read","store.order.manage","account.order.read","account.order.manage"]);
    if (!access) { send(res, 403, { success: false, error: "Store management permission required" }); return; }
    if (req.method === "GET") {
      const rows = await db.query(
        `SELECT p.id,p.name,p.description,p.commission_bps AS "commissionBps",p.status,p.created_at AS "createdAt",
          COUNT(DISTINCT ap.product_id)::int AS "productCount",
          COUNT(DISTINCT a.id) FILTER (WHERE a.status='pending')::int AS "pendingApplications"
         FROM member_store_affiliate_programs p
         LEFT JOIN member_store_affiliate_products ap ON ap.program_id=p.id
         LEFT JOIN member_store_affiliate_applications a ON a.program_id=p.id
         WHERE p.merchant_store_id=$1 GROUP BY p.id ORDER BY p.created_at DESC`,
        [storeId],
      );
      send(res, 200, { success: true, programs: rows.rows });
      return;
    }
    let input: Record<string, unknown> | null;
    try { input = await body(req); } catch (error) { send(res, error instanceof Error && error.message === "too_large" ? 413 : 400, { success: false, error: "Invalid request body" }); return; }
    const name = typeof input?.name === "string" ? input.name.trim() : "";
    const description = typeof input?.description === "string" ? input.description.trim() : "";
    const bps = input?.commissionBps;
    const productIds = input?.productIds;
    if (!input || name.length < 3 || name.length > 120 || description.length > 1200 ||
      typeof bps !== "number" || !Number.isInteger(bps) || bps < 1 || bps > 5000 ||
      !Array.isArray(productIds) || productIds.length < 1 || productIds.length > 100 ||
      productIds.some(value => typeof value !== "string" || !uuid.test(value)) ||
      new Set(productIds).size !== productIds.length) {
      send(res, 400, { success: false, error: "Enter a program name, commission from 0.01% to 50%, and 1–100 valid product IDs" }); return;
    }
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      const eligible = await client.query(
        "SELECT id FROM store_products WHERE store_id=$1 AND status='active' AND stock_quantity>0 AND id=ANY($2::uuid[]) FOR SHARE",
        [storeId, productIds],
      );
      if (eligible.rowCount !== productIds.length) { await client.query("ROLLBACK"); send(res, 409, { success: false, error: "Only published, in-stock products from this store can be included" }); return; }
      const created = await client.query(
        `INSERT INTO member_store_affiliate_programs(merchant_store_id,name,description,commission_bps,status,created_by)
         VALUES($1,$2,$3,$4,'draft',$5) RETURNING id,name,description,commission_bps AS "commissionBps",status`,
        [storeId,name,description || null,bps,current.user.id],
      );
      for (const productId of productIds as string[]) await client.query(
        "INSERT INTO member_store_affiliate_products(program_id,product_id) VALUES($1,$2)",
        [created.rows[0].id,productId],
      );
      await client.query("COMMIT");
      send(res, 201, { success: true, program: created.rows[0], notice: "Program saved as a draft. Activate it only after reviewing its terms." });
    } catch (error) { await client.query("ROLLBACK"); if ((error as {code?:string})?.code==="23505") { send(res,409,{success:false,error:"A program with this name already exists"}); return; } throw error; }
    finally { client.release(); }
    return;
  }

  if (action === "apply") {
    if (req.method !== "POST" || !id || !uuid.test(id)) { send(res, 405, { success: false, error: "Invalid affiliate program request" }); return; }
    let input: Record<string, unknown> | null;
    try { input = await body(req); } catch (error) { send(res, error instanceof Error && error.message === "too_large" ? 413 : 400, { success: false, error: "Invalid request body" }); return; }
    const affiliateStoreSlug = typeof input?.affiliateStoreSlug === "string" ? input.affiliateStoreSlug.trim() : "";
    const message = typeof input?.message === "string" ? input.message.trim() : "";
    if (!input || affiliateStoreSlug.length < 2 || affiliateStoreSlug.length > 120 || message.length > 1000) { send(res,400,{success:false,error:"Choose your store and provide an optional message"}); return; }
    const program = await db.query(
      `SELECT p.id,p.merchant_store_id AS "merchantStoreId",s.slug AS "merchantSlug"
       FROM member_store_affiliate_programs p JOIN stores s ON s.id=p.merchant_store_id
       JOIN accounts a ON a.id=s.account_id
       WHERE p.id=$1 AND p.status='active' AND s.status='active' AND a.status='active'
         AND EXISTS (SELECT 1 FROM business_profiles bp WHERE bp.account_id=a.id AND bp.verification_status='verified')
       LIMIT 1`,
      [id],
    );
    if (!program.rowCount) { send(res,404,{success:false,error:"Active affiliate program not found"}); return; }
    const affiliateStore = await db.query(
      "SELECT id,account_id AS \"accountId\" FROM stores WHERE slug=$1 AND status='active' LIMIT 1",
      [affiliateStoreSlug],
    );
    if (!affiliateStore.rowCount) { send(res,404,{success:false,error:"Your active affiliate store was not found"}); return; }
    const ownAccess = await storePermission(affiliateStore.rows[0].id,current.user.id,["store.order.read","store.order.manage","account.order.read","account.order.manage"]);
    if (!ownAccess) { send(res,403,{success:false,error:"You must manage the affiliate store you submit"}); return; }
    if (affiliateStore.rows[0].id === program.rows[0].merchantStoreId) { send(res,409,{success:false,error:"A store cannot promote its own program"}); return; }
    try {
      const inserted = await db.query(
        `INSERT INTO member_store_affiliate_applications(program_id,affiliate_store_id,applicant_user_id,message)
         VALUES($1,$2,$3,$4)
         ON CONFLICT(program_id,affiliate_store_id) DO UPDATE
           SET status='pending',applicant_user_id=EXCLUDED.applicant_user_id,message=EXCLUDED.message,
               reviewed_by=NULL,reviewed_at=NULL,updated_at=NOW()
           WHERE member_store_affiliate_applications.status IN ('rejected','withdrawn')
         RETURNING id,status,created_at AS "createdAt"`,
        [id,affiliateStore.rows[0].id,current.user.id,message || null],
      );
      if (!inserted.rowCount) { send(res,409,{success:false,error:"This store has already applied to the program"}); return; }
      send(res,201,{success:true,application:inserted.rows[0]});
    } catch (error) { throw error; }
    return;
  }

  if (action === "applications") {
    if (!slug || !id || !uuid.test(id) || req.method !== "PATCH") { send(res,405,{success:false,error:"Invalid application review request"}); return; }
    let input: Record<string, unknown> | null;
    try { input = await body(req); } catch (error) { send(res,error instanceof Error && error.message==="too_large"?413:400,{success:false,error:"Invalid request body"}); return; }
    const decision = input?.decision;
    if (!input || !["approve","reject"].includes(String(decision))) { send(res,400,{success:false,error:"Choose approve or reject"}); return; }
    const found = await db.query(
      `SELECT a.id,a.status,p.id AS "programId",p.merchant_store_id AS "merchantStoreId"
       FROM member_store_affiliate_applications a JOIN member_store_affiliate_programs p ON p.id=a.program_id
       JOIN stores s ON s.id=p.merchant_store_id
       WHERE a.id=$1 AND s.slug=$2 AND s.status='active' AND p.status='active' LIMIT 1`,
      [id,slug],
    );
    if (!found.rowCount) { send(res,404,{success:false,error:"Application not found"}); return; }
    const access = await storePermission(found.rows[0].merchantStoreId,current.user.id,["store.order.manage","account.order.manage"]);
    if (!access) { send(res,403,{success:false,error:"Merchant store management permission required"}); return; }
    if (found.rows[0].status !== "pending") { send(res,409,{success:false,error:"This application has already been reviewed"}); return; }
    const updated = await db.query(
      `UPDATE member_store_affiliate_applications SET status=$2,reviewed_by=$3,reviewed_at=NOW(),updated_at=NOW()
       WHERE id=$1 AND status='pending' RETURNING id,status,reviewed_at AS "reviewedAt"`,
      [id,decision==="approve"?"approved":"rejected",current.user.id],
    );
    send(res,200,{success:true,application:updated.rows[0]});
  }
}


/** Public discovery exposes only active programs from verified, active merchants. */
export async function handlePublicMemberAffiliatePrograms(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== "GET") { send(res,405,{success:false,error:"Method not allowed"}); return; }
  const result = await getDatabasePool().query(
    `SELECT p.id,p.name,p.description,p.commission_bps AS "commissionBps",
      s.name AS "merchantStoreName",s.slug AS "merchantStoreSlug",
      COUNT(DISTINCT ap.product_id)::int AS "eligibleProductCount"
     FROM member_store_affiliate_programs p
     JOIN stores s ON s.id=p.merchant_store_id AND s.status='active'
     JOIN accounts a ON a.id=s.account_id AND a.status='active'
     JOIN business_profiles bp ON bp.account_id=a.id AND bp.verification_status='verified'
     JOIN member_store_affiliate_products ap ON ap.program_id=p.id
     JOIN store_products sp ON sp.id=ap.product_id AND sp.store_id=s.id AND sp.status='active' AND sp.stock_quantity>0
     WHERE p.status='active'
     GROUP BY p.id,s.name,s.slug ORDER BY p.created_at DESC LIMIT 100`,
  );
  send(res,200,{success:true,programs:result.rows});
}

/** Merchant can activate or pause a draft program after confirming its terms. */
export async function handleMemberAffiliateProgramStatus(req: IncomingMessage, res: ServerResponse, slug: string, programId: string): Promise<void> {
  if (req.method !== "PATCH" || !uuid.test(programId)) { send(res,405,{success:false,error:"Invalid program status request"}); return; }
  const current = await sessionFor(req,res); if (!current) return;
  let input: Record<string,unknown>|null;
  try { input=await body(req); } catch(error) { send(res,error instanceof Error && error.message==="too_large"?413:400,{success:false,error:"Invalid request body"}); return; }
  const next = input?.status;
  if (!input || !["active","paused","closed"].includes(String(next)) || input.termsConfirmed !== true) {
    send(res,400,{success:false,error:"Choose active, paused or closed and confirm the program terms"}); return;
  }
  const db=getDatabasePool();
  const found=await db.query(
    `SELECT p.id,p.merchant_store_id AS "storeId",p.status,
      COUNT(DISTINCT ap.product_id)::int AS "productCount",
      COUNT(DISTINCT sp.id)::int AS "eligibleCount"
     FROM member_store_affiliate_programs p JOIN stores s ON s.id=p.merchant_store_id
     LEFT JOIN member_store_affiliate_products ap ON ap.program_id=p.id
     LEFT JOIN store_products sp ON sp.id=ap.product_id AND sp.store_id=s.id AND sp.status='active' AND sp.stock_quantity>0
     WHERE p.id=$1 AND s.slug=$2 AND s.status='active'
       AND EXISTS (SELECT 1 FROM accounts merchant_account JOIN business_profiles merchant_profile ON merchant_profile.account_id=merchant_account.id AND merchant_profile.verification_status='verified' WHERE merchant_account.id=s.account_id AND merchant_account.status='active')
     GROUP BY p.id,s.id`,
    [programId,slug],
  );
  if(!found.rowCount){send(res,404,{success:false,error:"Affiliate program not found"});return;}
  const access=await storePermission(found.rows[0].storeId,current.user.id,["store.order.manage","account.order.manage"]);
  if(!access){send(res,403,{success:false,error:"Merchant store management permission required"});return;}
  if(next==="active" && (!found.rows[0].productCount || found.rows[0].eligibleCount!==found.rows[0].productCount)){
    send(res,409,{success:false,error:"Add at least one published, in-stock product before activating this program"});return;
  }
  const updated=await db.query(
    `UPDATE member_store_affiliate_programs SET status=$2,updated_at=NOW() WHERE id=$1
     RETURNING id,status,updated_at AS "updatedAt"`,
    [programId,next],
  );
  send(res,200,{success:true,program:updated.rows[0]});
}

/** Merchant-only application queue, scoped to the merchant's own store. */
export async function handleMemberAffiliateApplicationsList(req: IncomingMessage,res: ServerResponse,slug:string):Promise<void>{
  if(req.method!=="GET"){send(res,405,{success:false,error:"Method not allowed"});return;}
  const current=await sessionFor(req,res);if(!current)return;
  const db=getDatabasePool();
  const store=await db.query("SELECT id FROM stores WHERE slug=$1 AND status='active' LIMIT 1",[slug]);
  if(!store.rowCount){send(res,404,{success:false,error:"Store not found"});return;}
  const access=await storePermission(store.rows[0].id,current.user.id,["store.order.read","store.order.manage","account.order.read","account.order.manage"]);
  if(!access){send(res,403,{success:false,error:"Store management permission required"});return;}
  const rows=await db.query(
    `SELECT a.id,a.status,a.message,a.created_at AS "createdAt",p.id AS "programId",
      p.name AS "programName",affiliate.name AS "affiliateStoreName",affiliate.slug AS "affiliateStoreSlug"
     FROM member_store_affiliate_applications a
     JOIN member_store_affiliate_programs p ON p.id=a.program_id
     JOIN stores affiliate ON affiliate.id=a.affiliate_store_id
     WHERE p.merchant_store_id=$1 ORDER BY a.created_at DESC LIMIT 100`,
    [store.rows[0].id],
  );
  send(res,200,{success:true,applications:rows.rows});
}


/** Issue or rotate a referral token for an approved affiliate application. Only its store manager can retrieve the raw token. */
export async function handleMemberAffiliateLinkIssue(req: IncomingMessage, res: ServerResponse, applicationId: string): Promise<void> {
  if (req.method !== "POST" || !uuid.test(applicationId)) { send(res,405,{success:false,error:"Invalid affiliate link request"}); return; }
  const current=await sessionFor(req,res); if(!current)return;
  const db=getDatabasePool();
  const application=await db.query(
    `SELECT a.id,a.status,a.affiliate_store_id AS "affiliateStoreId",
      merchant.slug AS "merchantSlug",merchant.id AS "merchantStoreId",
      p.status AS "programStatus"
     FROM member_store_affiliate_applications a
     JOIN member_store_affiliate_programs p ON p.id=a.program_id
     JOIN stores merchant ON merchant.id=p.merchant_store_id AND merchant.status='active'
     JOIN stores affiliate ON affiliate.id=a.affiliate_store_id AND affiliate.status='active'
     JOIN accounts affiliate_account ON affiliate_account.id=affiliate.account_id AND affiliate_account.status IN ('active','pending_verification')
     WHERE a.id=$1 LIMIT 1`,
    [applicationId],
  );
  if(!application.rowCount || application.rows[0].status!=="approved" || application.rows[0].programStatus!=="active"){
    send(res,409,{success:false,error:"Only approved applications in active programs can receive referral links"});return;
  }
  const access=await storePermission(application.rows[0].affiliateStoreId,current.user.id,["store.order.manage","account.order.manage"]);
  if(!access){send(res,403,{success:false,error:"Affiliate store management permission required"});return;}
  const token=randomBytes(32).toString("base64url");
  const tokenHash=createHash("sha256").update(token).digest("hex");
  const saved=await db.query(
    `INSERT INTO member_store_affiliate_links(application_id,token_hash,active)
     VALUES($1,$2,true)
     ON CONFLICT(application_id) DO UPDATE SET token_hash=EXCLUDED.token_hash,active=true,created_at=NOW(),last_used_at=NULL
     RETURNING id,created_at AS "createdAt"`,
    [applicationId,tokenHash],
  );
  send(res,201,{success:true,link:{id:saved.rows[0].id,token,relativeUrl:`/store/${encodeURIComponent(application.rows[0].merchantSlug)}?ref=${encodeURIComponent(token)}`,createdAt:saved.rows[0].createdAt},notice:"This token is shown once. Generate a new link if you lose it."});
}


/** Affiliate-store owners can inspect recorded pending and reversed amounts; these are not withdrawable balances. */
export async function handleMemberAffiliateEarnings(req: IncomingMessage,res: ServerResponse,slug:string):Promise<void>{
  if(req.method!=="GET"){send(res,405,{success:false,error:"Method not allowed"});return;}
  const current=await sessionFor(req,res);if(!current)return;
  const db=getDatabasePool();
  const store=await db.query("SELECT id FROM stores WHERE slug=$1 AND status='active' LIMIT 1",[slug]);
  if(!store.rowCount){send(res,404,{success:false,error:"Store not found"});return;}
  const access=await storePermission(store.rows[0].id,current.user.id,["store.order.read","store.order.manage","account.order.read","account.order.manage"]);
  if(!access){send(res,403,{success:false,error:"Affiliate store access required"});return;}
  const [totals,entries]=await Promise.all([
    db.query(
      `SELECT l.currency,SUM(l.amount)::text AS "netPending"
       FROM member_store_order_affiliate_attributions a
       JOIN member_store_affiliate_commission_ledger l ON l.attribution_id=a.id
       WHERE a.affiliate_store_id=$1
       GROUP BY l.currency ORDER BY l.currency`,
      [store.rows[0].id],
    ),
    db.query(
      `SELECT a.id,a.order_id AS "orderId",a.product_id AS "productId",a.quantity,
        a.commission_bps AS "commissionBps",a.line_subtotal::text AS "lineSubtotal",
        a.commission_amount::text AS "commissionAmount",a.currency,
        a.created_at AS "createdAt",m.name AS "merchantStoreName",
        COALESCE(SUM(l.amount),0)::text AS "netPending"
       FROM member_store_order_affiliate_attributions a
       JOIN stores m ON m.id=a.merchant_store_id
       LEFT JOIN member_store_affiliate_commission_ledger l ON l.attribution_id=a.id
       WHERE a.affiliate_store_id=$1
       GROUP BY a.id,m.name ORDER BY a.created_at DESC LIMIT 100`,
      [store.rows[0].id],
    ),
  ]);
  send(res,200,{success:true,totals:totals.rows,entries:entries.rows,notice:"Amounts are internal pending commission records only. WASLA does not hold funds or offer withdrawals in this phase."});
}


/** List programs this store applied to; the affiliate owner, not the merchant, receives the referral link. */
export async function handleMemberAffiliateMemberships(req:IncomingMessage,res:ServerResponse,slug:string):Promise<void>{
  if(req.method!=="GET"){send(res,405,{success:false,error:"Method not allowed"});return;}
  const current=await sessionFor(req,res);if(!current)return;
  const db=getDatabasePool();
  const store=await db.query("SELECT id FROM stores WHERE slug=$1 AND status='active' LIMIT 1",[slug]);
  if(!store.rowCount){send(res,404,{success:false,error:"Store not found"});return;}
  const access=await storePermission(store.rows[0].id,current.user.id,["store.order.read","store.order.manage","account.order.read","account.order.manage"]);
  if(!access){send(res,403,{success:false,error:"Affiliate store access required"});return;}
  const rows=await db.query(
    `SELECT a.id,a.status,a.created_at AS "appliedAt",p.id AS "programId",p.name AS "programName",
      p.description,p.commission_bps AS "commissionBps",p.status AS "programStatus",
      merchant.name AS "merchantStoreName",merchant.slug AS "merchantStoreSlug",
      (l.id IS NOT NULL AND l.active=true) AS "hasActiveLink"
     FROM member_store_affiliate_applications a
     JOIN member_store_affiliate_programs p ON p.id=a.program_id
     JOIN stores merchant ON merchant.id=p.merchant_store_id
     LEFT JOIN member_store_affiliate_links l ON l.application_id=a.id
     WHERE a.affiliate_store_id=$1 ORDER BY a.created_at DESC LIMIT 100`,
    [store.rows[0].id],
  );
  send(res,200,{success:true,memberships:rows.rows});
}
