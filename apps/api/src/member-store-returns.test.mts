import { afterEach,beforeEach,describe,expect,it,vi } from "vitest";
import type { Server } from "node:http";
import { createWaslaServer } from "./server.js";
import { auth } from "./auth.mjs";
import { authorizePlatformPermission } from "./platform-security.mjs";
import { getDatabasePool } from "./database.js";
vi.mock("./auth.mjs",()=>({auth:{api:{getSession:vi.fn()}}}));
vi.mock("./platform-security.mjs",()=>({authorizePlatformPermission:vi.fn()}));
vi.mock("./database.js",()=>({getDatabasePool:vi.fn()}));
let server:Server|undefined;
const query=vi.fn(),clientQuery=vi.fn(),release=vi.fn(),connect=vi.fn();
const buyer="11111111-1111-4111-8111-111111111111",order="22222222-2222-4222-8222-222222222222",store="33333333-3333-4333-8333-333333333333",requestId="44444444-4444-4444-8444-444444444444";
beforeEach(()=>{
 vi.mocked(auth.api.getSession).mockResolvedValue({user:{id:buyer}} as never);
 vi.mocked(authorizePlatformPermission).mockResolvedValue({userId:buyer,roleNames:["platform_admin"],permissions:["platform.reports.manage"]} as never);
 query.mockReset();clientQuery.mockReset();release.mockReset();connect.mockReset();
 connect.mockResolvedValue({query:clientQuery,release});
 vi.mocked(getDatabasePool).mockReturnValue({query,connect} as never);
});
afterEach(async()=>{if(server?.listening)await new Promise<void>((resolve,reject)=>server!.close(e=>e?reject(e):resolve()));server=undefined;vi.clearAllMocks();});
async function start(){server=createWaslaServer();await new Promise<void>((resolve,reject)=>{server!.once("error",reject);server!.listen(0,"127.0.0.1",resolve);});const a=server.address();if(!a||typeof a==="string")throw new Error("No test address");return "http://127.0.0.1:"+a.port;}
const path="/api/stores/demo/orders/"+order+"/return";
describe("member store returns and exchanges",()=>{
 it("requires authentication",async()=>{vi.mocked(auth.api.getSession).mockResolvedValueOnce(null as never);const base=await start();const r=await fetch(base+path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({resolution:"return",reason:"other",details:"The product is not suitable for the intended use."})});expect(r.status).toBe(401);expect(connect).not.toHaveBeenCalled();});
 it("creates a buyer return request without initiating payment actions",async()=>{
  clientQuery.mockResolvedValueOnce({rowCount:null,rows:[]}).mockResolvedValueOnce({rowCount:1,rows:[{orderStatus:"completed",buyerId:buyer,storeId:store}]}).mockResolvedValueOnce({rowCount:0,rows:[]}).mockResolvedValueOnce({rowCount:1,rows:[{id:requestId,status:"submitted",requestedResolution:"return"}]}).mockResolvedValueOnce({rowCount:null,rows:[]}).mockResolvedValueOnce({rowCount:null,rows:[]});
  const base=await start();const r=await fetch(base+path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({resolution:"return",reason:"damaged_or_defective",details:"The item arrived with a broken outer casing."})});
  expect(r.status).toBe(201);expect(await r.json()).toMatchObject({success:true,returnRequest:{id:requestId,status:"submitted"}});
  expect(String(clientQuery.mock.calls[3][0])).toContain("INSERT INTO member_store_return_requests");
  expect(clientQuery.mock.calls.some(c=>String(c[0]).toLowerCase().includes("refund")||String(c[0]).toLowerCase().includes("payment"))).toBe(false);
 });
 it("prevents a second active request for the same order",async()=>{
  clientQuery.mockResolvedValueOnce({rowCount:null,rows:[]}).mockResolvedValueOnce({rowCount:1,rows:[{orderStatus:"shipped",buyerId:buyer,storeId:store}]}).mockResolvedValueOnce({rowCount:1,rows:[{id:requestId,status:"submitted"}]}).mockResolvedValueOnce({rowCount:null,rows:[]});
  const base=await start();const r=await fetch(base+path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({resolution:"replacement",reason:"wrong_item",details:"The delivered item is a different model."})});
  expect(r.status).toBe(409);expect(String(clientQuery.mock.calls[3][0])).toBe("ROLLBACK");
 });
 it("blocks a return disabled by the order-time policy snapshot",async()=>{
  clientQuery.mockResolvedValueOnce({rowCount:null,rows:[]}).mockResolvedValueOnce({rowCount:1,rows:[{orderStatus:"completed",buyerId:buyer,storeId:store,orderCreatedAt:new Date(),returnPolicySnapshot:{status:"published",acceptsReturns:false,acceptsExchanges:true,requestWindowDays:30}}]}).mockResolvedValueOnce({rowCount:null,rows:[]});
  const base=await start();const r=await fetch(base+path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({resolution:"return",reason:"other",details:"I would like to return this item."})});
  expect(r.status).toBe(409);expect(String(clientQuery.mock.calls[2][0])).toBe("ROLLBACK");
 });
 it("blocks expired requests but allows a legal-rights claim to be reviewed",async()=>{
  const oldDate=new Date(Date.now()-40*86400000);
  clientQuery.mockResolvedValueOnce({rowCount:null,rows:[]}).mockResolvedValueOnce({rowCount:1,rows:[{orderStatus:"completed",buyerId:buyer,storeId:store,orderCreatedAt:oldDate,returnPolicySnapshot:{status:"published",acceptsReturns:true,acceptsExchanges:false,requestWindowDays:30}}]}).mockResolvedValueOnce({rowCount:null,rows:[]});
  const base=await start();const expired=await fetch(base+path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({resolution:"return",reason:"other",details:"I would like to return this item."})});
  expect(expired.status).toBe(409);
  clientQuery.mockReset();
  clientQuery.mockResolvedValueOnce({rowCount:null,rows:[]}).mockResolvedValueOnce({rowCount:1,rows:[{orderStatus:"completed",buyerId:buyer,storeId:store,orderCreatedAt:oldDate,returnPolicySnapshot:{status:"published",acceptsReturns:true,acceptsExchanges:false,requestWindowDays:30}}]}).mockResolvedValueOnce({rowCount:0,rows:[]}).mockResolvedValueOnce({rowCount:1,rows:[{id:requestId,status:"submitted",requestedResolution:"return"}]}).mockResolvedValueOnce({rowCount:null,rows:[]}).mockResolvedValueOnce({rowCount:null,rows:[]});
  const claim=await fetch(base+path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({resolution:"return",reason:"legal_rights_claim",details:"I believe mandatory consumer rights apply to this order."})});
  expect(claim.status).toBe(201);
 });
 it("rejects invalid reason or resolution before opening a database transaction",async()=>{
  const base=await start();const r=await fetch(base+path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({resolution:"cash_refund",reason:"other",details:"The item is not what I expected."})});
  expect(r.status).toBe(400);expect(connect).not.toHaveBeenCalled();
 });
});
