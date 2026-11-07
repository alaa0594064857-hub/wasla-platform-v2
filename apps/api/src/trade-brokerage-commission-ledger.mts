import type { IncomingMessage, ServerResponse } from "node:http";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "./auth.mjs";
import { getDatabasePool } from "./database.js";
import { authorizePlatformPermission } from "./platform-security.mjs";
const send=(r:ServerResponse,s:number,d:Record<string,unknown>)=>{r.writeHead(s,{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"});r.end(JSON.stringify(d));};
const isUuid=(v:unknown):v is string=>typeof v==="string"&&/^[0-9a-f-]{36}$/i.test(v);
const str=(v:unknown,n:number)=>typeof v==="string"?v.trim().slice(0,n):"";
const validHttps=(v:string)=>{try{const u=new URL(v);return u.protocol==="https:"&&!u.username&&!u.password;}catch{return false;}};
async function read(req:IncomingMessage){let raw="";for await(const c of req){raw+=c.toString();if(Buffer.byteLength(raw)>12000)throw new Error("large");}const x:unknown=JSON.parse(raw||"{}");if(!x||typeof x!=="object"||Array.isArray(x))throw new Error("body");return x as Record<string,unknown>;}
export async function ensureBrokerageCommissionTables(){
 const db=getDatabasePool();
 await db.query("CREATE TABLE IF NOT EXISTS trade_brokerage_commission_entries (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), agreement_id uuid NOT NULL REFERENCES trade_brokerage_agreements(id) ON DELETE RESTRICT, trade_reference varchar(120) NOT NULL, trade_value numeric(20,6) NOT NULL CHECK(trade_value>0), trade_currency char(3) NOT NULL CHECK(trade_currency ~ '^[A-Z]{3}$'), commission_rate numeric(7,4) NOT NULL CHECK(commission_rate>0 AND commission_rate<=100), commission_amount numeric(20,6) NOT NULL CHECK(commission_amount>0), commission_currency char(3) NOT NULL CHECK(commission_currency ~ '^[A-Z]{3}$'), commission_payer varchar(16) NOT NULL CHECK(commission_payer IN ('buyer','supplier','both')), status varchar(16) NOT NULL DEFAULT 'recorded' CHECK(status IN ('recorded','invoiced','paid','waived')), evidence_url text, note text, created_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT, created_at timestamptz NOT NULL DEFAULT NOW(), updated_at timestamptz NOT NULL DEFAULT NOW(), UNIQUE(agreement_id,trade_reference))");
 await db.query("CREATE INDEX IF NOT EXISTS trade_brokerage_commission_entries_created_idx ON trade_brokerage_commission_entries(created_at DESC)");
 await db.query("CREATE TABLE IF NOT EXISTS trade_brokerage_commission_events (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), entry_id uuid NOT NULL REFERENCES trade_brokerage_commission_entries(id) ON DELETE CASCADE, actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL, event_type varchar(20) NOT NULL CHECK(event_type IN ('recorded','status_changed')), from_status varchar(16), to_status varchar(16), note text, created_at timestamptz NOT NULL DEFAULT NOW())");
}
export async function handleBrokerageCommissionLedger(req:IncomingMessage,res:ServerResponse,entryId?:string){
 if(!["GET","POST","PATCH"].includes(req.method??"")){send(res,405,{success:false,error:"Method not allowed"});return;}
 try{
  const session=await auth.api.getSession({headers:fromNodeHeaders(req.headers)});
  if(!session){send(res,401,{success:false,error:"Authentication required"});return;}
  if(!await authorizePlatformPermission(req,res,"platform.manage"))return;
  const db=getDatabasePool();
  if(req.method==="GET"){
   const [entries,agreements]=await Promise.all([
    db.query("SELECT e.* FROM trade_brokerage_commission_entries e ORDER BY e.created_at DESC LIMIT 200"),
    db.query("SELECT id,buyer_account_id,supplier_account_id,commission_rate,commission_currency,commission_payer FROM trade_brokerage_agreements WHERE status='active' ORDER BY created_at DESC LIMIT 200")
   ]);
   send(res,200,{success:true,entries:entries.rows,agreements:agreements.rows});return;
  }
  let data:Record<string,unknown>;try{data=await read(req);}catch{send(res,400,{success:false,error:"Invalid request body"});return;}
  if(req.method==="POST"){
   const agreementId=data.agreementId,reference=str(data.tradeReference,120),value=String(data.tradeValue??"");
   if(!isUuid(agreementId)||reference.length<3||!/^[0-9]+(?:\.[0-9]{1,6})?$/.test(value)||!Number.isFinite(Number(value))||Number(value)<=0){send(res,400,{success:false,error:"Enter a valid active agreement, trade reference and positive trade value."});return;}
   const client=await db.connect();
   try{
    await client.query("BEGIN");
    const a=await client.query("SELECT * FROM trade_brokerage_agreements WHERE id=$1 AND status='active' FOR SHARE",[agreementId]);
    if(!a.rowCount){await client.query("ROLLBACK");send(res,409,{success:false,error:"Only a mutually accepted active agreement can be recorded."});return;}
    const currency=str(data.tradeCurrency,3).toUpperCase();
    if(currency!==String(a.rows[0].commission_currency).trim()){await client.query("ROLLBACK");send(res,400,{success:false,error:"Trade currency must match the agreed commission currency. FX conversion is not supported without a verified rate."});return;}
    const note=str(data.note,2000)||null;
    const saved=await client.query("INSERT INTO trade_brokerage_commission_entries (agreement_id,trade_reference,trade_value,trade_currency,commission_rate,commission_amount,commission_currency,commission_payer,note,created_by_user_id) VALUES($1,$2,$3,$4,$5,ROUND(($3::numeric*$5::numeric)/100,6),$4,$6,$7,$8) RETURNING *",[agreementId,reference,value,currency,a.rows[0].commission_rate,a.rows[0].commission_payer,note,session.user.id]);
    await client.query("INSERT INTO trade_brokerage_commission_events(entry_id,actor_user_id,event_type,to_status,note) VALUES($1,$2,'recorded','recorded',$3)",[saved.rows[0].id,session.user.id,note]);
    await client.query("COMMIT");send(res,201,{success:true,entry:saved.rows[0]});return;
   }catch(e){await client.query("ROLLBACK");if((e as {code?:string})?.code==="23505"){send(res,409,{success:false,error:"This trade reference is already recorded for the agreement."});return;}throw e;}finally{client.release();}
  }
  if(!entryId||!isUuid(entryId)){send(res,400,{success:false,error:"Valid ledger entry ID required"});return;}
  const status=str(data.status,16),evidence=str(data.evidenceUrl,2000),note=str(data.note,2000)||null;
  if(!["recorded","invoiced","paid","waived"].includes(status)||(evidence&&!validHttps(evidence))||(status==="paid"&&!evidence)){send(res,400,{success:false,error:"Choose a valid status. Paid requires an HTTPS evidence URL."});return;}
  const client=await db.connect();
  try{
   await client.query("BEGIN");
   const old=await client.query("SELECT status FROM trade_brokerage_commission_entries WHERE id=$1 FOR UPDATE",[entryId]);
   if(!old.rowCount){await client.query("ROLLBACK");send(res,404,{success:false,error:"Ledger entry not found"});return;}
   const saved=await client.query("UPDATE trade_brokerage_commission_entries SET status=$2,evidence_url=$3,note=COALESCE($4,note),updated_at=NOW() WHERE id=$1 RETURNING *",[entryId,status,evidence||null,note]);
   await client.query("INSERT INTO trade_brokerage_commission_events(entry_id,actor_user_id,event_type,from_status,to_status,note) VALUES($1,$2,'status_changed',$3,$4,$5)",[entryId,session.user.id,old.rows[0].status,status,note]);
   await client.query("COMMIT");send(res,200,{success:true,entry:saved.rows[0]});return;
  }catch(e){await client.query("ROLLBACK");throw e;}finally{client.release();}
 }catch(e){console.error("WASLA commission ledger error:",e);if(!res.headersSent)send(res,500,{success:false,error:"Commission ledger request failed"});else res.destroy(e instanceof Error?e:undefined);}
}
