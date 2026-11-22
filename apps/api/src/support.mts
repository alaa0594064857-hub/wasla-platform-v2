import type { IncomingMessage, ServerResponse } from "node:http";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "./auth.mjs";
import { authorizePlatformPermission } from "./platform-security.mjs";
import { getDatabasePool } from "./database.js";

/**
 * The production API uses idempotent schema bootstraps rather than running the
 * full Drizzle migration history at startup. Keep the support schema available
 * on existing databases as well as fresh installs.
 */
export async function ensureSupportTables(): Promise<void> {
  const db = getDatabasePool();

  await db.query(`CREATE SEQUENCE IF NOT EXISTS support_ticket_number_seq`);
  await db.query(`
    CREATE TABLE IF NOT EXISTS support_tickets (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      ticket_number varchar(32) NOT NULL UNIQUE,
      requester_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      category varchar(40) NOT NULL,
      subject varchar(180) NOT NULL CHECK (length(trim(subject)) BETWEEN 4 AND 180),
      description text NOT NULL CHECK (length(trim(description)) BETWEEN 10 AND 8000),
      priority varchar(12) NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
      status varchar(24) NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','waiting_for_user','resolved','closed')),
      assigned_to_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
      first_response_at timestamptz,
      resolved_at timestamptz,
      closed_at timestamptz,
      last_message_at timestamptz NOT NULL DEFAULT NOW(),
      created_at timestamptz NOT NULL DEFAULT NOW(),
      updated_at timestamptz NOT NULL DEFAULT NOW()
    )
  `);
  await db.query(`
    ALTER TABLE support_tickets
      DROP CONSTRAINT IF EXISTS support_tickets_category_check
  `);
  await db.query(`
    ALTER TABLE support_tickets
      ADD CONSTRAINT support_tickets_category_check
      CHECK (category IN (
        'account_access','account_deletion','payments_billing','orders_delivery',
        'returns_refunds','store_seller','trade_business','affiliate_commissions',
        'technical_issue','security_report','other'
      ))
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS support_messages (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      ticket_id uuid NOT NULL REFERENCES support_tickets(id) ON DELETE RESTRICT,
      author_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
      body text NOT NULL CHECK (length(trim(body)) BETWEEN 1 AND 8000),
      visibility varchar(16) NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','internal')),
      created_at timestamptz NOT NULL DEFAULT NOW()
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS support_ticket_events (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      ticket_id uuid NOT NULL REFERENCES support_tickets(id) ON DELETE RESTRICT,
      actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
      event_type varchar(24) NOT NULL CHECK (event_type IN ('created','replied','internal_note','assigned','status_changed','priority_changed','reopened')),
      from_value varchar(80),
      to_value varchar(80),
      note varchar(1000),
      created_at timestamptz NOT NULL DEFAULT NOW()
    )
  `);

  await db.query(`CREATE INDEX IF NOT EXISTS support_tickets_requester_updated_idx ON support_tickets (requester_user_id, updated_at DESC)`);
  await db.query(`CREATE INDEX IF NOT EXISTS support_tickets_queue_idx ON support_tickets (status, priority, created_at)`);
  await db.query(`CREATE INDEX IF NOT EXISTS support_tickets_assignee_idx ON support_tickets (assigned_to_user_id, status, updated_at DESC)`);
  await db.query(`CREATE INDEX IF NOT EXISTS support_messages_ticket_created_idx ON support_messages (ticket_id, created_at)`);
  await db.query(`CREATE INDEX IF NOT EXISTS support_ticket_events_ticket_created_idx ON support_ticket_events (ticket_id, created_at DESC)`);
}


const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const categories=["account_access","account_deletion","payments_billing","orders_delivery","returns_refunds","store_seller","trade_business","affiliate_commissions","technical_issue","security_report","other"];
const priorities=["low","normal","high","urgent"], statuses=["open","in_progress","waiting_for_user","resolved","closed"];
function send(res:ServerResponse,status:number,data:Record<string,unknown>){res.writeHead(status,{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer"});res.end(JSON.stringify(data));}
async function readBody(req:IncomingMessage):Promise<Record<string,unknown>|null>{const chunks:Buffer[]=[];let size=0;for await(const chunk of req){const b=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);size+=b.length;if(size>10000)throw new Error("too_large");chunks.push(b);}try{const x:unknown=JSON.parse(Buffer.concat(chunks).toString("utf8"));return x&&typeof x==="object"&&!Array.isArray(x)?x as Record<string,unknown>:null;}catch{return null;}}
async function userSession(req:IncomingMessage,res:ServerResponse){const s=await auth.api.getSession({headers:fromNodeHeaders(req.headers)});if(!s){send(res,401,{success:false,error:"Authentication required"});return null;}const active=await getDatabasePool().query("SELECT id FROM users WHERE id=$1 AND status='active' AND email_verified=TRUE",[s.user.id]);if(!active.rowCount){send(res,403,{success:false,error:"An active verified account is required"});return null;}return s;}
export async function handleSupportRequest(req:IncomingMessage,res:ServerResponse,id?:string,platform=false):Promise<void>{
 const path=new URL(req.url??"/","http://localhost").pathname, messagesPath=path.endsWith("/messages");
 if(id&&!uuid.test(id)){send(res,400,{success:false,error:"Invalid ticket id"});return;}
 try{
  const db=getDatabasePool();
  if(platform){
   const permission=req.method==="GET"?"platform.support.queue.read":req.method==="PATCH"?"platform.support.case.status":"platform.support.case.reply";
   const access=await authorizePlatformPermission(req,res,permission);if(!access)return;
   if(req.method==="GET"&&!id){
    const rows=await db.query(`SELECT t.id,t.ticket_number AS "ticketNumber",t.category,t.subject,t.priority,t.status,t.assigned_to_user_id AS "assignedToUserId",t.created_at AS "createdAt",t.updated_at AS "updatedAt",u.name AS "requesterName",u.email AS "requesterEmail" FROM support_tickets t JOIN users u ON u.id=t.requester_user_id WHERE t.status<>'closed' ORDER BY CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,t.created_at ASC LIMIT 200`);
    send(res,200,{success:true,tickets:rows.rows});return;
   }
   if(!id){send(res,405,{success:false,error:"Method not allowed"});return;}
   if(req.method==="GET"){
    const ticket=await db.query(`SELECT t.id,t.ticket_number AS "ticketNumber",t.requester_user_id AS "requesterUserId",t.category,t.subject,t.description,t.priority,t.status,t.assigned_to_user_id AS "assignedToUserId",t.created_at AS "createdAt",t.updated_at AS "updatedAt",u.name AS "requesterName",u.email AS "requesterEmail" FROM support_tickets t JOIN users u ON u.id=t.requester_user_id WHERE t.id=$1`,[id]);
    if(!ticket.rowCount){send(res,404,{success:false,error:"Ticket not found"});return;}
    const msgs=await db.query(`SELECT id,author_user_id AS "authorUserId",body,visibility,created_at AS "createdAt" FROM support_messages WHERE ticket_id=$1 ORDER BY created_at`,[id]);
    const events=await db.query(`SELECT id,actor_user_id AS "actorUserId",event_type AS "eventType",from_value AS "fromValue",to_value AS "toValue",note,created_at AS "createdAt" FROM support_ticket_events WHERE ticket_id=$1 ORDER BY created_at`,[id]);
    send(res,200,{success:true,ticket:ticket.rows[0],messages:msgs.rows,events:events.rows});return;
   }
   if(req.method==="PATCH"){
    const input=await readBody(req);if(!input){send(res,400,{success:false,error:"Invalid request body"});return;}
    if(Object.prototype.hasOwnProperty.call(input,"assignedToUserId")){
      const assignmentAccess=await authorizePlatformPermission(req,res,"platform.support.case.assign");
      if(!assignmentAccess)return;
    }
    const c=await db.connect();try{await c.query("BEGIN");const old=await c.query("SELECT status,priority,assigned_to_user_id AS assignee FROM support_tickets WHERE id=$1 FOR UPDATE",[id]);if(!old.rowCount){await c.query("ROLLBACK");send(res,404,{success:false,error:"Ticket not found"});return;}
     const before=old.rows[0],status=input.status===undefined?before.status:String(input.status),priority=input.priority===undefined?before.priority:String(input.priority),assignee=input.assignedToUserId===undefined?before.assignee:input.assignedToUserId;
     if(!statuses.includes(status)||!priorities.includes(priority)||(assignee!==null&&typeof assignee!=="string")||(typeof assignee==="string"&&!uuid.test(assignee))){await c.query("ROLLBACK");send(res,400,{success:false,error:"Invalid status, priority, or assignee"});return;}
     if(status!==before.status&&!((before.status==="open"&&["in_progress","waiting_for_user","closed"].includes(status))||(before.status==="in_progress"&&["waiting_for_user","resolved","closed"].includes(status))||(before.status==="waiting_for_user"&&["in_progress","resolved","closed"].includes(status))||(before.status==="resolved"&&["in_progress","closed"].includes(status)))){await c.query("ROLLBACK");send(res,409,{success:false,error:"Unsupported status transition"});return;}
     if(typeof assignee==="string"&&!(await c.query("SELECT id FROM users WHERE id=$1 AND status='active' AND email_verified=TRUE",[assignee])).rowCount){await c.query("ROLLBACK");send(res,400,{success:false,error:"Assignee must be active and verified"});return;}
     const updated=await c.query(`UPDATE support_tickets SET status=$2,priority=$3,assigned_to_user_id=$4,updated_at=NOW(),resolved_at=CASE WHEN $2='resolved' THEN COALESCE(resolved_at,NOW()) WHEN $2='in_progress' THEN NULL ELSE resolved_at END,closed_at=CASE WHEN $2='closed' THEN COALESCE(closed_at,NOW()) ELSE NULL END WHERE id=$1 RETURNING id,status,priority,assigned_to_user_id AS "assignedToUserId",updated_at AS "updatedAt"`,[id,status,priority,assignee]);
     for(const [oldValue,newValue,event] of [[before.status,status,"status_changed"],[before.priority,priority,"priority_changed"],[before.assignee,assignee,"assigned"]] as const)if(oldValue!==newValue)await c.query("INSERT INTO support_ticket_events(ticket_id,actor_user_id,event_type,from_value,to_value) VALUES($1,$2,$3,$4,$5)",[id,access.userId,event,String(oldValue??""),String(newValue??"")]);
     if(status!==before.status){
      const requester=await c.query("SELECT requester_user_id,ticket_number FROM support_tickets WHERE id=$1",[id]);
      if(requester.rowCount)await c.query(`INSERT INTO notifications(user_id,type,title_ar,title_en,body_ar,body_en,action_url,resource_id,metadata) VALUES($1,'support_ticket','تحديث على تذكرة الدعم','Support ticket updated','تم تحديث حالة تذكرتك','Your support ticket status changed',$2,$3,$4::jsonb)`,[requester.rows[0].requester_user_id,`/support/tickets/${id}`,id,JSON.stringify({ticketNumber:requester.rows[0].ticket_number})]);
     }
     await c.query("COMMIT");send(res,200,{success:true,ticket:updated.rows[0]});return;
    }catch(e){await c.query("ROLLBACK");throw e;}finally{c.release();}
   }
   if(req.method==="POST"&&messagesPath){
    const input=await readBody(req),body=typeof input?.body==="string"?input.body.trim():"",visibility=input?.visibility==="internal"?"internal":"public";
    if(!body||body.length>8000){send(res,400,{success:false,error:"Message must contain 1–8000 characters"});return;}
    const c=await db.connect();try{await c.query("BEGIN");const ticket=await c.query("SELECT requester_user_id,ticket_number FROM support_tickets WHERE id=$1 FOR UPDATE",[id]);if(!ticket.rowCount){await c.query("ROLLBACK");send(res,404,{success:false,error:"Ticket not found"});return;}
     const msg=await c.query("INSERT INTO support_messages(ticket_id,author_user_id,body,visibility) VALUES($1,$2,$3,$4) RETURNING id,created_at AS \"createdAt\"",[id,access.userId,body,visibility]);
     await c.query("INSERT INTO support_ticket_events(ticket_id,actor_user_id,event_type) VALUES($1,$2,$3)",[id,access.userId,visibility==="internal"?"internal_note":"replied"]);
     await c.query("UPDATE support_tickets SET last_message_at=NOW(),updated_at=NOW(),first_response_at=COALESCE(first_response_at,NOW()) WHERE id=$1",[id]);
     if(visibility==="public")await c.query(`INSERT INTO notifications(user_id,type,title_ar,title_en,body_ar,body_en,action_url,resource_id,metadata) VALUES($1,'support_ticket','رد جديد من فريق الدعم','New support reply','لديك رد جديد على تذكرة الدعم','You have a new support reply',$2,$3,$4::jsonb)`,[ticket.rows[0].requester_user_id,`/support/tickets/${id}`,id,JSON.stringify({ticketNumber:ticket.rows[0].ticket_number})]);
     await c.query("COMMIT");send(res,201,{success:true,message:msg.rows[0]});return;
    }catch(e){await c.query("ROLLBACK");throw e;}finally{c.release();}
   }
   send(res,405,{success:false,error:"Method not allowed"});return;
  }
  const session=await userSession(req,res);if(!session)return;
  if(!id&&req.method==="GET"){const rows=await db.query(`SELECT id,ticket_number AS "ticketNumber",category,subject,priority,status,last_message_at AS "lastMessageAt",created_at AS "createdAt",updated_at AS "updatedAt" FROM support_tickets WHERE requester_user_id=$1 ORDER BY updated_at DESC LIMIT 100`,[session.user.id]);send(res,200,{success:true,tickets:rows.rows});return;}
  if(!id&&req.method==="POST"){
   const input=await readBody(req);if(!input){send(res,400,{success:false,error:"Invalid request body"});return;}
   const category=String(input.category??""),subject=typeof input.subject==="string"?input.subject.trim():"",description=typeof input.description==="string"?input.description.trim():"",priority="normal";
   if(!categories.includes(category)||subject.length<4||subject.length>180||description.length<10||description.length>8000){send(res,400,{success:false,error:"Choose a category and provide a subject and description"});return;}
   const c=await db.connect();try{await c.query("BEGIN");const seq=await c.query("SELECT nextval('support_ticket_number_seq') AS value"),number=`WASLA-${new Date().getUTCFullYear()}-${String(seq.rows[0].value).padStart(6,"0")}`;
    const created=await c.query(`INSERT INTO support_tickets(ticket_number,requester_user_id,category,subject,description,priority) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,ticket_number AS "ticketNumber",category,subject,priority,status,created_at AS "createdAt"`,[number,session.user.id,category,subject,description,priority]);
    await c.query("INSERT INTO support_ticket_events(ticket_id,actor_user_id,event_type,to_value) VALUES($1,$2,'created','open')",[created.rows[0].id,session.user.id]);
    await c.query(`INSERT INTO notifications(user_id,type,title_ar,title_en,body_ar,body_en,action_url,resource_id,metadata)
      SELECT DISTINCT u.id,'support_ticket','تذكرة دعم جديدة','New support ticket','وصل طلب دعم جديد إلى قائمة المعالجة','A new support request entered the queue',$1,$2,$3::jsonb
      FROM users u
      JOIN platform_role_assignments pra ON pra.user_id=u.id AND pra.status='active' AND pra.role_scope='platform'
      JOIN roles r ON r.id=pra.role_id AND r.scope_type='platform'
      JOIN role_permissions rp ON rp.role_id=r.id AND rp.scope_type='platform'
      JOIN permissions p ON p.id=rp.permission_id AND p.scope_type='platform'
      WHERE u.status='active' AND u.email_verified=TRUE AND p.permission_key='platform.support.queue.read' AND u.id<>$4
        AND NOT EXISTS(SELECT 1 FROM notifications n WHERE n.user_id=u.id AND n.type='support_ticket' AND n.resource_id=$2)`,
      [`/owner/support`,created.rows[0].id,JSON.stringify({ticketNumber:number}),session.user.id]);
    await c.query("COMMIT");send(res,201,{success:true,ticket:created.rows[0]});return;
   }catch(e){await c.query("ROLLBACK");throw e;}finally{c.release();}
  }
  if(id&&req.method==="GET"){
   const ticket=await db.query(`SELECT id,ticket_number AS "ticketNumber",category,subject,description,priority,status,created_at AS "createdAt",updated_at AS "updatedAt" FROM support_tickets WHERE id=$1 AND requester_user_id=$2`,[id,session.user.id]);if(!ticket.rowCount){send(res,404,{success:false,error:"Ticket not found"});return;}
   const msgs=await db.query(`SELECT id,author_user_id AS "authorUserId",body,created_at AS "createdAt" FROM support_messages WHERE ticket_id=$1 AND visibility='public' ORDER BY created_at`,[id]);
   const events=await db.query(`SELECT id,event_type AS "eventType",from_value AS "fromValue",to_value AS "toValue",created_at AS "createdAt" FROM support_ticket_events WHERE ticket_id=$1 AND event_type<>'internal_note' ORDER BY created_at`,[id]);send(res,200,{success:true,ticket:ticket.rows[0],messages:msgs.rows,events:events.rows});return;
  }
  if(id&&req.method==="POST"&&messagesPath){
   const input=await readBody(req),body=typeof input?.body==="string"?input.body.trim():"";if(!body||body.length>8000){send(res,400,{success:false,error:"Message must contain 1–8000 characters"});return;}
   const c=await db.connect();try{await c.query("BEGIN");const ticket=await c.query("SELECT status FROM support_tickets WHERE id=$1 AND requester_user_id=$2 FOR UPDATE",[id,session.user.id]);if(!ticket.rowCount){await c.query("ROLLBACK");send(res,404,{success:false,error:"Ticket not found"});return;}if(ticket.rows[0].status==="closed"){await c.query("ROLLBACK");send(res,409,{success:false,error:"Closed tickets cannot receive replies"});return;}
    const msg=await c.query("INSERT INTO support_messages(ticket_id,author_user_id,body,visibility) VALUES($1,$2,$3,'public') RETURNING id,body,created_at AS \"createdAt\"",[id,session.user.id,body]);await c.query("INSERT INTO support_ticket_events(ticket_id,actor_user_id,event_type) VALUES($1,$2,'replied')",[id,session.user.id]);const nextStatus=ticket.rows[0].status==="resolved"?"open":ticket.rows[0].status==="waiting_for_user"?"in_progress":ticket.rows[0].status;
    await c.query("UPDATE support_tickets SET status=$2,last_message_at=NOW(),updated_at=NOW() WHERE id=$1",[id,nextStatus]);
    if(nextStatus!==ticket.rows[0].status)await c.query("INSERT INTO support_ticket_events(ticket_id,actor_user_id,event_type,from_value,to_value) VALUES($1,$2,'status_changed',$3,$4)",[id,session.user.id,ticket.rows[0].status,nextStatus]);
    await c.query("COMMIT");send(res,201,{success:true,message:msg.rows[0]});return;
   }catch(e){await c.query("ROLLBACK");throw e;}finally{c.release();}
  }
  send(res,405,{success:false,error:"Method not allowed"});
 }catch(error){console.error("WASLA support center error:",error);if(!res.headersSent)send(res,error instanceof Error&&error.message==="too_large"?413:500,{success:false,error:error instanceof Error&&error.message==="too_large"?"Request body too large":"Support center request failed"});else res.destroy(error instanceof Error?error:undefined);}
}
