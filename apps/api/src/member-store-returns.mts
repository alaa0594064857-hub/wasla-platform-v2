import type { IncomingMessage, ServerResponse } from "node:http";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "./auth.mjs";
import { authorizePlatformPermission } from "./platform-security.mjs";
import { getDatabasePool } from "./database.js";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function send(res: ServerResponse, status: number, data: Record<string, unknown>) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  res.end(JSON.stringify(data));
}
async function body(req: IncomingMessage): Promise<Record<string, unknown> | null> {
  let raw = "", size = 0;
  for await (const chunk of req) { size += Buffer.byteLength(chunk); if (size > 6000) throw new Error("too_large"); raw += chunk.toString(); }
  const value: unknown = JSON.parse(raw);
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
const merchantSql = `EXISTS (
 SELECT 1 FROM stores s WHERE s.id=$1 AND (
  EXISTS (SELECT 1 FROM account_members am JOIN roles r ON r.id=am.role_id AND r.scope_type=am.role_scope
   JOIN role_permissions rp ON rp.role_id=r.id AND rp.scope_type=r.scope_type
   JOIN permissions p ON p.id=rp.permission_id AND p.scope_type=rp.scope_type
   WHERE am.account_id=s.account_id AND am.user_id=$2 AND am.status='active' AND p.permission_key=ANY($3::text[]))
  OR EXISTS (SELECT 1 FROM store_members sm JOIN roles r ON r.id=sm.role_id AND r.scope_type=sm.role_scope
   JOIN role_permissions rp ON rp.role_id=r.id AND rp.scope_type=r.scope_type
   JOIN permissions p ON p.id=rp.permission_id AND p.scope_type=rp.scope_type
   WHERE sm.store_id=s.id AND sm.user_id=$2 AND sm.status='active' AND p.permission_key=ANY($3::text[]))
 )`;
/** Return/exchange requests are operational records only: no refund, payment or carrier action is performed. */
export async function handleMemberStoreReturn(req: IncomingMessage, res: ServerResponse, slug: string, orderId: string, action: "submit" | "respond" | "received" | "close") {
 if (!uuid.test(orderId)) { send(res,400,{success:false,error:"Invalid order id"}); return; }
 const session=await auth.api.getSession({headers:fromNodeHeaders(req.headers)});
 if (!session) { send(res,401,{success:false,error:"Authentication required"}); return; }
 const method=action==="close"||action==="received"?"PATCH":"POST";
 if(req.method!==method){send(res,405,{success:false,error:"Method not allowed"});return;}
 let input:Record<string,unknown>|null;
 try{input=await body(req);}catch(e){send(res,e instanceof Error&&e.message==="too_large"?413:400,{success:false,error:"Invalid request body"});return;}
 if(!input){send(res,400,{success:false,error:"Invalid request body"});return;}
 if(action==="submit"){
  const reason=typeof input.reason==="string"?input.reason.trim():"";
  const details=typeof input.details==="string"?input.details.trim():"";
  if(!["return","replacement"].includes(String(input.resolution))||!["damaged_or_defective","not_as_described","wrong_item","missing_items","other"].includes(reason)||details.length<10||details.length>3000){
   send(res,400,{success:false,error:"Choose a valid resolution and reason, and provide 10–3000 characters"});return;
  }
 }
 const db=getDatabasePool(), client=await db.connect();
 try{
  await client.query("BEGIN");
  const found=await client.query("SELECT o.id,o.status AS \"orderStatus\",o.buyer_user_id AS \"buyerId\",s.id AS \"storeId\" FROM member_store_orders o JOIN stores s ON s.id=o.store_id WHERE o.id=$1 AND s.slug=$2 AND s.status='active' FOR UPDATE OF o",[orderId,slug]);
  if(!found.rowCount){await client.query("ROLLBACK");send(res,404,{success:false,error:"Order not found"});return;}
  const order=found.rows[0]; let result;
  if(action==="submit"){
   const reason=typeof input.reason==="string"?input.reason.trim():"", details=typeof input.details==="string"?input.details.trim():"";
   const resolution=input.resolution;
   if(order.buyerId!==session.user.id){await client.query("ROLLBACK");send(res,403,{success:false,error:"Only the buyer can request a return or exchange"});return;}
   if(!["shipped","completed"].includes(order.orderStatus)){await client.query("ROLLBACK");send(res,409,{success:false,error:"Returns and exchanges are available after shipment"});return;}
   if(!["return","replacement"].includes(String(resolution))||!["damaged_or_defective","not_as_described","wrong_item","missing_items","other"].includes(reason)||details.length<10||details.length>3000){await client.query("ROLLBACK");send(res,400,{success:false,error:"Choose a valid resolution and reason, and provide 10–3000 characters"});return;}
   const prior=await client.query("SELECT id,status FROM member_store_return_requests WHERE order_id=$1 AND status NOT IN ('closed','rejected') LIMIT 1",[orderId]);
   if(prior.rowCount){await client.query("ROLLBACK");send(res,409,{success:false,error:"An active return or exchange request already exists"});return;}
   result=await client.query("INSERT INTO member_store_return_requests(order_id,store_id,buyer_user_id,requested_resolution,reason,details) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,status,requested_resolution AS \"requestedResolution\",created_at AS \"createdAt\"",[orderId,order.storeId,session.user.id,resolution,reason,details]);
  }else{
   const selected=await client.query("SELECT id,status,buyer_user_id AS \"buyerId\",store_id AS \"storeId\" FROM member_store_return_requests WHERE order_id=$1 AND status NOT IN ('closed') ORDER BY created_at DESC LIMIT 1 FOR UPDATE",[orderId]);
   if(!selected.rowCount){await client.query("ROLLBACK");send(res,404,{success:false,error:"Active return request not found"});return;}
   const request=selected.rows[0];
   if(action==="respond"){
    const decision=input.decision, note=typeof input.note==="string"?input.note.trim():"";
    const member=await client.query("SELECT 1 WHERE "+merchantSql,[request.storeId,session.user.id,["store.order.manage","account.order.manage"]]);
    if(!member.rowCount){await client.query("ROLLBACK");send(res,403,{success:false,error:"Store order management permission required"});return;}
    if(request.status!=="submitted"||!["approved","rejected"].includes(String(decision))||note.length<5||note.length>2000){await client.query("ROLLBACK");send(res,409,{success:false,error:"A valid decision and 5–2000 character response are required"});return;}
    result=await client.query("UPDATE member_store_return_requests SET status=$2,merchant_response=$3,merchant_user_id=$4,merchant_responded_at=NOW(),updated_at=NOW() WHERE id=$1 RETURNING id,status,merchant_response AS \"merchantResponse\",updated_at AS \"updatedAt\"",[request.id,decision,note,session.user.id]);
   }else if(action==="received"){
    const member=await client.query("SELECT 1 WHERE "+merchantSql,[request.storeId,session.user.id,["store.order.manage","account.order.manage"]]);
    if(!member.rowCount){await client.query("ROLLBACK");send(res,403,{success:false,error:"Store order management permission required"});return;}
    if(request.status!=="approved"){await client.query("ROLLBACK");send(res,409,{success:false,error:"Only an approved return can be marked received"});return;}
    result=await client.query("UPDATE member_store_return_requests SET status='item_received',item_received_at=NOW(),updated_at=NOW() WHERE id=$1 RETURNING id,status,item_received_at AS \"itemReceivedAt\"",[request.id]);
   }else{
    if(request.buyerId!==session.user.id){await client.query("ROLLBACK");send(res,403,{success:false,error:"Only the buyer can close this request"});return;}
    if(!["rejected","item_received"].includes(request.status)){await client.query("ROLLBACK");send(res,409,{success:false,error:"Only a rejected request or a return confirmed received can be closed"});return;}
    result=await client.query("UPDATE member_store_return_requests SET status='closed',closed_at=NOW(),updated_at=NOW() WHERE id=$1 RETURNING id,status,closed_at AS \"closedAt\"",[request.id]);
   }
  }
  await client.query("INSERT INTO audit_logs(actor_user_id,action,resource_type,resource_id,metadata) VALUES($1,$2,'member_store_return_request',$3,$4::jsonb)",[session.user.id,"order_return."+action,result.rows[0].id,JSON.stringify({orderId,storeId:order.storeId})]);
  await client.query("COMMIT"); send(res,action==="submit"?201:200,{success:true,returnRequest:result.rows[0]});
 }catch(e){await client.query("ROLLBACK");throw e;}finally{client.release();}
}
export async function handlePlatformMemberStoreReturns(req:IncomingMessage,res:ServerResponse,id?:string){
 const access=await authorizePlatformPermission(req,res,"platform.reports.manage"); if(!access)return;
 const db=getDatabasePool();
 if(!id){if(req.method!=="GET"){send(res,405,{success:false,error:"Method not allowed"});return;}
  const rows=await db.query("SELECT r.id,r.order_id AS \"orderId\",o.order_number AS \"orderNumber\",r.store_id AS \"storeId\",s.name AS \"storeName\",r.buyer_user_id AS \"buyerUserId\",r.requested_resolution AS \"requestedResolution\",r.reason,r.details,r.status,r.merchant_response AS \"merchantResponse\",r.created_at AS \"createdAt\" FROM member_store_return_requests r JOIN member_store_orders o ON o.id=r.order_id JOIN stores s ON s.id=r.store_id WHERE r.status IN ('submitted','approved') ORDER BY r.created_at ASC LIMIT 100");
  send(res,200,{success:true,requests:rows.rows});return;
 }
 if(!uuid.test(id)||req.method!=="PATCH"){send(res,req.method!=="PATCH"?405:400,{success:false,error:"Invalid return request"});return;}
 send(res,409,{success:false,error:"Moderator overrides are intentionally disabled; resolve the request through the buyer and merchant workflow."});
}
