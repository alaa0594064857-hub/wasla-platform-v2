import type { IncomingMessage, ServerResponse } from 'node:http';
import { fromNodeHeaders } from 'better-auth/node';
import { auth } from './auth.mjs';
import { authorizePlatformPermission } from './platform-security.mjs';
import { getDatabasePool } from './database.js';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function respond(res: ServerResponse, status: number, data: Record<string, unknown>) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); }
async function readBody(req: IncomingMessage): Promise<unknown> { let raw = '', size = 0; for await (const chunk of req) { size += Buffer.byteLength(chunk); if (size > 4000) throw new Error('Request body too large'); raw += chunk.toString(); } return JSON.parse(raw); }
function isObject(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
export async function handleSellerReviewResponse(req: IncomingMessage, res: ServerResponse, reviewId: string): Promise<void> {
 if (req.method !== 'POST') { respond(res,405,{success:false,error:'Method not allowed'}); return; }
 if (!uuid.test(reviewId)) { respond(res,400,{success:false,error:'Invalid review id'}); return; }
 const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) }); if (!session) { respond(res,401,{success:false,error:'Authentication required'}); return; }
 let body: unknown; try { body = await readBody(req); } catch (e) { const large = e instanceof Error && e.message === 'Request body too large'; respond(res,large?413:400,{success:false,error:large?'Request body too large':'Invalid request body'}); return; }
 if (!isObject(body) || typeof body.body !== 'string' || body.body.trim().length < 5 || body.body.trim().length > 1500) { respond(res,400,{success:false,error:'Response must be between 5 and 1500 characters'}); return; }
 const client = await getDatabasePool().connect();
 try {
  await client.query('BEGIN');
  const review = await client.query("SELECT r.id, r.store_id AS \"storeId\", s.account_id AS \"accountId\" FROM verified_product_reviews r JOIN stores s ON s.id=r.store_id WHERE r.id=$1 AND r.status='published' AND s.status='active' AND (EXISTS (SELECT 1 FROM account_members am JOIN roles ro ON ro.id=am.role_id AND ro.scope_type=am.role_scope JOIN role_permissions rp ON rp.role_id=ro.id AND rp.scope_type=ro.scope_type JOIN permissions p ON p.id=rp.permission_id AND p.scope_type=rp.scope_type WHERE am.account_id=s.account_id AND am.user_id=$2 AND am.status='active' AND p.permission_key=ANY($3::text[])) OR EXISTS (SELECT 1 FROM store_members sm JOIN roles ro ON ro.id=sm.role_id AND ro.scope_type=sm.role_scope JOIN role_permissions rp ON rp.role_id=ro.id AND rp.scope_type=ro.scope_type JOIN permissions p ON p.id=rp.permission_id AND p.scope_type=rp.scope_type WHERE sm.store_id=s.id AND sm.user_id=$2 AND sm.status='active' AND p.permission_key=ANY($3::text[]))) FOR UPDATE OF r", [reviewId,session.user.id,['store.product.update','store.order.manage','account.order.manage']]);
  if (!review.rowCount) { await client.query('ROLLBACK'); respond(res,404,{success:false,error:'Published review not found or you cannot manage this store'}); return; }
  const inserted = await client.query("INSERT INTO verified_product_review_responses (review_id,store_id,author_user_id,body) VALUES ($1,$2,$3,$4) ON CONFLICT (review_id) DO NOTHING RETURNING id,review_id AS \"reviewId\",body,status,created_at AS \"createdAt\"", [reviewId,review.rows[0].storeId,session.user.id,body.body.trim()]);
  if (!inserted.rowCount) { await client.query('ROLLBACK'); respond(res,409,{success:false,error:'A store response already exists for this review'}); return; }
  await client.query("INSERT INTO audit_logs (actor_user_id,action,resource_type,resource_id,metadata) VALUES ($1,'review.store_response_submitted','verified_product_review_response',$2,$3::jsonb)",[session.user.id,inserted.rows[0].id,JSON.stringify({reviewId,storeId:review.rows[0].storeId,status:'pending_moderation'})]);
  await client.query('COMMIT'); respond(res,201,{success:true,response:inserted.rows[0],message:'Your store response was submitted for moderation'});
 } catch(e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
}
export async function handlePlatformReviewResponses(req: IncomingMessage,res: ServerResponse,responseId?: string): Promise<void> {
 if (req.method!=='GET' && req.method!=='PATCH') { respond(res,405,{success:false,error:'Method not allowed'}); return; }
 const access=await authorizePlatformPermission(req,res,'platform.reports.manage'); if(!access) return; const db=getDatabasePool();
 if(req.method==='GET') { if(responseId){respond(res,405,{success:false,error:'Method not allowed'});return;} const rows=await db.query("SELECT x.id,x.review_id AS \"reviewId\",x.store_id AS \"storeId\",s.name AS \"storeName\",p.title AS \"productTitle\",r.rating,r.body AS \"reviewBody\",x.body AS \"responseBody\",x.status,x.created_at AS \"createdAt\" FROM verified_product_review_responses x JOIN verified_product_reviews r ON r.id=x.review_id JOIN stores s ON s.id=x.store_id JOIN store_products p ON p.id=r.product_id WHERE x.status='pending_moderation' ORDER BY x.created_at ASC LIMIT 100"); respond(res,200,{success:true,responses:rows.rows});return; }
 if(!responseId || !uuid.test(responseId)){respond(res,400,{success:false,error:'A valid response id is required'});return;}
 let body:unknown; try{body=await readBody(req);}catch(e){const large=e instanceof Error&&e.message==='Request body too large';respond(res,large?413:400,{success:false,error:large?'Request body too large':'Invalid request body'});return;}
 if(!isObject(body)||!['published','rejected'].includes(String(body.status))||(body.note!==undefined&&(typeof body.note!=='string'||body.note.trim().length>1000))){respond(res,400,{success:false,error:'Choose published or rejected and an optional note up to 1000 characters'});return;}
 const client=await db.connect(); try{await client.query('BEGIN'); const current=await client.query("SELECT id,review_id AS \"reviewId\",status FROM verified_product_review_responses WHERE id=$1 FOR UPDATE",[responseId]);
 if(!current.rowCount||current.rows[0].status!=='pending_moderation'){await client.query('ROLLBACK');respond(res,current.rowCount?409:404,{success:false,error:current.rowCount?'Response is already moderated':'Response not found'});return;}
 const decision=body.status as 'published'|'rejected'; const updated=await client.query("UPDATE verified_product_review_responses SET status=$2,moderated_by=$3,moderation_note=$4,moderated_at=NOW(),updated_at=NOW() WHERE id=$1 RETURNING id,review_id AS \"reviewId\",status,moderated_at AS \"moderatedAt\"",[responseId,decision,access.userId,typeof body.note==='string'?body.note.trim()||null:null]);
 await client.query("INSERT INTO audit_logs (actor_user_id,action,resource_type,resource_id,metadata) VALUES ($1,$2,'verified_product_review_response',$3,$4::jsonb)",[access.userId,'review.store_response.'+decision,responseId,JSON.stringify({reviewId:current.rows[0].reviewId,note:typeof body.note==='string'?body.note.trim():null})]); await client.query('COMMIT'); respond(res,200,{success:true,response:updated.rows[0]});
 }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}