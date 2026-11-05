"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useLocale } from "../../../components/locale-provider";
import WorkspaceHeader from "../../../components/workspace-header";

type Store = { id: string; name: string; slug: string; status: string; account_name: string; business_description: string | null; website: string | null; country_code: string | null };
type Product = { id: string; title: string; description: string | null; sku: string | null; price: string; currency: string; stockQuantity: number; imageUrl: string | null; videoUrl: string | null; status: "draft" | "active" | "archived" };
type Movement = { id: string; productId: string; movementType: "inbound" | "outbound" | "adjustment"; quantityDelta: number; quantityBefore: number; quantityAfter: number; reason: string; referenceCode: string | null; createdAt: string };
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";
const labels = {
  ar: { title:"إدارة المتجر", subtitle:"هذه مساحة إدارة متجرك المرتبط بحسابك التجاري.", home:"الرئيسية", shops:"متاجري", name:"اسم المتجر", save:"حفظ التغييرات", saving:"جارٍ الحفظ...", account:"الحساب التجاري", address:"معرّف المتجر", loading:"جارٍ تحميل بيانات المتجر...", error:"تعذر تحميل المتجر أو لا تملك صلاحية الوصول.", saved:"تم حفظ التغييرات.", back:"العودة إلى المتاجر", status:"حالة المتجر", active:"نشط", products:"المنتجات", addProduct:"إضافة منتج", productName:"اسم المنتج", description:"الوصف", sku:"رمز المنتج (اختياري)", price:"السعر", currency:"العملة", stock:"الكمية في المخزون", imageUrl:"رابط صورة المنتج (HTTPS)", videoUrl:"رابط فيديو المنتج (HTTPS)", add:"إضافة المنتج", adding:"جارٍ الإضافة...", noProducts:"لا توجد منتجات بعد. أضف أول منتج.", draft:"مسودة", published:"منشور", archived:"مؤرشف", saveProduct:"حفظ", savedProduct:"تم تحديث المنتج.", inventory:"إدارة المخزون", showInventory:"إدارة الحركات", hideInventory:"إخفاء الحركات", movementType:"نوع الحركة", inbound:"إضافة كمية", outbound:"صرف كمية", adjustment:"تسوية (+/-)", quantity:"الكمية / التغيير", reason:"السبب", reference:"رقم مرجعي (اختياري)", recordMovement:"تسجيل الحركة", recording:"جارٍ التسجيل...", history:"سجل الحركات", noMovements:"لا توجد حركات مسجلة لهذا المنتج.", before:"قبل", after:"بعد", date:"التاريخ", movementSaved:"تم تسجيل حركة المخزون.", movementError:"تعذر تسجيل حركة المخزون.", loadMovements:"تعذر تحميل سجل الحركات.", opening:"رصيد افتتاحي", signedHint:"في التسوية استخدم رقماً موجباً للزيادة وسالباً للنقص." },
  en: { title:"Shop management", subtitle:"Manage your shop connected to your business account.", home:"Home", shops:"My shops", name:"Shop name", save:"Save changes", saving:"Saving...", account:"Business account", address:"Shop identifier", loading:"Loading shop details...", error:"Could not load this shop or you do not have access.", saved:"Changes saved.", back:"Back to shops", status:"Shop status", active:"Active", products:"Products", addProduct:"Add a product", productName:"Product name", description:"Description", sku:"SKU (optional)", price:"Price", currency:"Currency", stock:"Stock quantity", imageUrl:"Product image URL (HTTPS)", videoUrl:"Product video URL (HTTPS)", add:"Add product", adding:"Adding...", noProducts:"No products yet. Add your first product.", draft:"Draft", published:"Published", archived:"Archived", saveProduct:"Save", savedProduct:"Product updated.", inventory:"Inventory management", showInventory:"Manage movements", hideInventory:"Hide movements", movementType:"Movement type", inbound:"Add stock", outbound:"Remove stock", adjustment:"Adjustment (+/-)", quantity:"Quantity / change", reason:"Reason", reference:"Reference code (optional)", recordMovement:"Record movement", recording:"Recording...", history:"Movement history", noMovements:"No movements recorded for this product.", before:"Before", after:"After", date:"Date", movementSaved:"Inventory movement recorded.", movementError:"Could not record the inventory movement.", loadMovements:"Could not load movement history.", opening:"Opening balance", signedHint:"For adjustments, use a positive number to add or a negative number to subtract." },
};
async function api<T>(slug:string, options?:RequestInit, suffix=""):Promise<T>{
 const response=await fetch(`${API_BASE}/api/stores/${encodeURIComponent(slug)}${suffix}`,{...options,credentials:"include",headers:{"Content-Type":"application/json",...options?.headers}});
 const data=await response.json(); if(!response.ok||data.success!==true) throw new Error(data.error||"Request failed"); return data as T;
}
export default function ShopManagementPage(){
 const params=useParams<{slug:string}>(); const slug=params.slug;
 const { locale } = useLocale(); const [store,setStore]=useState<Store|null>(null);
 const [name,setName]=useState(""); const [loading,setLoading]=useState(true); const [saving,setSaving]=useState(false); const [error,setError]=useState(""); const [message,setMessage]=useState("");
 const [products,setProducts]=useState<Product[]>([]); const [addingProduct,setAddingProduct]=useState(false);
 const [productForm,setProductForm]=useState({title:"",description:"",sku:"",price:"",currency:"USD",stockQuantity:"0",imageUrl:"",videoUrl:""});
 const [expandedInventoryId,setExpandedInventoryId]=useState<string|null>(null);
 const [movements,setMovements]=useState<Record<string,Movement[]>>({});
 const [movementLoading,setMovementLoading]=useState(false);
 const [movementSaving,setMovementSaving]=useState(false);
 const [movementForm,setMovementForm]=useState({movementType:"inbound" as Movement["movementType"],quantity:"",reason:"",referenceCode:""});
 const t=labels[locale]; const dir=locale==="ar"?"rtl":"ltr";
 const load=useCallback(async()=>{setLoading(true);setError("");try{const result=await api<{store:Store}>(slug);setStore(result.store);setName(result.store.name);const catalog=await api<{products:Product[]}>(slug,undefined,"/products");setProducts(catalog.products);}catch{setError(t.error);}finally{setLoading(false);}},[slug,t.error]);
 useEffect(()=>{void load();},[load]);
 async function save(event:FormEvent<HTMLFormElement>){event.preventDefault();setSaving(true);setError("");setMessage("");try{const result=await api<{store:Store}>(slug,{method:"PATCH",body:JSON.stringify({name:name.trim()})});setStore(result.store);setName(result.store.name);setMessage(t.saved);}catch{setError(t.error);}finally{setSaving(false);}}
 async function addProduct(event:FormEvent<HTMLFormElement>){
  event.preventDefault();setAddingProduct(true);setError("");setMessage("");
  try{
   const result=await api<{product:Product}>(slug,{method:"POST",body:JSON.stringify({
    ...productForm,price:productForm.price,stockQuantity:Number(productForm.stockQuantity),
    imageUrl:productForm.imageUrl.trim()||null,videoUrl:productForm.videoUrl.trim()||null,status:"draft"
   })},"/products");
   setProducts(current=>[result.product,...current]);
   setProductForm({title:"",description:"",sku:"",price:"",currency:"USD",stockQuantity:"0",imageUrl:"",videoUrl:""});
   setMessage(t.savedProduct);
  }catch(cause){setError(cause instanceof Error?cause.message:t.error);}
  finally{setAddingProduct(false);}
 }
 async function toggleInventory(product:Product){
  if(expandedInventoryId===product.id){setExpandedInventoryId(null);return;}
  setExpandedInventoryId(product.id);setMovementLoading(true);setError("");
  try{
   const result=await api<{movements:Movement[]}>(slug,undefined,`/products/${product.id}/inventory-movements`);
   setMovements(current=>({...current,[product.id]:result.movements}));
  }catch(cause){setError(cause instanceof Error?cause.message:t.loadMovements);}
  finally{setMovementLoading(false);}
 }
 async function recordMovement(event:FormEvent<HTMLFormElement>,product:Product){
  event.preventDefault();setMovementSaving(true);setError("");setMessage("");
  const entered=Number(movementForm.quantity);
  const delta=movementForm.movementType==="outbound"?-Math.abs(entered):movementForm.movementType==="inbound"?Math.abs(entered):entered;
  if(!Number.isSafeInteger(delta)||delta===0){setError(t.movementError);setMovementSaving(false);return;}
  try{
   const result=await api<{movement:Movement;stockQuantity:number}>(slug,{method:"POST",body:JSON.stringify({
    movementType:movementForm.movementType,quantityDelta:delta,reason:movementForm.reason.trim(),
    referenceCode:movementForm.referenceCode.trim()||null
   })},`/products/${product.id}/inventory-movements`);
   setProducts(current=>current.map(item=>item.id===product.id?{...item,stockQuantity:result.stockQuantity}:item));
   setMovements(current=>({...current,[product.id]:[result.movement,...(current[product.id]??[])].slice(0,100)}));
   setMovementForm({movementType:"inbound",quantity:"",reason:"",referenceCode:""});
   setMessage(t.movementSaved);
  }catch(cause){setError(cause instanceof Error?cause.message:t.movementError);}
  finally{setMovementSaving(false);}
 }
 async function updateProductStatus(product:Product,status:Product["status"]){
  try{
   const result=await api<{product:Product}>(slug,{method:"PATCH",body:JSON.stringify({status})},`/products/${product.id}`);
   setProducts(current=>current.map(item=>item.id===product.id?result.product:item));
  }catch(cause){setError(cause instanceof Error?cause.message:t.error);}
 }

 return <main className="shops-page" lang={locale} dir={dir}>
  <WorkspaceHeader section="shops" />
 <header className="shops-header" style={{ display: "none" }}><Link href="/" className="shops-brand"><span className="shops-mark">W</span><span>WASLA <small>وصلة</small></span></Link><nav><Link href="/">{t.home}</Link><Link href="/shops">{t.shops}</Link></nav></header>
  <section className="shops-main">
   <div className="shops-heading"><div><span className="shops-eyebrow">{locale === "ar" ? "وصلة للمتاجر / الإدارة" : "WASLA SHOPS / MANAGEMENT"}</span><h1>{t.title}</h1><p>{t.subtitle}</p></div><div className="shops-heading-icon">W</div></div>
   {error&&<div className="shops-alert" role="alert">{error}<button type="button" onClick={()=>void load()}>{locale==="ar"?"إعادة المحاولة":"Try again"}</button></div>}
   {message&&<div className="shops-success" role="status">{message}</div>}
   {loading?<div className="shops-empty">{t.loading}</div>:store&&<div className="shops-detail-layout">
    <section className="shops-create-card">
     <span className="shops-eyebrow">01 / SHOP IDENTITY</span><h2>{store.name}</h2>
     <form onSubmit={save}><label>{t.name}<input value={name} onChange={e=>setName(e.target.value)} minLength={2} maxLength={120} required /></label><button type="submit" disabled={saving||name.trim().length<2}>{saving?t.saving:t.save}<span>↗</span></button></form>
    </section>
    <aside className="shops-create-card shops-info-card">
     <span className="shops-eyebrow">02 / DETAILS</span><h2>{t.status}</h2>
     <div className="shops-info-row"><small>{t.status}</small><strong className="shops-info-status">{store.status==="active"?t.active:store.status}</strong></div>
     <div className="shops-info-row"><small>{t.account}</small><strong>{store.account_name}</strong></div>
     <div className="shops-info-row"><small>{t.address}</small><strong dir="ltr">/shops/{store.slug}</strong></div>
     {store.website&&<div className="shops-info-row"><small>Website</small><strong dir="ltr">{store.website}</strong></div>}
    </aside>
   </div>}

   {store&&<section className="shops-products-area">
    <div className="shops-products-heading"><div><span className="shops-eyebrow">03 / CATALOG MANAGEMENT</span><h2>{t.products}</h2></div><b>{products.length}</b></div>
    <div className="shops-products-layout">
     <form className="shops-create-card shops-product-form" onSubmit={addProduct}>
      <span className="shops-eyebrow">ADD / PRODUCT</span><h3>{t.addProduct}</h3>
      <label>{t.productName}<input required minLength={2} maxLength={180} value={productForm.title} onChange={e=>setProductForm(v=>({...v,title:e.target.value}))}/></label>
      <label>{t.description}<textarea maxLength={5000} rows={3} value={productForm.description} onChange={e=>setProductForm(v=>({...v,description:e.target.value}))}/></label>
      <div className="shops-product-fields">
       <label>{t.price}<input required type="number" min="0" step="0.01" value={productForm.price} onChange={e=>setProductForm(v=>({...v,price:e.target.value}))}/></label>
       <label>{t.currency}<select value={productForm.currency} onChange={e=>setProductForm(v=>({...v,currency:e.target.value}))}><option>USD</option><option>EUR</option><option>TRY</option><option>GBP</option><option>SAR</option><option>AED</option></select></label>
       <label>{t.stock}<input required type="number" min="0" step="1" value={productForm.stockQuantity} onChange={e=>setProductForm(v=>({...v,stockQuantity:e.target.value}))}/></label>
       <label>{t.sku}<input maxLength={80} value={productForm.sku} onChange={e=>setProductForm(v=>({...v,sku:e.target.value}))}/></label>
      </div>
      <label>{t.imageUrl}<input type="url" placeholder="https://..." value={productForm.imageUrl} onChange={e=>setProductForm(v=>({...v,imageUrl:e.target.value}))}/></label>
      <label>{t.videoUrl}<input type="url" placeholder="https://..." value={productForm.videoUrl} onChange={e=>setProductForm(v=>({...v,videoUrl:e.target.value}))}/></label>
      <p className="shops-note">{locale==="ar"?"حالياً أضف روابط HTTPS للوسائط؛ رفع الملفات المباشر وربط التخزين السحابي مرحلة لاحقة.":"For now, add HTTPS media links; direct uploads and cloud storage are a later phase."}</p>
      <button type="submit" disabled={addingProduct}>{addingProduct?t.adding:t.add}<span>↗</span></button>
     </form>
     <div className="shops-product-list">
      {products.length===0?<div className="shops-empty">{t.noProducts}</div>:products.map(product=><article className="shops-product-card" key={product.id}>
       <div className="shops-product-media">{product.imageUrl?<img src={product.imageUrl} alt={product.title} loading="lazy"/>:<span>W</span>}</div>
       <div className="shops-product-content"><div className="shops-product-top"><h3>{product.title}</h3><strong>{product.price} {product.currency}</strong></div>
        {product.description&&<p>{product.description}</p>}
        <small>{t.stock}: {product.stockQuantity}{product.sku? ` · ${product.sku}`:""}</small>
        <div style={{marginTop:14}}>
         <button type="button" onClick={()=>void toggleInventory(product)} style={{border:"1px solid var(--wasla-border)",borderRadius:8,padding:"9px 13px",background:"rgba(198,161,91,.09)",color:"var(--wasla-navy)",fontWeight:700}}>
          {expandedInventoryId===product.id?t.hideInventory:t.showInventory}
         </button>
        </div>
        {expandedInventoryId===product.id&&<section aria-label={t.inventory} style={{marginTop:16,padding:16,border:"1px solid var(--wasla-border)",borderRadius:12,background:"rgba(247,244,237,.65)"}}>
         <h4 style={{margin:"0 0 12px",color:"var(--wasla-navy)"}}>{t.inventory} · {product.stockQuantity}</h4>
         <form onSubmit={event=>void recordMovement(event,product)} style={{display:"grid",gap:10}}>
          <label>{t.movementType}<select value={movementForm.movementType} onChange={event=>setMovementForm(v=>({...v,movementType:event.target.value as Movement["movementType"]}))}>
           <option value="inbound">{t.inbound}</option><option value="outbound">{t.outbound}</option><option value="adjustment">{t.adjustment}</option>
          </select></label>
          <label>{t.quantity}<input required type="number" step="1" value={movementForm.quantity} onChange={event=>setMovementForm(v=>({...v,quantity:event.target.value}))} placeholder={movementForm.movementType==="adjustment"?"-5 / +10":"1"} /></label>
          {movementForm.movementType==="adjustment"&&<small>{t.signedHint}</small>}
          <label>{t.reason}<input required minLength={3} maxLength={500} value={movementForm.reason} onChange={event=>setMovementForm(v=>({...v,reason:event.target.value}))}/></label>
          <label>{t.reference}<input maxLength={120} value={movementForm.referenceCode} onChange={event=>setMovementForm(v=>({...v,referenceCode:event.target.value}))}/></label>
          <button type="submit" disabled={movementSaving||!movementForm.quantity||movementForm.reason.trim().length<3}>{movementSaving?t.recording:t.recordMovement}</button>
         </form>
         <h5 style={{margin:"20px 0 10px"}}>{t.history}</h5>
         {movementLoading?<p>{t.loading}</p>:(movements[product.id]??[]).length===0?<p>{t.noMovements}</p>:
          <div style={{display:"grid",gap:9}}>
           {(movements[product.id]??[]).map(movement=><article key={movement.id} style={{padding:"11px 12px",border:"1px solid var(--wasla-border)",borderRadius:9,background:"#fff"}}>
            <div style={{display:"flex",justifyContent:"space-between",gap:8,flexWrap:"wrap"}}>
             <strong>{movement.movementType==="inbound"?t.inbound:movement.movementType==="outbound"?t.outbound:t.adjustment}: {movement.quantityDelta>0?"+":""}{movement.quantityDelta}</strong>
             <small>{new Date(movement.createdAt).toLocaleString(locale==="ar"?"ar":"en")}</small>
            </div>
            <small>{t.before}: {movement.quantityBefore} · {t.after}: {movement.quantityAfter}</small>
            <p style={{margin:"6px 0 0",fontSize:13}}>{movement.reason}{movement.referenceCode? ` · ${movement.referenceCode}`:""}</p>
           </article>)}
          </div>}
        </section>}
        <div className="shops-product-actions"><span className={`shops-product-status status-${product.status}`}>{product.status==="active"?t.published:product.status==="archived"?t.archived:t.draft}</span>
         <button type="button" onClick={()=>void updateProductStatus(product,product.status==="active"?"draft":"active")}>{product.status==="active"?t.draft:t.published}</button>
        </div>
       </div>
      </article>)}
     </div>
    </div>
   </section>}
   <p className="shops-back"><Link href="/shops">← {t.back}</Link></p>
   <footer className="shops-footer">{locale === "ar" ? "وصلة · منصة عالمية للتجارة والأعمال" : "WASLA · A global platform for commerce and business"}</footer>
  </section>
 </main>;
}
