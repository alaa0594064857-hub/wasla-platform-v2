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
const product="55555555-5555-4555-8555-555555555555",buyer="11111111-1111-4111-8111-111111111111",order="22222222-2222-4222-8222-222222222222",store="33333333-3333-4333-8333-333333333333",requestId="44444444-4444-4444-8444-444444444444";
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
  clientQuery.mockResolvedValueOnce({rowCount:null,rows:[]}).mockResolvedValueOnce({rowCount:1,rows:[{orderStatus:"completed",buyerId:buyer,storeId:store,items:[{productId:product,title:"Test item",sku:null,unitPrice:"10.00",currency:"USD",quantity:2}]}]}).mockResolvedValueOnce({rowCount:0,rows:[]}).mockResolvedValueOnce({rowCount:1,rows:[{id:requestId,status:"submitted",requestedResolution:"return",returnItems:[{productId:"33333333-3333-4333-8333-333333333333",quantity:1}]}]}).mockResolvedValueOnce({rowCount:null,rows:[]}).mockResolvedValueOnce({rowCount:null,rows:[]});
  const base=await start();const r=await fetch(base+path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({resolution:"return",reason:"damaged_or_defective",details:"The item arrived with a broken outer casing.",items:[{productId:product,quantity:1}]})});
  expect(r.status).toBe(201);expect(await r.json()).toMatchObject({success:true,returnRequest:{id:requestId,status:"submitted"}});
  expect(String(clientQuery.mock.calls[3][0])).toContain("INSERT INTO member_store_return_requests");
  expect(clientQuery.mock.calls[3][1][6]).toContain('"quantity":1');
  expect(clientQuery.mock.calls.some(c=>String(c[0]).toLowerCase().includes("refund")||String(c[0]).toLowerCase().includes("payment"))).toBe(false);
 });
 it("prevents a second active request for the same order",async()=>{
  clientQuery.mockResolvedValueOnce({rowCount:null,rows:[]}).mockResolvedValueOnce({rowCount:1,rows:[{orderStatus:"shipped",buyerId:buyer,storeId:store,items:[{productId:product,title:"Test item",sku:null,unitPrice:"10.00",currency:"USD",quantity:2}]}]}).mockResolvedValueOnce({rowCount:1,rows:[{id:requestId,status:"submitted"}]}).mockResolvedValueOnce({rowCount:null,rows:[]});
  const base=await start();const r=await fetch(base+path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({resolution:"replacement",reason:"wrong_item",details:"The delivered item is a different model.",items:[{productId:product,quantity:1}]})});
  expect(r.status).toBe(409);expect(String(clientQuery.mock.calls[2][0])).toContain("item_received_at IS NOT NULL");expect(String(clientQuery.mock.calls[3][0])).toBe("ROLLBACK");
 });
 it("rejects a return quantity greater than the ordered quantity",async()=>{
  clientQuery.mockResolvedValueOnce({rowCount:null,rows:[]})
   .mockResolvedValueOnce({rowCount:1,rows:[{orderStatus:"completed",buyerId:buyer,storeId:store,items:[{productId:product,title:"Test item",sku:null,unitPrice:"10.00",currency:"USD",quantity:2}]}]})
   .mockResolvedValueOnce({rowCount:null,rows:[]});
  const base=await start();
  const response=await fetch(base+path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({resolution:"return",reason:"other",details:"I need to return this item.",items:[{productId:product,quantity:3}]})});
  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({success:false,error:"Return quantity cannot exceed the quantity in the order"});
  expect(String(clientQuery.mock.calls[2][0])).toBe("ROLLBACK");
 });
 it("blocks a return disabled by the order-time policy snapshot",async()=>{
  clientQuery.mockResolvedValueOnce({rowCount:null,rows:[]}).mockResolvedValueOnce({rowCount:1,rows:[{orderStatus:"completed",buyerId:buyer,storeId:store,items:[{productId:product,title:"Test item",sku:null,unitPrice:"10.00",currency:"USD",quantity:2}],orderCreatedAt:new Date(),returnPolicySnapshot:{status:"published",acceptsReturns:false,acceptsExchanges:true,requestWindowDays:30}}]}).mockResolvedValueOnce({rowCount:null,rows:[]});
  const base=await start();const r=await fetch(base+path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({resolution:"return",reason:"other",details:"I would like to return this item.",items:[{productId:product,quantity:1}]})});
  expect(r.status).toBe(409);expect(String(clientQuery.mock.calls[2][0])).toBe("ROLLBACK");
 });
 it("blocks expired requests but allows a legal-rights claim to be reviewed",async()=>{
  const oldDate=new Date(Date.now()-40*86400000);
  clientQuery.mockResolvedValueOnce({rowCount:null,rows:[]}).mockResolvedValueOnce({rowCount:1,rows:[{orderStatus:"completed",buyerId:buyer,storeId:store,items:[{productId:product,title:"Test item",sku:null,unitPrice:"10.00",currency:"USD",quantity:2}],orderCreatedAt:oldDate,returnPolicySnapshot:{status:"published",acceptsReturns:true,acceptsExchanges:false,requestWindowDays:30}}]}).mockResolvedValueOnce({rowCount:null,rows:[]});
  const base=await start();const expired=await fetch(base+path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({resolution:"return",reason:"other",details:"I would like to return this item.",items:[{productId:product,quantity:1}]})});
  expect(expired.status).toBe(409);
  clientQuery.mockReset();
  clientQuery.mockResolvedValueOnce({rowCount:null,rows:[]}).mockResolvedValueOnce({rowCount:1,rows:[{orderStatus:"completed",buyerId:buyer,storeId:store,items:[{productId:product,title:"Test item",sku:null,unitPrice:"10.00",currency:"USD",quantity:2}],orderCreatedAt:oldDate,returnPolicySnapshot:{status:"published",acceptsReturns:true,acceptsExchanges:false,requestWindowDays:30}}]}).mockResolvedValueOnce({rowCount:0,rows:[]}).mockResolvedValueOnce({rowCount:1,rows:[{id:requestId,status:"submitted",requestedResolution:"return",returnItems:[{productId:"33333333-3333-4333-8333-333333333333",quantity:2},{productId:"44444444-4444-4444-8444-444444444444",quantity:1}]}]}).mockResolvedValueOnce({rowCount:null,rows:[]}).mockResolvedValueOnce({rowCount:null,rows:[]});
  const claim=await fetch(base+path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({resolution:"return",reason:"legal_rights_claim",details:"I believe mandatory consumer rights apply to this order.",items:[{productId:product,quantity:1}]})});
  expect(claim.status).toBe(201);
 });
 it("rejects invalid reason or resolution before opening a database transaction",async()=>{
  const base=await start();const r=await fetch(base+path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({resolution:"cash_refund",reason:"other",details:"The item is not what I expected."})});
  expect(r.status).toBe(400);expect(connect).not.toHaveBeenCalled();
 });

 it("allows an authorized merchant to confirm receipt of an approved physical return",async()=>{
  const merchant="55555555-5555-4555-8555-555555555555";
  vi.mocked(auth.api.getSession).mockResolvedValueOnce({user:{id:merchant}} as never);
  clientQuery.mockResolvedValueOnce({rowCount:null,rows:[]})
   .mockResolvedValueOnce({rowCount:1,rows:[{orderStatus:"completed",buyerId:buyer,storeId:store,items:[{productId:product,title:"Test item",sku:null,unitPrice:"10.00",currency:"USD",quantity:2}]}]})
   .mockResolvedValueOnce({rowCount:1,rows:[{id:requestId,status:"approved",buyerId:buyer,storeId:store,requestedResolution:"return"}]})
   .mockResolvedValueOnce({rowCount:1,rows:[{}]})
   .mockResolvedValueOnce({rowCount:1,rows:[{id:requestId,status:"item_received"}]})
   .mockResolvedValueOnce({rowCount:1,rows:[]})
   .mockResolvedValueOnce({rowCount:null,rows:[]});
  const base=await start();
  const response=await fetch(base+path+"/received",{method:"PATCH",headers:{"Content-Type":"application/json"},body:"{}"});
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({success:true,returnRequest:{id:requestId,status:"item_received"}});
  expect(String(clientQuery.mock.calls[2][0])).toContain('requested_resolution AS "requestedResolution"');
  expect(String(clientQuery.mock.calls[4][0])).toContain("status='item_received'");
  expect(clientQuery.mock.calls.some(call=>String(call[0]).includes("UPDATE store_products"))).toBe(false);
 });
 it("restocks received returned items only when the merchant explicitly opts in",async()=>{
  const merchant="55555555-5555-4555-8555-555555555555";
  vi.mocked(auth.api.getSession).mockResolvedValueOnce({user:{id:merchant}} as never);
  clientQuery.mockResolvedValueOnce({rowCount:null,rows:[]})
   .mockResolvedValueOnce({rowCount:1,rows:[{orderStatus:"completed",buyerId:buyer,storeId:store,inventoryCommittedAt:new Date(),items:[{productId:"33333333-3333-4333-8333-333333333333",quantity:2},{productId:"44444444-4444-4444-8444-444444444444",quantity:1}]}]})
   .mockResolvedValueOnce({rowCount:1,rows:[{id:requestId,status:"approved",buyerId:buyer,storeId:store,requestedResolution:"return",returnItems:[{productId:"33333333-3333-4333-8333-333333333333",quantity:1}]}]})
   .mockResolvedValueOnce({rowCount:1,rows:[{}]})
   .mockResolvedValueOnce({rowCount:1,rows:[{id:"33333333-3333-4333-8333-333333333333"}]})
   .mockResolvedValueOnce({rowCount:1,rows:[{id:requestId,status:"item_received",restockedAt:new Date()}]})
   .mockResolvedValueOnce({rowCount:1,rows:[]})
   .mockResolvedValueOnce({rowCount:null,rows:[]});
  const base=await start();
  const response=await fetch(base+path+"/received",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({restock:true})});
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({success:true,returnRequest:{id:requestId,status:"item_received"}});
  const restockCall=clientQuery.mock.calls[4];
  expect(String(restockCall[0])).toContain("stock_quantity=stock_quantity+$3");
  expect(restockCall[1]).toEqual(["33333333-3333-4333-8333-333333333333",store,1]);
  expect(String(clientQuery.mock.calls[5][0])).toContain("restocked_at=CASE WHEN $2 THEN NOW()");
  expect(clientQuery.mock.calls[5][1]).toEqual([requestId,true]);
  expect(clientQuery.mock.calls[6][1][3]).toContain('"restocked":true');
  expect(clientQuery.mock.calls[6][1][3]).toContain('"restockedItems":[{"productId":"33333333-3333-4333-8333-333333333333","quantity":1}]');
 });
 it("does not restock legacy orders without a recorded inventory commitment",async()=>{
  const merchant="55555555-5555-4555-8555-555555555555";
  vi.mocked(auth.api.getSession).mockResolvedValueOnce({user:{id:merchant}} as never);
  clientQuery.mockResolvedValueOnce({rowCount:null,rows:[]})
   .mockResolvedValueOnce({rowCount:1,rows:[{orderStatus:"completed",buyerId:buyer,storeId:store,inventoryCommittedAt:null,items:[{productId:"33333333-3333-4333-8333-333333333333",quantity:2}]}]})
   .mockResolvedValueOnce({rowCount:1,rows:[{id:requestId,status:"approved",buyerId:buyer,storeId:store,requestedResolution:"return"}]})
   .mockResolvedValueOnce({rowCount:1,rows:[{}]})
   .mockResolvedValueOnce({rowCount:null,rows:[]});
  const base=await start();
  const response=await fetch(base+path+"/received",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({restock:true})});
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({success:false,error:"This legacy order has no recorded inventory commitment and cannot be restocked automatically"});
  expect(clientQuery.mock.calls.some(call=>String(call[0]).includes("UPDATE store_products"))).toBe(false);
  expect(String(clientQuery.mock.calls[4][0])).toBe("ROLLBACK");
 });
 it("rolls back return receipt if any returned product cannot be restocked",async()=>{
  const merchant="55555555-5555-4555-8555-555555555555";
  vi.mocked(auth.api.getSession).mockResolvedValueOnce({user:{id:merchant}} as never);
  clientQuery.mockResolvedValueOnce({rowCount:null,rows:[]})
   .mockResolvedValueOnce({rowCount:1,rows:[{orderStatus:"completed",buyerId:buyer,storeId:store,inventoryCommittedAt:new Date(),items:[
    {productId:"33333333-3333-4333-8333-333333333333",quantity:2},
    {productId:"44444444-4444-4444-8444-444444444444",quantity:1}
   ]}]})
   .mockResolvedValueOnce({rowCount:1,rows:[{id:requestId,status:"approved",buyerId:buyer,storeId:store,requestedResolution:"return",returnItems:[{productId:"33333333-3333-4333-8333-333333333333",quantity:2},{productId:"44444444-4444-4444-8444-444444444444",quantity:1}]}]})
   .mockResolvedValueOnce({rowCount:1,rows:[{}]})
   .mockResolvedValueOnce({rowCount:1,rows:[{id:"33333333-3333-4333-8333-333333333333"}]})
   .mockResolvedValueOnce({rowCount:0,rows:[]})
   .mockResolvedValueOnce({rowCount:null,rows:[]});
  const base=await start();
  const response=await fetch(base+path+"/received",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({restock:true})});
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({success:false,error:"Could not restock a returned item. Contact platform support."});
  expect(clientQuery.mock.calls[4][1]).toEqual(["33333333-3333-4333-8333-333333333333",store,2]);
  expect(clientQuery.mock.calls[5][1]).toEqual(["44444444-4444-4444-8444-444444444444",store,1]);
  expect(String(clientQuery.mock.calls[6][0])).toBe("ROLLBACK");
  expect(clientQuery.mock.calls.some(call=>String(call[0]).includes("SET status='item_received'"))).toBe(false);
 });
 it("allows a legal-rights claim to be submitted for support review even when the store policy disables returns",async()=>{
  clientQuery.mockResolvedValueOnce({rowCount:null,rows:[]})
   .mockResolvedValueOnce({rowCount:1,rows:[{orderStatus:"completed",buyerId:buyer,storeId:store,items:[{productId:product,title:"Test item",sku:null,unitPrice:"10.00",currency:"USD",quantity:2}],orderCreatedAt:new Date(),returnPolicySnapshot:{status:"published",acceptsReturns:false,acceptsExchanges:false,requestWindowDays:14}}]})
   .mockResolvedValueOnce({rowCount:0,rows:[]})
   .mockResolvedValueOnce({rowCount:1,rows:[{id:requestId,status:"submitted",requestedResolution:"return"}]})
   .mockResolvedValueOnce({rowCount:null,rows:[]})
   .mockResolvedValueOnce({rowCount:null,rows:[]});
  const base=await start();
  const response=await fetch(base+path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({resolution:"return",reason:"legal_rights_claim",details:"I believe mandatory consumer rights apply to this order.",items:[{productId:product,quantity:1}]})});
  expect(response.status).toBe(201);
  expect(String(clientQuery.mock.calls[3][0])).toContain("INSERT INTO member_store_return_requests");
 });

 it("denies an unauthorized user access to the platform return queue before reading requests",async()=>{
  vi.mocked(authorizePlatformPermission).mockImplementationOnce(async(_request,response)=>{
   response.writeHead(403,{"Content-Type":"application/json"});
   response.end(JSON.stringify({success:false,error:"Insufficient platform permissions"}));
   return null;
  });
  const base=await start();
  const response=await fetch(base+"/api/platform/store-returns");
  expect(response.status).toBe(403);
  expect(await response.json()).toEqual({success:false,error:"Insufficient platform permissions"});
  expect(authorizePlatformPermission).toHaveBeenCalledWith(expect.anything(),expect.anything(),"platform.reports.manage");
  expect(query).not.toHaveBeenCalled();
  expect(connect).not.toHaveBeenCalled();
 });

 it("requires authentication for buyer return escalation before opening the database",async()=>{
  vi.mocked(auth.api.getSession).mockResolvedValueOnce(null as never);
  const base=await start();
  const response=await fetch(base+path+"/escalation",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({reason:"dispute",details:"I need help resolving this return request."})});
  expect(response.status).toBe(401);
  expect(await response.json()).toMatchObject({success:false,error:"Authentication required"});
  expect(connect).not.toHaveBeenCalled();
  expect(query).not.toHaveBeenCalled();
 });



  it("denies a merchant return decision without active order-management permission",async()=>{
   clientQuery.mockResolvedValueOnce({rowCount:null,rows:[]})
    .mockResolvedValueOnce({rowCount:1,rows:[{orderStatus:"completed",buyerId:buyer,storeId:store}]})
    .mockResolvedValueOnce({rowCount:1,rows:[{id:requestId,status:"submitted",buyerId:buyer,storeId:store,requestedResolution:"return"}]})
    .mockResolvedValueOnce({rowCount:0,rows:[]})
    .mockResolvedValueOnce({rowCount:null,rows:[]});
   const base=await start();
   const response=await fetch(base+path+"/response",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({decision:"approved",note:"We have reviewed the return request."})});
   expect(response.status).toBe(403);
   expect(await response.json()).toMatchObject({success:false,error:"Store order management permission required"});
   expect(String(clientQuery.mock.calls[3][0])).toContain("store.order.manage");
   expect(String(clientQuery.mock.calls[4][0])).toBe("ROLLBACK");
   expect(clientQuery.mock.calls.some(call=>String(call[0]).startsWith("UPDATE member_store_return_requests"))).toBe(false);
  });

  it("allows only the buyer recorded on the return request to close it",async()=>{
   const otherBuyer="77777777-7777-4777-8777-777777777777";
   clientQuery.mockResolvedValueOnce({rowCount:null,rows:[]})
    .mockResolvedValueOnce({rowCount:1,rows:[{orderStatus:"completed",buyerId:buyer,storeId:store}]})
    .mockResolvedValueOnce({rowCount:1,rows:[{id:requestId,status:"rejected",buyerId:otherBuyer,storeId:store,requestedResolution:"return"}]})
    .mockResolvedValueOnce({rowCount:null,rows:[]});
   const base=await start();
   const response=await fetch(base+path+"/close",{method:"PATCH",headers:{"Content-Type":"application/json"},body:"{}"});
   expect(response.status).toBe(403);
   expect(await response.json()).toMatchObject({success:false,error:"Only the buyer can close this request"});
   expect(String(clientQuery.mock.calls[3][0])).toBe("ROLLBACK");
   expect(clientQuery.mock.calls.some(call=>String(call[0]).startsWith("UPDATE member_store_return_requests"))).toBe(false);
  });

  it("denies a merchant from confirming a returned item without order-management permission",async()=>{
   const merchant="55555555-5555-4555-8555-555555555555";
   vi.mocked(auth.api.getSession).mockResolvedValueOnce({user:{id:merchant}} as never);
   clientQuery.mockResolvedValueOnce({rowCount:null,rows:[]})
    .mockResolvedValueOnce({rowCount:1,rows:[{orderStatus:"completed",buyerId:buyer,storeId:store,inventoryCommittedAt:new Date()}]})
    .mockResolvedValueOnce({rowCount:1,rows:[{id:requestId,status:"approved",buyerId:buyer,storeId:store,requestedResolution:"return",returnItems:[{productId:product,quantity:1}]}]})
    .mockResolvedValueOnce({rowCount:0,rows:[]})
    .mockResolvedValueOnce({rowCount:null,rows:[]});
   const base=await start();
   const response=await fetch(base+path+"/received",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({restock:true})});
   expect(response.status).toBe(403);
   expect(await response.json()).toMatchObject({success:false,error:"Store order management permission required"});
   expect(clientQuery.mock.calls.some(call=>String(call[0]).includes("UPDATE store_products"))).toBe(false);
   expect(String(clientQuery.mock.calls[4][0])).toBe("ROLLBACK");
  });

});
