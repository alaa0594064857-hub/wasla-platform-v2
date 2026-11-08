import type { IncomingMessage, ServerResponse } from "node:http";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "./auth.mjs";
import { getDatabasePool } from "./database.js";
import { authorizePlatformPermission } from "./platform-security.mjs";
import { createNotification } from "./notifications.mjs";

type AgreementAction = "accept" | "reject";
function send(response: ServerResponse, status: number, data: Record<string, unknown>) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  response.end(JSON.stringify(data));
}
async function body(request: IncomingMessage) {
  let raw = "";
  for await (const chunk of request) {
    raw += chunk.toString();
    if (Buffer.byteLength(raw) > 20000) throw new Error("BODY_TOO_LARGE");
  }
  const parsed: unknown = JSON.parse(raw || "{}");
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("INVALID_BODY");
  return parsed as Record<string, unknown>;
}
const uuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const str = (v: unknown, max: number) => typeof v === "string" ? v.trim().slice(0, max) : "";

export async function ensureBrokerageAgreementTables() {
  await getDatabasePool().query(`
    CREATE TABLE IF NOT EXISTS trade_brokerage_agreements (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      buyer_opportunity_id uuid NOT NULL REFERENCES trade_opportunities(id) ON DELETE RESTRICT,
      supplier_opportunity_id uuid NOT NULL REFERENCES trade_opportunities(id) ON DELETE RESTRICT,
      buyer_account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
      supplier_account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
      commission_payer varchar(16) NOT NULL CHECK (commission_payer IN ('buyer','supplier','both')),
      commission_rate numeric(7,4) NOT NULL CHECK (commission_rate > 0 AND commission_rate <= 100),
      commission_currency char(3) NOT NULL CHECK (commission_currency ~ '^[A-Z]{3}$'),
      commission_basis varchar(32) NOT NULL DEFAULT 'successful_trade_value' CHECK (commission_basis IN ('successful_trade_value')),
      terms text NOT NULL,
      status varchar(24) NOT NULL DEFAULT 'pending_acceptance' CHECK (status IN ('pending_acceptance','active','rejected','expired','closed')),
      expires_at timestamptz NOT NULL,
      buyer_accepted_by uuid REFERENCES users(id) ON DELETE SET NULL,
      buyer_accepted_at timestamptz,
      supplier_accepted_by uuid REFERENCES users(id) ON DELETE SET NULL,
      supplier_accepted_at timestamptz,
      created_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      created_at timestamptz NOT NULL DEFAULT NOW(),
      updated_at timestamptz NOT NULL DEFAULT NOW(),
      CHECK (buyer_account_id <> supplier_account_id)
    )
  `);
  await getDatabasePool().query(`CREATE INDEX IF NOT EXISTS trade_brokerage_agreements_buyer_idx ON trade_brokerage_agreements (buyer_account_id, created_at DESC)`);
  await getDatabasePool().query(`CREATE INDEX IF NOT EXISTS trade_brokerage_agreements_supplier_idx ON trade_brokerage_agreements (supplier_account_id, created_at DESC)`);
  await getDatabasePool().query(`
    CREATE TABLE IF NOT EXISTS trade_brokerage_agreement_events (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      agreement_id uuid NOT NULL REFERENCES trade_brokerage_agreements(id) ON DELETE CASCADE,
      actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
      actor_account_id uuid REFERENCES accounts(id) ON DELETE SET NULL,
      event_type varchar(24) NOT NULL CHECK (event_type IN ('created','buyer_accepted','supplier_accepted','rejected','expired','closed')),
      note text,
      created_at timestamptz NOT NULL DEFAULT NOW()
    )
  `);
}

async function hasTradePermission(accountId: string, userId: string) {
  const r = await getDatabasePool().query(
    `SELECT 1 FROM account_members am
     INNER JOIN accounts a ON a.id=am.account_id AND a.status='active'
     INNER JOIN roles ro ON ro.id=am.role_id AND ro.scope_type=am.role_scope
     INNER JOIN role_permissions rp ON rp.role_id=ro.id AND rp.scope_type=ro.scope_type
     INNER JOIN permissions p ON p.id=rp.permission_id AND p.scope_type=rp.scope_type
     WHERE am.account_id=$1 AND am.user_id=$2 AND am.status='active'
       AND p.permission_key='account.trade.create' LIMIT 1`, [accountId,userId]);
  return Boolean(r.rowCount);
}

/** Electronic acknowledgement workflow for brokerage terms; it does not collect money or replace legal advice. */
export async function handleBrokerageAgreements(request: IncomingMessage, response: ServerResponse, agreementId?: string) {
  if (!["GET","POST","PATCH"].includes(request.method ?? "")) { send(response,405,{success:false,error:"Method not allowed"}); return; }
  try {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
    if (!session) { send(response,401,{success:false,error:"Authentication required"}); return; }
    const userId = session.user.id;
    const db = getDatabasePool();

    if (request.method === "GET") {
      const query = agreementId
        ? await db.query(`SELECT g.* FROM trade_brokerage_agreements g
          WHERE g.id=$1 AND (
            EXISTS (SELECT 1 FROM account_members am JOIN accounts a ON a.id=am.account_id AND a.status='active' WHERE am.account_id=g.buyer_account_id AND am.user_id=$2 AND am.status='active'
              AND EXISTS (SELECT 1 FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id AND p.scope_type=rp.scope_type
                WHERE rp.role_id=am.role_id AND rp.scope_type=am.role_scope AND p.permission_key='account.trade.read'))
            OR EXISTS (SELECT 1 FROM account_members am JOIN accounts a ON a.id=am.account_id AND a.status='active' WHERE am.account_id=g.supplier_account_id AND am.user_id=$2 AND am.status='active'
              AND EXISTS (SELECT 1 FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id AND p.scope_type=rp.scope_type
                WHERE rp.role_id=am.role_id AND rp.scope_type=am.role_scope AND p.permission_key='account.trade.read'))
          ) LIMIT 1`,[agreementId,userId])
        : await db.query(`SELECT g.* FROM trade_brokerage_agreements g
          WHERE EXISTS (SELECT 1 FROM account_members am JOIN accounts a ON a.id=am.account_id AND a.status='active' WHERE am.account_id=g.buyer_account_id AND am.user_id=$1 AND am.status='active'
            AND EXISTS (SELECT 1 FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id AND p.scope_type=rp.scope_type
              WHERE rp.role_id=am.role_id AND rp.scope_type=am.role_scope AND p.permission_key='account.trade.read'))
             OR EXISTS (SELECT 1 FROM account_members am JOIN accounts a ON a.id=am.account_id AND a.status='active' WHERE am.account_id=g.supplier_account_id AND am.user_id=$1 AND am.status='active'
            AND EXISTS (SELECT 1 FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id AND p.scope_type=rp.scope_type
              WHERE rp.role_id=am.role_id AND rp.scope_type=am.role_scope AND p.permission_key='account.trade.read'))
          ORDER BY g.created_at DESC LIMIT 100`,[userId]);
      if (agreementId && !query.rowCount) { send(response,404,{success:false,error:"Agreement not found"}); return; }
      send(response,200,{success:true,agreements:query.rows,agreement:agreementId ? query.rows[0] : undefined}); return;
    }

    if (request.method === "POST") {
      const owner = await authorizePlatformPermission(request,response,"platform.manage");
      if (!owner) return;
      let data: Record<string,unknown>;
      try { data=await body(request); } catch { send(response,400,{success:false,error:"Invalid request body"}); return; }
      const buyerId=data.buyerOpportunityId, supplierId=data.supplierOpportunityId;
      const payer=str(data.commissionPayer,16);
      const rate=Number(data.commissionRate);
      const currency=str(data.commissionCurrency,3).toUpperCase();
      const terms=str(data.terms,8000);
      const expiry=typeof data.expiresAt==="string" ? Date.parse(data.expiresAt) : NaN;
      if (!uuid(buyerId)||!uuid(supplierId)||buyerId===supplierId||!["buyer","supplier","both"].includes(payer)||
          !Number.isFinite(rate)||rate<=0||rate>100||!/^[A-Z]{3}$/.test(currency)||
          terms.length<30||!Number.isFinite(expiry)||expiry<=Date.now()||expiry>Date.now()+90*86400000) {
        send(response,400,{success:false,error:"Provide valid approved opportunities, commission terms and an expiry within 90 days."}); return;
      }
      const client=await db.connect();
      try {
        await client.query("BEGIN");
        const pair=await client.query(`SELECT b.account_id AS buyer_account_id,s.account_id AS supplier_account_id,
            b.created_by_user_id AS buyer_submitter_user_id,s.created_by_user_id AS supplier_submitter_user_id
          FROM trade_opportunities b CROSS JOIN trade_opportunities s
          WHERE b.id=$1 AND s.id=$2 AND b.opportunity_type='buyer_request' AND s.opportunity_type='supplier_offer'
            AND b.review_status='approved' AND s.review_status='approved'
            AND (b.expires_at IS NULL OR b.expires_at>NOW()) AND (s.expires_at IS NULL OR s.expires_at>NOW())
            AND b.account_id<>s.account_id FOR SHARE OF b,s`,[buyerId,supplierId]);
        if (!pair.rowCount) { await client.query("ROLLBACK"); send(response,409,{success:false,error:"Both opportunities must be approved, current and from different accounts."}); return; }
        const buyerAccount=pair.rows[0].buyer_account_id as string;
        const supplierAccount=pair.rows[0].supplier_account_id as string;
        const inserted=await client.query(`INSERT INTO trade_brokerage_agreements
          (buyer_opportunity_id,supplier_opportunity_id,buyer_account_id,supplier_account_id,commission_payer,commission_rate,commission_currency,terms,expires_at,created_by_user_id)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
          [buyerId,supplierId,buyerAccount,supplierAccount,payer,rate,currency,terms,new Date(expiry).toISOString(),userId]);
        await client.query(`INSERT INTO trade_brokerage_agreement_events (agreement_id,actor_user_id,event_type,note)
          VALUES ($1,$2,'created','Drafted by WASLA for separate acceptance by both parties')`,[inserted.rows[0].id,userId]);
        await createNotification(client, {
          userId: pair.rows[0].buyer_submitter_user_id,
          type: "trade_deal",
          titleAr: "اتفاقية وساطة جديدة بانتظار موافقتك",
          titleEn: "A new brokerage agreement needs your acceptance",
          bodyAr: "جهّزت WASLA شروط الوساطة لهذه الفرصة. راجع التفاصيل واقبل أو ارفض من مساحة التجارة.",
          bodyEn: "WASLA prepared brokerage terms for this opportunity. Review and accept or reject them in Trade.",
          actionUrl: "/trade/agreements",
          resourceId: inserted.rows[0].id,
          metadata: { agreementId: inserted.rows[0].id, status: "pending_acceptance" },
        });
        if (pair.rows[0].supplier_submitter_user_id !== pair.rows[0].buyer_submitter_user_id) {
          await createNotification(client, {
            userId: pair.rows[0].supplier_submitter_user_id,
            type: "trade_deal",
            titleAr: "اتفاقية وساطة جديدة بانتظار موافقتك",
            titleEn: "A new brokerage agreement needs your acceptance",
            bodyAr: "جهّزت WASLA شروط الوساطة لهذه الفرصة. راجع التفاصيل واقبل أو ارفض من مساحة التجارة.",
            bodyEn: "WASLA prepared brokerage terms for this opportunity. Review and accept or reject them in Trade.",
            actionUrl: "/trade/agreements",
            resourceId: inserted.rows[0].id,
            metadata: { agreementId: inserted.rows[0].id, status: "pending_acceptance" },
          });
        }
        await client.query("COMMIT");
        send(response,201,{success:true,agreement:inserted.rows[0],message:"Terms prepared. No brokerage engagement is active until both parties accept."}); return;
      } catch(error) { await client.query("ROLLBACK"); throw error; }
      finally { client.release(); }
    }

    if (!agreementId || !uuid(agreementId)) { send(response,400,{success:false,error:"A valid agreement ID is required"}); return; }
    let data: Record<string,unknown>;
    try { data=await body(request); } catch { send(response,400,{success:false,error:"Invalid request body"}); return; }
    const action=str(data.action,16) as AgreementAction;
    if (!["accept","reject"].includes(action)) { send(response,400,{success:false,error:"Action must be accept or reject"}); return; }
    const client=await db.connect();
    try {
      await client.query("BEGIN");
      const locked=await client.query(`SELECT g.*,b.created_by_user_id AS buyer_submitter_user_id,
        s.created_by_user_id AS supplier_submitter_user_id
        FROM trade_brokerage_agreements g
        JOIN trade_opportunities b ON b.id=g.buyer_opportunity_id
        JOIN trade_opportunities s ON s.id=g.supplier_opportunity_id
        WHERE g.id=$1 FOR UPDATE OF g`,[agreementId]);
      if (!locked.rowCount) { await client.query("ROLLBACK"); send(response,404,{success:false,error:"Agreement not found"}); return; }
      const agreement=locked.rows[0];
      const buyerParty=await hasTradePermission(agreement.buyer_account_id,userId);
      const supplierParty=await hasTradePermission(agreement.supplier_account_id,userId);
      const requestedAccount = uuid(data.accountId) ? data.accountId : null;
      const actingAccount = requestedAccount ?? (buyerParty && !supplierParty ? agreement.buyer_account_id : supplierParty && !buyerParty ? agreement.supplier_account_id : null);
      if (!actingAccount || (actingAccount!==agreement.buyer_account_id && actingAccount!==agreement.supplier_account_id) ||
          !(actingAccount===agreement.buyer_account_id ? buyerParty : supplierParty)) {
        await client.query("ROLLBACK"); send(response,403,{success:false,error:"Select a business account you are authorized to represent in this agreement."}); return;
      }
      if (agreement.status!=="pending_acceptance") {
        await client.query("ROLLBACK"); send(response,409,{success:false,error:"This agreement is no longer open for acceptance."}); return;
      }
      if (new Date(agreement.expires_at).getTime()<=Date.now()) {
        await client.query(`UPDATE trade_brokerage_agreements SET status='expired',updated_at=NOW() WHERE id=$1`,[agreementId]);
        await client.query(`INSERT INTO trade_brokerage_agreement_events (agreement_id,event_type,note) VALUES ($1,'expired','Agreement expired before acceptance')`,[agreementId]);
        await client.query("COMMIT"); send(response,409,{success:false,error:"This agreement has expired."}); return;
      }
      if (action==="reject") {
        await client.query(`UPDATE trade_brokerage_agreements SET status='rejected',updated_at=NOW() WHERE id=$1`,[agreementId]);
        await client.query(`INSERT INTO trade_brokerage_agreement_events (agreement_id,actor_user_id,actor_account_id,event_type,note)
          VALUES ($1,$2,$3,'rejected',$4)`,[agreementId,userId,actingAccount,str(data.note,1000)||null]);
        const otherPartyUserId = actingAccount === agreement.buyer_account_id
          ? agreement.supplier_submitter_user_id : agreement.buyer_submitter_user_id;
        await createNotification(client, {
          userId: otherPartyUserId,
          type: "trade_deal",
          titleAr: "تم رفض اتفاقية الوساطة",
          titleEn: "The brokerage agreement was rejected",
          bodyAr: str(data.note,1000) || "رفض الطرف الآخر شروط اتفاقية الوساطة.",
          bodyEn: str(data.note,1000) || "The other party rejected the brokerage terms.",
          actionUrl: "/trade/agreements",
          resourceId: agreementId,
          metadata: { agreementId, status: "rejected" },
        });
        await client.query("COMMIT"); send(response,200,{success:true,status:"rejected"}); return;
      }
      const buyerPartyActing=actingAccount===agreement.buyer_account_id;
      const column=buyerPartyActing?"buyer_accepted_at":"supplier_accepted_at";
      const actorColumn=buyerPartyActing?"buyer_accepted_by":"supplier_accepted_by";
      if (agreement[column]) { await client.query("ROLLBACK"); send(response,409,{success:false,error:"Your party has already accepted these terms."}); return; }
      const updated=await client.query(`UPDATE trade_brokerage_agreements
        SET ${column}=NOW(),${actorColumn}=$2,
            status=CASE WHEN ${buyerPartyActing?"supplier_accepted_at":"buyer_accepted_at"} IS NOT NULL THEN 'active' ELSE 'pending_acceptance' END,
            updated_at=NOW() WHERE id=$1 RETURNING *`,[agreementId,userId]);
      await client.query(`INSERT INTO trade_brokerage_agreement_events (agreement_id,actor_user_id,actor_account_id,event_type)
        VALUES ($1,$2,$3,$4)`,[agreementId,userId,actingAccount,buyerPartyActing?"buyer_accepted":"supplier_accepted"]);
      if (updated.rows[0].status === "active") {
        const recipients = new Set([agreement.buyer_submitter_user_id, agreement.supplier_submitter_user_id]);
        for (const recipient of recipients) {
          await createNotification(client, {
            userId: recipient,
            type: "trade_deal",
            titleAr: "أصبحت اتفاقية الوساطة نشطة",
            titleEn: "The brokerage agreement is now active",
            bodyAr: "وافق الطرفان على شروط الوساطة. لم يتم تحصيل أي دفعة عبر WASLA.",
            bodyEn: "Both parties accepted the brokerage terms. No payment was collected by WASLA.",
            actionUrl: "/trade/agreements",
            resourceId: agreementId,
            metadata: { agreementId, status: "active" },
          });
        }
      } else {
        const otherPartyUserId = buyerPartyActing
          ? agreement.supplier_submitter_user_id : agreement.buyer_submitter_user_id;
        await createNotification(client, {
          userId: otherPartyUserId,
          type: "trade_deal",
          titleAr: "تم تسجيل موافقة على اتفاقية الوساطة",
          titleEn: "A party accepted the brokerage agreement",
          bodyAr: "وافق الطرف الأول على الشروط. ما زالت موافقة الطرف الآخر مطلوبة لتفعيل الاتفاقية.",
          bodyEn: "One party accepted the terms. The other party must still accept before the agreement becomes active.",
          actionUrl: "/trade/agreements",
          resourceId: agreementId,
          metadata: { agreementId, status: "pending_acceptance" },
        });
      }
      await client.query("COMMIT");
      send(response,200,{success:true,agreement:updated.rows[0],message:updated.rows[0].status==="active"?"Both parties accepted. The brokerage engagement is recorded as active; no payment has been collected.":"Acceptance recorded for your party. The other party must still accept."}); return;
    } catch(error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  } catch(error) {
    console.error("WASLA brokerage agreement error:",error);
    if(!response.headersSent) send(response,500,{success:false,error:"Brokerage agreement request failed"});
    else response.destroy(error instanceof Error?error:undefined);
  }
}
