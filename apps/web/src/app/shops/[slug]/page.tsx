"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useLocale } from "../../../components/locale-provider";
import WorkspaceHeader from "../../../components/workspace-header";

type Store = { id: string; name: string; slug: string; status: string; account_name: string; account_status: string; verification_status: string | null; business_description: string | null; website: string | null; country_code: string | null };
type DeliverySettings = { deliveryEnabled: boolean; pickupEnabled: boolean; serviceAreas: string[]; deliveryFee: string | null; feeCurrency: string; preparationDays: number; deliveryNoteAr: string | null; deliveryNoteEn: string | null };
type Product = { id: string; title: string; description: string | null; sku: string | null; price: string; currency: string; stockQuantity: number; imageUrl: string | null; videoUrl: string | null; sellerCheckoutUrl: string | null; status: "draft" | "active" | "archived" };
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";
const labels = {
  ar: { title:"إدارة المتجر", subtitle:"هذه مساحة إدارة متجرك المرتبط بحسابك التجاري.", home:"الرئيسية", shops:"متاجري", name:"اسم المتجر", save:"حفظ التغييرات", saving:"جارٍ الحفظ...", account:"الحساب التجاري", address:"معرّف المتجر", loading:"جارٍ تحميل بيانات المتجر...", error:"تعذر تحميل المتجر أو لا تملك صلاحية الوصول.", saved:"تم حفظ التغييرات.", back:"العودة إلى المتاجر", viewPublic:"عرض المتجر العام", status:"حالة المتجر", active:"نشط", accountStatus:"حالة الحساب التجاري", accountPending:"الحساب التجاري بانتظار التحقق. لن يظهر المتجر للعامة حتى تكتمل المراجعة.", accountActive:"الحساب التجاري موثّق ونشط.", verification:"حالة التوثيق", unverified:"غير موثّق", verified:"موثّق", rejected:"مرفوض", products:"المنتجات", addProduct:"إضافة منتج", productName:"اسم المنتج", description:"الوصف", sku:"رمز المنتج (اختياري)", price:"السعر", currency:"العملة", imageUrl:"رابط صورة المنتج (HTTPS)", videoUrl:"رابط فيديو المنتج (HTTPS)", checkoutUrl:"رابط الشراء أو الدفع لدى البائع (HTTPS)", add:"إضافة المنتج", adding:"جارٍ الإضافة...", noProducts:"لا توجد منتجات بعد. أضف أول منتج.", draft:"مسودة", reviewPending:"بانتظار مراجعة مالك المنصة", published:"منشور", archived:"مؤرشف", resubmit:"إعادة تقديم للمراجعة", saveProduct:"حفظ", savedProduct:"تم حفظ المنتج وإرساله إلى قائمة مراجعة المالك. لن يظهر للعامة قبل اعتماده.", delivery:"إعدادات التوصيل والاستلام", deliveryEnabled:"توصيل إلى المشتري", pickupEnabled:"استلام من المتجر", areas:"المدن والمناطق (افصل بينها بفاصلة)", fee:"رسوم التوصيل (اتركها فارغة للتأكيد لاحقاً)", preparation:"أيام التجهيز المتوقعة", noteAr:"ملاحظات التوصيل بالعربية", noteEn:"Delivery notes in English", saveDelivery:"حفظ إعدادات التوصيل", deliverySaved:"تم حفظ إعدادات التوصيل.", stock:"الكمية في مخزون متجرك", updateStock:"تحديث الكمية", updatingStock:"جارٍ تحديث الكمية...", stockSaved:"تم تحديث كمية المخزون." },
  en: { title:"Shop management", subtitle:"Manage your shop connected to your business account.", home:"Home", shops:"My shops", name:"Shop name", save:"Save changes", saving:"Saving...", account:"Business account", address:"Shop identifier", loading:"Loading shop details...", error:"Could not load this shop or you do not have access.", saved:"Changes saved.", back:"Back to shops", viewPublic:"View public shop", status:"Shop status", active:"Active", accountStatus:"Business account status", accountPending:"Your business account is awaiting verification. The shop will not be public until the review is complete.", accountActive:"Your business account is verified and active.", verification:"Verification status", unverified:"Unverified", verified:"Verified", rejected:"Rejected", products:"Products", addProduct:"Add a product", productName:"Product name", description:"Description", sku:"SKU (optional)", price:"Price", currency:"Currency", imageUrl:"Product image URL (HTTPS)", videoUrl:"Product video URL (HTTPS)", checkoutUrl:"Seller purchase/payment link (HTTPS)", add:"Add product", adding:"Adding...", noProducts:"No products yet. Add your first product.", draft:"Draft", reviewPending:"Awaiting owner review", published:"Published", archived:"Archived", resubmit:"Resubmit for review", saveProduct:"Save", savedProduct:"Product saved to the owner review queue. It will not appear publicly until approved.", delivery:"Delivery and pickup settings", deliveryEnabled:"Deliver to buyer", pickupEnabled:"Customer pickup", areas:"Cities and service areas (comma separated)", fee:"Delivery fee (leave blank to confirm later)", preparation:"Estimated preparation days", noteAr:"Delivery notes in Arabic", noteEn:"Delivery notes in English", saveDelivery:"Save delivery settings", deliverySaved:"Delivery settings saved.", stock:"Your shop stock", updateStock:"Update quantity", updatingStock:"Updating quantity...", stockSaved:"Stock quantity updated." },
};
async function api<T>(slug:string, options?:RequestInit, suffix=""):Promise<T>{
 const response=await fetch(`${API_BASE}/api/stores/${encodeURIComponent(slug)}${suffix}`,{...options,credentials:"include",headers:{"Content-Type":"application/json",...options?.headers}});
 const data=await response.json(); if(!response.ok||data.success!==true) throw new Error(data.error||"Request failed"); return data as T;
}
export default function ShopManagementPage(){
 const params=useParams<{slug:string}>(); const slug=params.slug;
 const { locale } = useLocale(); const [store,setStore]=useState<Store|null>(null);
 const [name,setName]=useState(""); const [loading,setLoading]=useState(true); const [saving,setSaving]=useState(false); const [error,setError]=useState(""); const [message,setMessage]=useState("");
 const [products,setProducts]=useState<Product[]>([]); const [delivery,setDelivery]=useState<DeliverySettings>({deliveryEnabled:false,pickupEnabled:false,serviceAreas:[],deliveryFee:null,feeCurrency:"USD",preparationDays:0,deliveryNoteAr:"",deliveryNoteEn:""}); const [savingDelivery,setSavingDelivery]=useState(false); const [addingProduct,setAddingProduct]=useState(false); const [stockDrafts,setStockDrafts]=useState<Record<string,string>>({}); const [savingStockId,setSavingStockId]=useState("");
 const [productForm,setProductForm]=useState({title:"",description:"",sku:"",price:"",currency:"USD",stockQuantity:"0",imageUrl:"",videoUrl:"",sellerCheckoutUrl:""});
 const t=labels[locale]; const dir=locale==="ar"?"rtl":"ltr";
 const load=useCallback(async()=>{setLoading(true);setError("");try{const result=await api<{store:Store}>(slug);setStore(result.store);setName(result.store.name);const catalog=await api<{products:Product[]}>(slug,undefined,"/products");setProducts(catalog.products);const deliveryResult=await api<{settings:DeliverySettings}>(slug,undefined,"/delivery-settings");setDelivery(deliveryResult.settings);setStockDrafts(Object.fromEntries(catalog.products.map(product=>[product.id,String(product.stockQuantity)])));}catch{setError(t.error);}finally{setLoading(false);}},[slug,t.error]);
 useEffect(()=>{void load();},[load]);
 async function save(event:FormEvent<HTMLFormElement>){event.preventDefault();setSaving(true);setError("");setMessage("");try{const result=await api<{store:Store}>(slug,{method:"PATCH",body:JSON.stringify({name:name.trim()})});setStore(result.store);setName(result.store.name);setMessage(t.saved);}catch{setError(t.error);}finally{setSaving(false);}}
 async function saveDelivery(event:FormEvent<HTMLFormElement>){
  event.preventDefault();setSavingDelivery(true);setError("");setMessage("");
  try{
   const payload={...delivery,serviceAreas:delivery.serviceAreas.map(area=>area.trim()).filter(Boolean),deliveryFee:delivery.deliveryFee?.trim()||null};
   const result=await api<{settings:DeliverySettings}>(slug,{method:"PATCH",body:JSON.stringify(payload)},"/delivery-settings");
   setDelivery(result.settings);setMessage(t.deliverySaved);
  }catch(cause){setError(cause instanceof Error?cause.message:t.error);}
  finally{setSavingDelivery(false);}
 }
 async function addProduct(event:FormEvent<HTMLFormElement>){
  event.preventDefault();setAddingProduct(true);setError("");setMessage("");
  try{
   const result=await api<{product:Product}>(slug,{method:"POST",body:JSON.stringify({
    ...productForm,price:productForm.price,stockQuantity:Number(productForm.stockQuantity),
    imageUrl:productForm.imageUrl.trim()||null,videoUrl:productForm.videoUrl.trim()||null,sellerCheckoutUrl:productForm.sellerCheckoutUrl.trim()||null,status:"draft"
   })},"/products");
   setProducts(current=>[result.product,...current]);
   setProductForm({title:"",description:"",sku:"",price:"",currency:"USD",stockQuantity:"0",imageUrl:"",videoUrl:"",sellerCheckoutUrl:""});
   setMessage(t.savedProduct);
  }catch(cause){setError(cause instanceof Error?cause.message:t.error);}
  finally{setAddingProduct(false);}
 }
 async function updateStock(product:Product){
  const raw=stockDrafts[product.id]??String(product.stockQuantity); const quantity=Number(raw);
  if(!Number.isSafeInteger(quantity)||quantity<0){setError(locale==="ar"?"أدخل كمية صحيحة غير سالبة.":"Enter a valid non-negative whole number.");return;}
  setSavingStockId(product.id);setError("");setMessage("");
  try{const result=await api<{product:Product}>(slug,{method:"PATCH",body:JSON.stringify({stockQuantity:quantity})},`/products/${product.id}`);setProducts(current=>current.map(item=>item.id===product.id?result.product:item));setStockDrafts(current=>({...current,[product.id]:String(result.product.stockQuantity)}));setMessage(t.stockSaved);}
  catch(cause){setError(cause instanceof Error?cause.message:t.error);}
  finally{setSavingStockId("");}
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
     <div className="shops-info-row"><small>{t.accountStatus}</small><strong>{store.account_status==="active"?t.active:(locale==="ar"?"بانتظار التحقق":"Pending verification")}</strong></div>
     <div className="shops-info-row"><small>{t.verification}</small><strong>{store.verification_status==="verified"?t.verified:store.verification_status==="rejected"?t.rejected:t.unverified}</strong></div>
     {store.account_status!=="active"&&<p role="status" className="shops-note">{t.accountPending}</p>}
     {store.account_status==="active"&&store.verification_status==="verified"&&<p role="status" className="shops-note">{t.accountActive}</p>}
     <div className="shops-info-row"><small>{t.account}</small><strong>{store.account_name}</strong></div>
     <div className="shops-info-row"><small>{t.address}</small><strong dir="ltr">/store/{store.slug}</strong></div>
     {store.website&&<div className="shops-info-row"><small>Website</small><strong dir="ltr">{store.website}</strong></div>}
    </aside>
   </div>}

   {store&&<section className="shops-create-card mt-8">
    <span className="shops-eyebrow">03 / FULFILMENT</span><h2>{t.delivery}</h2>
    <form onSubmit={saveDelivery} className="grid gap-4 md:grid-cols-2">
     <label className="flex items-center gap-2"><input type="checkbox" checked={delivery.deliveryEnabled} onChange={e=>setDelivery(v=>({...v,deliveryEnabled:e.target.checked}))}/>{t.deliveryEnabled}</label>
     <label className="flex items-center gap-2"><input type="checkbox" checked={delivery.pickupEnabled} onChange={e=>setDelivery(v=>({...v,pickupEnabled:e.target.checked}))}/>{t.pickupEnabled}</label>
     <label className="md:col-span-2">{t.areas}<input value={delivery.serviceAreas.join(", ")} onChange={e=>setDelivery(v=>({...v,serviceAreas:e.target.value.split(",")}))} placeholder={locale==="ar"?"إسطنبول، أنقرة":"Istanbul, Ankara"}/></label>
     <label>{t.fee}<input inputMode="decimal" value={delivery.deliveryFee??""} onChange={e=>setDelivery(v=>({...v,deliveryFee:e.target.value}))} placeholder="—"/></label>
     <label>{t.currency}<select value={delivery.feeCurrency} onChange={e=>setDelivery(v=>({...v,feeCurrency:e.target.value}))}><option>USD</option><option>EUR</option><option>TRY</option><option>GBP</option><option>SAR</option><option>AED</option></select></label>
     <label>{t.preparation}<input type="number" min="0" max="90" step="1" value={delivery.preparationDays} onChange={e=>setDelivery(v=>({...v,preparationDays:Number(e.target.value)}))}/></label>
     <label>{t.noteAr}<textarea maxLength={1000} value={delivery.deliveryNoteAr??""} onChange={e=>setDelivery(v=>({...v,deliveryNoteAr:e.target.value}))}/></label>
     <label>{t.noteEn}<textarea maxLength={1000} value={delivery.deliveryNoteEn??""} onChange={e=>setDelivery(v=>({...v,deliveryNoteEn:e.target.value}))}/></label>
     <p className="shops-note md:col-span-2">{locale==="ar"?"لن يظهر أي نطاق توصيل حتى تحدده. رسوم التوصيل الفارغة تعني أنها تحتاج تأكيداً مع المشتري؛ المدة تقديرية وليست ضماناً.":"No delivery coverage is offered until you define it. A blank fee requires confirmation with the buyer; preparation time is an estimate, not a guarantee."}</p>
     <button type="submit" disabled={savingDelivery}>{savingDelivery?t.saving:t.saveDelivery}<span>↗</span></button>
    </form>
   </section>}
   {store&&<section className="shops-products-area">
    <div className="shops-products-heading"><div><span className="shops-eyebrow">03 / CATALOG MANAGEMENT</span><h2>{t.products}</h2></div><div className="flex items-center gap-3"><Link href={`/store/${store.slug}`} target="_blank" rel="noreferrer" className="rounded-xl border border-[#b89545] px-4 py-2 text-sm font-semibold text-[#14233b] hover:bg-[#f7f4ec]">{t.viewPublic} ↗</Link><b>{products.length}</b></div></div>
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
      <label>{t.checkoutUrl}<input type="url" placeholder="https://..." value={productForm.sellerCheckoutUrl} onChange={e=>setProductForm(v=>({...v,sellerCheckoutUrl:e.target.value}))}/></label>
      <p className="shops-note">{locale==="ar"?"رابط الشراء يخص البائع ويوجه العميل إليه مباشرة؛ WASLA لا تستلم مدفوعات هذا المنتج.":"This link belongs to the seller and sends the customer directly to the seller; WASLA does not collect this product payment."}</p>
      <p className="shops-note">{locale==="ar"?"حالياً أضف روابط HTTPS للوسائط؛ رفع الملفات المباشر وربط التخزين السحابي مرحلة لاحقة.":"For now, add HTTPS media links; direct uploads and cloud storage are a later phase."}</p>
      <button type="submit" disabled={addingProduct}>{addingProduct?t.adding:t.add}<span>↗</span></button>
     </form>
     <div className="shops-product-list">
      {products.length===0?<div className="shops-empty">{t.noProducts}</div>:products.map(product=><article className="shops-product-card" key={product.id}>
       <div className="shops-product-media">{product.imageUrl?<img src={product.imageUrl} alt={product.title} loading="lazy"/>:<span>W</span>}</div>
       <div className="shops-product-content"><div className="shops-product-top"><h3>{product.title}</h3><strong>{product.price} {product.currency}</strong></div>
        {product.description&&<p>{product.description}</p>}
        <small>{t.stock}: {product.stockQuantity}{product.sku? ` · ${product.sku}`:""}</small>
        <div className="mt-3 flex flex-wrap items-end gap-2"><label className="min-w-0 flex-1 text-xs font-semibold">{t.stock}<input aria-label={`${t.stock}: ${product.title}`} type="number" min="0" step="1" value={stockDrafts[product.id]??String(product.stockQuantity)} onChange={event=>setStockDrafts(current=>({...current,[product.id]:event.target.value}))} className="mt-1 w-full rounded-lg border border-[#ded7c8] bg-white px-3 py-2 text-sm text-[#14233b]"/></label><button type="button" onClick={()=>void updateStock(product)} disabled={savingStockId===product.id||Number(stockDrafts[product.id]??product.stockQuantity)===product.stockQuantity}>{savingStockId===product.id?t.updatingStock:t.updateStock}</button></div>
        <div className="shops-product-actions"><span className={`shops-product-status status-${product.status}`}>{product.status==="active"?t.published:product.status==="archived"?t.archived:t.reviewPending}</span>
         {product.status==="archived"&&<button type="button" onClick={()=>void updateProductStatus(product,"draft")}>{t.resubmit}</button>}
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
