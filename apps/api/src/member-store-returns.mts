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
  if(!["return","replacement"].includes(String(input.resolution))||!["damaged_or_defective","not_as_described","wrong_item","missing_items","other","legal_rights_claim"].includes(reason)||details.length<10||details.length>3000){
   send(res,400,{success:false,error:"Choose a valid resolution and reason, and provide 10–3000 characters"});return;
  }
 }
 const db=getDatabasePool(), client=await db.connect();
 try{
  await client.query("BEGIN");
  const found=await client.query("SELECT o.id,o.status AS \"orderStatus\",o.buyer_user_id AS \"buyerId\",o.created_at AS \"orderCreatedAt\",o.shipped_at AS \"orderShippedAt\",o.delivery_confirmed_at AS \"deliveryConfirmedAt\",o.return_policy_snapshot AS \"returnPolicySnapshot\",o.return_policy_version AS \"returnPolicyVersion\",o.items,o.inventory_committed_at AS \"inventoryCommittedAt\",s.id AS \"storeId\" FROM member_store_orders o JOIN stores s ON s.id=o.store_id WHERE o.id=$1 AND s.slug=$2 AND s.status='active' FOR UPDATE OF o",[orderId,slug]);
  if(!found.rowCount){await client.query("ROLLBACK");send(res,404,{success:false,error:"Order not found"});return;}
  const order=found.rows[0]; let result; let restockedItems:Array<{productId:string;quantity:number}>=[];
  if(action==="submit"){
   const reason=typeof input.reason==="string"?input.reason.trim():"", details=typeof input.details==="string"?input.details.trim():"";
   const resolution=input.resolution;
   if(order.buyerId!==session.user.id){await client.query("ROLLBACK");send(res,403,{success:false,error:"Only the buyer can request a return or exchange"});return;}
   if(!["shipped","completed"].includes(order.orderStatus)){await client.query("ROLLBACK");send(res,409,{success:false,error:"Returns and exchanges are available after shipment"});return;}
   if(!["return","replacement"].includes(String(resolution))||!["damaged_or_defective","not_as_described","wrong_item","missing_items","other","legal_rights_claim"].includes(reason)||details.length<10||details.length>3000){await client.query("ROLLBACK");send(res,400,{success:false,error:"Choose a valid resolution and reason, and provide 10–3000 characters"});return;}
   const snapshot=order.returnPolicySnapshot;
   if(snapshot && typeof snapshot==="object" && !Array.isArray(snapshot) && snapshot.status!=="not_provided"){
    const enabled=resolution==="return"?snapshot.acceptsReturns===true:snapshot.acceptsExchanges===true;
    if(!enabled && reason!=="legal_rights_claim"){await client.query("ROLLBACK");send(res,409,{success:false,error:"This action is not enabled by the return policy saved with this order"});return;}
    const windowDays=Number(snapshot.requestWindowDays);
    const windowStart=new Date(order.deliveryConfirmedAt ?? order.orderShippedAt ?? order.orderCreatedAt).getTime();
    const withinWindow=Number.isInteger(windowDays)&&windowDays>=1&&windowDays<=365&&Date.now()<=windowStart+windowDays*86400000;
    if(!withinWindow && reason!=="legal_rights_claim"){await client.query("ROLLBACK");send(res,409,{success:false,error:"The store-configured request window has passed. If you believe mandatory legal rights apply, submit a legal-rights claim for review."});return;}
   }
   const prior=await client.query("SELECT id,status,item_received_at AS \"itemReceivedAt\" FROM member_store_return_requests WHERE order_id=$1 AND (status NOT IN ('closed','rejected') OR item_received_at IS NOT NULL) LIMIT 1",[orderId]);
   if(prior.rowCount){await client.query("ROLLBACK");send(res,409,{success:false,error:"An active return or exchange request already exists"});return;}
   result=await client.query("INSERT INTO member_store_return_requests(order_id,store_id,buyer_user_id,requested_resolution,reason,details) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,status,requested_resolution AS \"requestedResolution\",created_at AS \"createdAt\"",[orderId,order.storeId,session.user.id,resolution,reason,details]);
  }else{
   const selected=await client.query("SELECT id,status,buyer_user_id AS \"buyerId\",store_id AS \"storeId\",requested_resolution AS \"requestedResolution\" FROM member_store_return_requests WHERE order_id=$1 AND status NOT IN ('closed') ORDER BY created_at DESC LIMIT 1 FOR UPDATE",[orderId]);
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
    if(request.status!=="approved"||request.requestedResolution!=="return"){await client.query("ROLLBACK");send(res,409,{success:false,error:"Only an approved physical return can be marked received; replacement fulfillment is not enabled yet"});return;}
    if(input.restock!==undefined&&typeof input.restock!=="boolean"){await client.query("ROLLBACK");send(res,400,{success:false,error:"Restock selection must be true or false"});return;}
    const restock=input.restock===true;
    restockedItems=[];
    if(restock){
     if(!order.inventoryCommittedAt){await client.query("ROLLBACK");send(res,409,{success:false,error:"This legacy order has no recorded inventory commitment and cannot be restocked automatically"});return;}
     if(!Array.isArray(order.items)||order.items.length===0){await client.query("ROLLBACK");send(res,409,{success:false,error:"Order items are unavailable for inventory restoration"});return;}
     const inventoryLines=[...order.items].sort((left,right)=>String(left?.productId??"").localeCompare(String(right?.productId??"")));
     for(const item of inventoryLines){
      if(!item||typeof item!=="object"||typeof item.productId!=="string"||!uuid.test(item.productId)||!Number.isSafeInteger(item.quantity)||item.quantity<1){await client.query("ROLLBACK");send(res,409,{success:false,error:"Order contains invalid inventory details"});return;}
      const restored=await client.query("UPDATE store_products SET stock_quantity=stock_quantity+$3,updated_at=NOW() WHERE id=$1 AND store_id=$2 AND stock_quantity<=2147483647-$3 RETURNING id",[item.productId,order.storeId,item.quantity]);
      if(restored.rowCount!==1){await client.query("ROLLBACK");send(res,409,{success:false,error:"Could not restock a returned item. Contact platform support."});return;}
      restockedItems.push({productId:item.productId,quantity:item.quantity});
     }
    }
    result=await client.query("UPDATE member_store_return_requests SET status='item_received',item_received_at=NOW(),restocked_at=CASE WHEN $2 THEN NOW() ELSE NULL END,updated_at=NOW() WHERE id=$1 RETURNING id,status,item_received_at AS \"itemReceivedAt\",restocked_at AS \"restockedAt\"",[request.id,restock]);
   }else{
    if(request.buyerId!==session.user.id){await client.query("ROLLBACK");send(res,403,{success:false,error:"Only the buyer can close this request"});return;}
    if(!["rejected","item_received"].includes(request.status)){await client.query("ROLLBACK");send(res,409,{success:false,error:"Only a rejected request or a return confirmed received can be closed"});return;}
    result=await client.query("UPDATE member_store_return_requests SET status='closed',closed_at=NOW(),updated_at=NOW() WHERE id=$1 RETURNING id,status,closed_at AS \"closedAt\"",[request.id]);
   }
  }
  await client.query("INSERT INTO audit_logs(actor_user_id,action,resource_type,resource_id,metadata) VALUES($1,$2,'member_store_return_request',$3,$4::jsonb)",[session.user.id,"order_return."+action,result.rows[0].id,JSON.stringify({orderId,storeId:order.storeId,...(action==="received"?{restocked:input.restock===true,restockedItems:input.restock===true?restockedItems:[]}:{})})]);
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


/** Buyer-to-support escalation. This records a review request only; it never decides legal entitlement or issues refunds. */
export async function handleMemberStoreReturnEscalation(req: IncomingMessage, res: ServerResponse, slug: string, orderId: string) {
 if (!uuid.test(orderId)) { send(res,400,{success:false,error:"Invalid order id"}); return; }
 if (req.method !== "POST") { send(res,405,{success:false,error:"Method not allowed"}); return; }
 const session=await auth.api.getSession({headers:fromNodeHeaders(req.headers)});
 if (!session) { send(res,401,{success:false,error:"Authentication required"}); return; }
 let input:Record<string,unknown>|null;
 try { input=await body(req); } catch { send(res,400,{success:false,error:"Invalid request body"}); return; }
 if (!input) { send(res,400,{success:false,error:"Invalid request body"}); return; }
 const reason=String(input.reason ?? "");
 const details=typeof input.details==="string"?input.details.trim():"";
 if (!["legal_rights_claim","merchant_nonresponse","dispute"].includes(reason)||details.length<10||details.length>3000) {
  send(res,400,{success:false,error:"Choose a valid escalation reason and provide 10–3000 characters"}); return;
 }
 const client=await getDatabasePool().connect();
 try {
  await client.query("BEGIN");
  const order=await client.query(`SELECT o.id,o.buyer_user_id AS "buyerId",s.id AS "storeId"
   FROM member_store_orders o JOIN stores s ON s.id=o.store_id
   WHERE o.id=$1 AND s.slug=$2 AND s.status='active' FOR UPDATE OF o`,[orderId,slug]);
  if(!order.rowCount){await client.query("ROLLBACK");send(res,404,{success:false,error:"Order not found"});return;}
  if(order.rows[0].buyerId!==session.user.id){await client.query("ROLLBACK");send(res,403,{success:false,error:"Only the buyer can escalate this order"});return;}
  const request=await client.query(`SELECT id,reason,status FROM member_store_return_requests
   WHERE order_id=$1 AND buyer_user_id=$2 ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,[orderId,session.user.id]);
  if(!request.rowCount){await client.query("ROLLBACK");send(res,409,{success:false,error:"Submit a return or exchange request before escalating"});return;}
  if(reason==="legal_rights_claim" && request.rows[0].reason!=="legal_rights_claim"){
   await client.query("ROLLBACK");send(res,409,{success:false,error:"A legal-rights escalation must be linked to a legal-rights claim"});return;
  }
  const inserted=await client.query(`INSERT INTO member_store_return_escalations
   (return_request_id,order_id,store_id,buyer_user_id,reason,details)
   VALUES($1,$2,$3,$4,$5,$6)
   ON CONFLICT(return_request_id) DO NOTHING
   RETURNING id,status,reason,created_at AS "createdAt"`,
   [request.rows[0].id,orderId,order.rows[0].storeId,session.user.id,reason,details]);
  if(!inserted.rowCount){await client.query("ROLLBACK");send(res,409,{success:false,error:"This request has already been escalated"});return;}
  await client.query(`INSERT INTO audit_logs(actor_user_id,action,resource_type,resource_id,metadata)
   VALUES($1,'order_return.escalated','member_store_return_escalation',$2,$3::jsonb)`,
   [session.user.id,inserted.rows[0].id,JSON.stringify({orderId,returnRequestId:request.rows[0].id,reason})]);
  await client.query("COMMIT");send(res,201,{success:true,escalation:inserted.rows[0],notice:"Support review requested. This is not a legal determination or an automatic refund."});
 } catch(e) { await client.query("ROLLBACK"); throw e; } finally { client.release(); }
}

/** Platform support queue. Staff can acknowledge or close the review record, not decide consumer-law entitlement. */
export async function handlePlatformMemberStoreReturnEscalations(req: IncomingMessage,res: ServerResponse,id?:string) {
 const access=await authorizePlatformPermission(req,res,"platform.reports.manage"); if(!access)return;
 const db=getDatabasePool();
 if(!id) {
  if(req.method!=="GET"){send(res,405,{success:false,error:"Method not allowed"});return;}
  const rows=await db.query(`SELECT e.id,e.return_request_id AS "returnRequestId",e.order_id AS "orderId",
   o.order_number AS "orderNumber",e.store_id AS "storeId",s.name AS "storeName",
   e.buyer_user_id AS "buyerUserId",e.reason,e.details,e.status,e.support_note AS "supportNote",
   e.created_at AS "createdAt",e.handled_at AS "handledAt"
   FROM member_store_return_escalations e
   JOIN member_store_orders o ON o.id=e.order_id JOIN stores s ON s.id=e.store_id
   WHERE e.status IN ('open','acknowledged') ORDER BY e.created_at ASC LIMIT 100`);
  send(res,200,{success:true,escalations:rows.rows});return;
 }
 if(!uuid.test(id)||req.method!=="PATCH"){send(res,req.method!=="PATCH"?405:400,{success:false,error:"Invalid escalation"});return;}
 let input:Record<string,unknown>|null;
 try{input=await body(req);}catch{send(res,400,{success:false,error:"Invalid request body"});return;}
 if(!input){send(res,400,{success:false,error:"Invalid request body"});return;}
 const status=String(input.status??"");
 const note=typeof input.note==="string"?input.note.trim():"";
 if(!["acknowledged","closed"].includes(status)||note.length<5||note.length>2000){send(res,400,{success:false,error:"Choose acknowledged or closed and provide a 5–2000 character support note"});return;}
 const result=await db.query(`UPDATE member_store_return_escalations
  SET status=$2,support_note=$3,handled_by=$4,handled_at=NOW(),updated_at=NOW()
  WHERE id=$1 AND status IN ('open','acknowledged')
  RETURNING id,status,support_note AS "supportNote",handled_at AS "handledAt"`,
  [id,status,note,access.userId]);
 if(!result.rowCount){send(res,404,{success:false,error:"Open escalation not found"});return;}
 await db.query(`INSERT INTO audit_logs(actor_user_id,action,resource_type,resource_id,metadata)
  VALUES($1,$2,'member_store_return_escalation',$3,$4::jsonb)`,
  [access.userId,"order_return.escalation."+status,id,JSON.stringify({status})]);
 send(res,200,{success:true,escalation:result.rows[0]});
}
