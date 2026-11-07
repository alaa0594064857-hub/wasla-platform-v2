import type { IncomingMessage, ServerResponse } from "node:http";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "./auth.mjs";
import { getDatabasePool } from "./database.js";
import { authorizePlatformPermission } from "./platform-security.mjs";
const send=(r:ServerResponse,s:number,d:Record<string,unknown>)=>{r.writeHead(s,{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"});r.end(JSON.stringify(d));};
const uuid=(v:unknown):v is string=>typeof v==="string"&&/^[0-9a-f-]{36}$/i.test(v);
const str=(v:unknown,n:number)=>typeof v==="string"?v.trim().slice(0,n):"";
const https=(v:string)=>{try{const u=new URL(v);return u.protocol==="https:"&&!u.username&&!u.password;}catch{return false;}};
async function body(req:IncomingMessage){let raw="";for await(const c of req){raw+=c.toString();if(Buffer.byteLength(raw)>10000)throw Error("large");}const x:unknown=JSON.parse(raw||"{}");if(!x||typeof x!=="object"||Array.isArray(x))throw Error("body");return x as Record<string,unknown>;}
export async function ensureBrokerageInvoiceTables(){
 const db=getDatabasePool();
 await db.query("CREATE TABLE IF NOT EXISTS trade_brokerage_commission_invoices (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), invoice_sequence bigint GENERATED ALWAYS AS IDENTITY UNIQUE, invoice_number varchar(40) UNIQUE, commission_entry_id uuid NOT NULL REFERENCES trade_brokerage_commission_entries(id) ON DELETE RESTRICT, recipient_party varchar(16) NOT NULL CHECK(recipient_party IN ('buyer','supplier','both')), recipient_name varchar(180) NOT NULL, recipient_email varchar(254), amount numeric(20,6) NOT NULL CHECK(amount>0), currency char(3) NOT NULL CHECK(currency ~ '^[A-Z]{3}$'), status varchar(16) NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','issued','paid','cancelled')), issue_date date, due_date date, evidence_url text, note text, created_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT, created_at timestamptz NOT NULL DEFAULT NOW(), updated_at timestamptz NOT NULL DEFAULT NOW())");
 await db.query("CREATE INDEX IF NOT EXISTS trade_brokerage_commission_invoices_created_idx ON trade_brokerage_commission_invoices(created_at DESC)");
 await db.query("CREATE TABLE IF NOT EXISTS trade_brokerage_commission_invoice_events (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), invoice_id uuid NOT NULL REFERENCES trade_brokerage_commission_invoices(id) ON DELETE CASCADE, actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL, from_status varchar(16), to_status varchar(16) NOT NULL, note text, created_at timestamptz NOT NULL DEFAULT NOW())");
}
export async function handleBrokerageCommissionInvoices(req:IncomingMessage,res:ServerResponse,invoiceId?:string){
 if(!["GET","POST","PATCH"].includes(req.method??"")){send(res,405,{success:false,error:"Method not allowed"});return;}
 try{
  const session=await auth.api.getSession({headers:fromNodeHeaders(req.headers)});
  if(!session){send(res,401,{success:false,error:"Authentication required"});return;}
  if(!await authorizePlatformPermission(req,res,"platform.manage"))return;
  const db=getDatabasePool();
  if(req.method==="GET"){
   const [invoices,entries]=await Promise.all([
    db.query("SELECT i.*,e.trade_reference,e.agreement_id FROM trade_brokerage_commission_invoices i JOIN trade_brokerage_commission_entries e ON e.id=i.commission_entry_id ORDER BY i.created_at DESC LIMIT 250"),
    db.query("SELECT id,trade_reference,commission_amount,commission_currency,commission_payer,status FROM trade_brokerage_commission_entries WHERE status IN ('recorded','invoiced') AND NOT EXISTS(SELECT 1 FROM trade_brokerage_commission_invoices i WHERE i.commission_entry_id=trade_brokerage_commission_entries.id AND i.status IN ('draft','issued')) ORDER BY created_at DESC LIMIT 250")
   ]);
   send(res,200,{success:true,invoices:invoices.rows,entries:entries.rows});return;
  }
  let data:Record<string,unknown>;try{data=await body(req);}catch{send(res,400,{success:false,error:"Invalid request body"});return;}
  if(req.method==="POST"){
   const entryId=data.commissionEntryId,name=str(data.recipientName,180),email=str(data.recipientEmail,254),party=str(data.recipientParty,16),due=str(data.dueDate,10),note=str(data.note,2000)||null;
   if(!uuid(entryId)||name.length<2||!["buyer","supplier","both"].includes(party)||(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))||(due&&!/^\d{4}-\d{2}-\d{2}$/.test(due))){send(res,400,{success:false,error:"Enter a valid commission entry, recipient, party and due date."});return;}
   const client=await db.connect();
   try{
    await client.query("BEGIN");
    const entry=await client.query("SELECT * FROM trade_brokerage_commission_entries WHERE id=$1 AND status IN ('recorded','invoiced') FOR UPDATE",[entryId]);
    if(!entry.rowCount){await client.query("ROLLBACK");send(res,409,{success:false,error:"Commission entry is unavailable for invoicing."});return;}
    const e=entry.rows[0];
    if(party!==e.commission_payer){await client.query("ROLLBACK");send(res,400,{success:false,error:"Invoice recipient party must match the agreed commission payer. For both parties, record recipient details and allocation in the terms; this invoice represents the total commission."});return;}
    const prior=await client.query("SELECT id FROM trade_brokerage_commission_invoices WHERE commission_entry_id=$1 AND status IN ('draft','issued')",[entryId]);
    if(prior.rowCount){await client.query("ROLLBACK");send(res,409,{success:false,error:"An open invoice already exists for this commission entry."});return;}
    const created=await client.query("INSERT INTO trade_brokerage_commission_invoices(commission_entry_id,recipient_party,recipient_name,recipient_email,amount,currency,due_date,note,created_by_user_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *",[entryId,party,name,email||null,e.commission_amount,e.commission_currency,due||null,note,session.user.id]);
    const number="WASLA-COM-"+new Date().getUTCFullYear()+"-"+String(created.rows[0].invoice_sequence).padStart(6,"0");
    const saved=await client.query("UPDATE trade_brokerage_commission_invoices SET invoice_number=$2 WHERE id=$1 RETURNING *",[created.rows[0].id,number]);
    await client.query("INSERT INTO trade_brokerage_commission_invoice_events(invoice_id,actor_user_id,to_status,note) VALUES($1,$2,'draft',$3)",[saved.rows[0].id,session.user.id,note]);
    await client.query("COMMIT");send(res,201,{success:true,invoice:saved.rows[0]});return;
   }catch(e){await client.query("ROLLBACK");throw e;}finally{client.release();}
  }
  if(!invoiceId||!uuid(invoiceId)){send(res,400,{success:false,error:"Valid invoice ID required"});return;}
  const status=str(data.status,16),proof=str(data.evidenceUrl,2000),note=str(data.note,2000)||null;
  if(!["issued","paid","cancelled"].includes(status)||(proof&&!https(proof))||(status==="paid"&&!proof)){send(res,400,{success:false,error:"Choose issued, paid or cancelled. Paid requires HTTPS evidence."});return;}
  const client=await db.connect();
  try{
   await client.query("BEGIN");
   const old=await client.query("SELECT * FROM trade_brokerage_commission_invoices WHERE id=$1 FOR UPDATE",[invoiceId]);
   if(!old.rowCount){await client.query("ROLLBACK");send(res,404,{success:false,error:"Invoice not found"});return;}
   const previous=old.rows[0].status;
   if(previous==="paid"||previous==="cancelled"){await client.query("ROLLBACK");send(res,409,{success:false,error:"Paid or cancelled invoices cannot be changed."});return;}
   if(previous==="draft"&&status==="paid"){await client.query("ROLLBACK");send(res,409,{success:false,error:"Issue the invoice before recording payment."});return;}
   const saved=await client.query("UPDATE trade_brokerage_commission_invoices SET status=$2,issue_date=CASE WHEN $2='issued' THEN COALESCE(issue_date,CURRENT_DATE) ELSE issue_date END,evidence_url=$3,note=COALESCE($4,note),updated_at=NOW() WHERE id=$1 RETURNING *",[invoiceId,status,proof||null,note]);
   if(status==="issued")await client.query("UPDATE trade_brokerage_commission_entries SET status='invoiced',updated_at=NOW() WHERE id=$1",[old.rows[0].commission_entry_id]);
   if(status==="paid")await client.query("UPDATE trade_brokerage_commission_entries SET status='paid',evidence_url=$2,updated_at=NOW() WHERE id=$1",[old.rows[0].commission_entry_id,proof]);
   if(status==="cancelled")await client.query("UPDATE trade_brokerage_commission_entries SET status='recorded',updated_at=NOW() WHERE id=$1 AND status='invoiced'",[old.rows[0].commission_entry_id]);
   await client.query("INSERT INTO trade_brokerage_commission_invoice_events(invoice_id,actor_user_id,from_status,to_status,note) VALUES($1,$2,$3,$4,$5)",[invoiceId,session.user.id,previous,status,note]);
   await client.query("COMMIT");send(res,200,{success:true,invoice:saved.rows[0]});return;
  }catch(e){await client.query("ROLLBACK");throw e;}finally{client.release();}
 }catch(e){console.error("WASLA brokerage invoice error:",e);if(!res.headersSent)send(res,500,{success:false,error:"Commission invoice request failed"});else res.destroy(e instanceof Error?e:undefined);}
}
