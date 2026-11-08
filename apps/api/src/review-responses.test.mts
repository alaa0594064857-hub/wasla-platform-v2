import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Server } from 'node:http';
import { createWaslaServer } from './server.js';
import { auth } from './auth.mjs';
import { authorizePlatformPermission } from './platform-security.mjs';
import { getDatabasePool } from './database.js';
vi.mock('./auth.mjs', () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock('./platform-security.mjs', () => ({ authorizePlatformPermission: vi.fn() }));
vi.mock('./database.js', () => ({ getDatabasePool: vi.fn() }));
let server: Server | undefined; const query=vi.fn(); const clientQuery=vi.fn(); const release=vi.fn(); const connect=vi.fn();
beforeEach(() => {
 vi.mocked(auth.api.getSession).mockResolvedValue({user:{id:'11111111-1111-4111-8111-111111111111'}} as never);
 vi.mocked(authorizePlatformPermission).mockResolvedValue({userId:'11111111-1111-4111-8111-111111111111',roleNames:['platform_admin'],permissions:['platform.reports.manage']} as never);
 query.mockReset(); clientQuery.mockReset(); release.mockReset(); connect.mockReset(); connect.mockResolvedValue({query:clientQuery,release});
 vi.mocked(getDatabasePool).mockReturnValue({query,connect} as never);
});
afterEach(async()=>{if(server?.listening) await new Promise<void>((resolve,reject)=>server!.close(e=>e?reject(e):resolve())); server=undefined; vi.clearAllMocks();});
async function start(){server=createWaslaServer(); await new Promise<void>((resolve,reject)=>{server!.once('error',reject);server!.listen(0,'127.0.0.1',resolve);});const a=server.address();if(!a||typeof a==='string')throw new Error('No test address');return 'http://127.0.0.1:'+a.port;}
describe('seller review responses',()=>{
 const reviewId='22222222-2222-4222-8222-222222222222';
 it('requires a signed-in seller',async()=>{vi.mocked(auth.api.getSession).mockResolvedValueOnce(null as never);const base=await start();const r=await fetch(base+'/api/reviews/'+reviewId+'/response',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({body:'A helpful response from the store.'})});expect(r.status).toBe(401);expect(connect).not.toHaveBeenCalled();});
 it('accepts one response only for an authorized store member and a published review',async()=>{
  clientQuery.mockResolvedValueOnce({rowCount:null,rows:[]}).mockResolvedValueOnce({rowCount:1,rows:[{storeId:'33333333-3333-4333-8333-333333333333'}]}).mockResolvedValueOnce({rowCount:1,rows:[{id:'44444444-4444-4444-8444-444444444444',status:'pending_moderation'}]}).mockResolvedValueOnce({rowCount:1,rows:[]}).mockResolvedValueOnce({rowCount:null,rows:[]});
  const base=await start();const r=await fetch(base+'/api/reviews/'+reviewId+'/response',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({body:'Thank you for sharing your experience.'})});
  expect(r.status).toBe(201);expect(await r.json()).toMatchObject({success:true,response:{status:'pending_moderation'}});
  expect(String(clientQuery.mock.calls[1][0])).toContain("r.status='published'");expect(String(clientQuery.mock.calls[1][0])).toContain('store_members');
  expect(String(clientQuery.mock.calls[2][0])).toContain('ON CONFLICT (review_id) DO NOTHING');expect(String(clientQuery.mock.calls[3][0])).toContain('review.store_response_submitted');expect(clientQuery).toHaveBeenCalledWith('COMMIT');
 });
 it('denies a user who is not an active member of the review store',async()=>{
  clientQuery.mockResolvedValueOnce({rowCount:null,rows:[]}).mockResolvedValueOnce({rowCount:0,rows:[]}).mockResolvedValueOnce({rowCount:null,rows:[]});
  const base=await start();const r=await fetch(base+'/api/reviews/'+reviewId+'/response',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({body:'A helpful response from the store.'})});
  expect(r.status).toBe(404);expect(clientQuery).toHaveBeenCalledWith('ROLLBACK');expect(clientQuery).not.toHaveBeenCalledWith(expect.stringContaining('INSERT INTO verified_product_review_responses'),expect.anything());
 });
 it('prevents duplicate responses to the same review',async()=>{
  clientQuery.mockResolvedValueOnce({rowCount:null,rows:[]}).mockResolvedValueOnce({rowCount:1,rows:[{storeId:'33333333-3333-4333-8333-333333333333'}]}).mockResolvedValueOnce({rowCount:0,rows:[]}).mockResolvedValueOnce({rowCount:null,rows:[]});
  const base=await start();const r=await fetch(base+'/api/reviews/'+reviewId+'/response',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({body:'A second response should be blocked.'})});
  expect(r.status).toBe(409);expect(await r.json()).toMatchObject({success:false});expect(clientQuery).toHaveBeenCalledWith('ROLLBACK');
 });
 it('records a moderator approval and audit event transactionally',async()=>{
  clientQuery.mockResolvedValueOnce({rowCount:null,rows:[]}).mockResolvedValueOnce({rowCount:1,rows:[{id:'44444444-4444-4444-8444-444444444444',reviewId,status:'pending_moderation'}]}).mockResolvedValueOnce({rowCount:1,rows:[{id:'44444444-4444-4444-8444-444444444444',reviewId,status:'published'}]}).mockResolvedValueOnce({rowCount:1,rows:[]}).mockResolvedValueOnce({rowCount:null,rows:[]});
  const base=await start();const id='44444444-4444-4444-8444-444444444444';const r=await fetch(base+'/api/platform/review-responses/'+id,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:'published',note:'Approved after review'})});
  expect(r.status).toBe(200);expect(await r.json()).toMatchObject({success:true,response:{status:'published'}});expect(String(clientQuery.mock.calls[2][0])).toContain('moderated_by=$3');expect(clientQuery.mock.calls[3][1][1]).toBe('review.store_response.published');expect(clientQuery).toHaveBeenCalledWith('COMMIT');
 });
 it('restricts response moderation to platform moderators',async()=>{query.mockResolvedValueOnce({rowCount:0,rows:[]});const base=await start();const r=await fetch(base+'/api/platform/review-responses');expect(r.status).toBe(200);expect(await r.json()).toMatchObject({success:true,responses:[]});expect(authorizePlatformPermission).toHaveBeenCalledWith(expect.anything(),expect.anything(),'platform.reports.manage');});
});