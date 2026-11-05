"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useLocale } from "../../../components/locale-provider";
import WorkspaceHeader from "../../../components/workspace-header";

type Store = { id: string; name: string; slug: string; status: string; account_name: string; business_description: string | null; website: string | null; country_code: string | null };
type Product = { id: string; title: string; description: string | null; sku: string | null; price: string; currency: string; stockQuantity: number; imageUrl: string | null; videoUrl: string | null; status: "draft" | "active" | "archived" };
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";
const labels = {
  ar: { title:"إدارة المتجر", subtitle:"هذه مساحة إدارة متجرك المرتبط بحسابك التجاري.", home:"الرئيسية", shops:"متاجري", name:"اسم المتجر", save:"حفظ التغييرات", saving:"جارٍ الحفظ...", account:"الحساب التجاري", address:"معرّف المتجر", loading:"جارٍ تحميل بيانات المتجر...", error:"تعذر تحميل المتجر أو لا تملك صلاحية الوصول.", saved:"تم حفظ التغييرات.", back:"العودة إلى المتاجر", status:"حالة المتجر", active:"نشط", products:"المنتجات", addProduct:"إضافة منتج", productName:"اسم المنتج", description:"الوصف", sku:"رمز المنتج (اختياري)", price:"السعر", currency:"العملة", stock:"الكمية في المخزون", imageUrl:"رابط صورة المنتج (HTTPS)", videoUrl:"رابط فيديو المنتج (HTTPS)", add:"إضافة المنتج", adding:"جارٍ الإضافة...", noProducts:"لا توجد منتجات بعد. أضف أول منتج.", draft:"مسودة", published:"منشور", archived:"مؤرشف", saveProduct:"حفظ", savedProduct:"تم تحديث المنتج." },
  en: { title:"Shop management", subtitle:"Manage your shop connected to your business account.", home:"Home", shops:"My shops", name:"Shop name", save:"Save changes", saving:"Saving...", account:"Business account", address:"Shop identifier", loading:"Loading shop details...", error:"Could not load this shop or you do not have access.", saved:"Changes saved.", back:"Back to shops", status:"Shop status", active:"Active", products:"Products", addProduct:"Add a product", productName:"Product name", description:"Description", sku:"SKU (optional)", price:"Price", currency:"Currency", stock:"Stock quantity", imageUrl:"Product image URL (HTTPS)", videoUrl:"Product video URL (HTTPS)", add:"Add product", adding:"Adding...", noProducts:"No products yet. Add your first product.", draft:"Draft", published:"Published", archived:"Archived", saveProduct:"Save", savedProduct:"Product updated." },
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
