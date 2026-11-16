"use client";
import Link from "next/link";
import { useLocale } from "../../components/locale-provider";
import WorkspaceHeader from "../../components/workspace-header";
export default function DeleteAccountPage(){
 const {locale}=useLocale(),ar=locale==="ar";
 const items=ar?[
 "قد نحتاج إلى التحقق من هويتك قبل تنفيذ الطلب لحماية حسابك.",
 "سنراجع ملكية المتاجر وحسابات الأعمال والطلبات والنزاعات والفواتير والاتفاقيات المفتوحة قبل أي حذف.",
 "قد نحتفظ بسجلات محددة عندما تفرض القوانين أو الالتزامات التجارية ذلك؛ وسنقلل البيانات الشخصية ونقيد الوصول إليها حيثما أمكن.",
 "لن نحذف المحادثات المشتركة أو السجلات المالية بطريقة تضر بالطرف الآخر أو تدمر سجلات مطلوبة.",
 "إرسال الطلب لا يعني اكتمال الحذف فوراً. سيؤكد فريق الدعم ما تم حذفه وما يلزم الاحتفاظ به وسبب ذلك."
 ]:[
 "We may verify your identity before processing the request to protect your account.",
 "We will review store and business ownership, orders, disputes, invoices and open agreements before deletion.",
 "Specific records may need to be retained for legal or commercial obligations; where possible, personal data will be minimized and access restricted.",
 "Shared conversations and financial records will not be erased in a way that harms another party or destroys required records.",
 "Submitting a request does not mean deletion is immediate. Support will confirm what was erased and what must be retained, with the reason."
 ];
 return <main dir={ar?"rtl":"ltr"} lang={locale} style={{minHeight:"100vh",background:"#f6f4ee",color:"#17283d",padding:"28px 18px",fontFamily:"Arial,sans-serif"}}>
 <WorkspaceHeader section="account"/>
 <div style={{maxWidth:820,margin:"28px auto",background:"#fff",border:"1px solid #e5e0d5",borderRadius:18,padding:28}}>
 <span style={{color:"#9b7b3d",fontSize:12,letterSpacing:1}}>WASLA · PRIVACY</span>
 <h1 style={{margin:"12px 0"}}>{ar?"طلب حذف الحساب والبيانات":"Request account and data deletion"}</h1>
 <p style={{lineHeight:1.8}}>{ar?"يمكنك تقديم طلب حذف من خلال مركز الدعم. سجّل الدخول، وافتح نموذج الطلب المجهز لحذف الحساب، واكتب أنك تطلب حذف حسابك.":"You can request deletion through WASLA Support. Sign in, open the preselected account-deletion request form, and state that you are requesting deletion of your account."}</p>
 <h2 style={{fontSize:18,marginTop:24}}>{ar?"ماذا يحدث بعد تقديم الطلب؟":"What happens after you submit?"}</h2>
 <ul style={{lineHeight:1.9,paddingInlineStart:24}}>{items.map(item=><li key={item}>{item}</li>)}</ul>
 <p style={{lineHeight:1.8,background:"#f6f4ee",borderRadius:10,padding:14}}>{ar?"مهم: هذه الصفحة تشرح طريقة تقديم الطلب. لا يتم حذف الحساب تلقائياً من هنا، ولا نعدّ الطلب مكتملاً حتى تتم مراجعته وتأكيد النتيجة.":"Important: this page explains how to submit a request. It does not automatically delete your account, and a request is not complete until it has been reviewed and the outcome confirmed."}</p>
 <div style={{display:"flex",gap:12,flexWrap:"wrap",marginTop:22}}>
 <Link href="/support?category=account_deletion" style={{display:"inline-block",padding:"12px 18px",borderRadius:9,background:"#17283d",color:"#e5cb91",textDecoration:"none"}}>{ar?"فتح مركز الدعم":"Open Support"}</Link>
 <Link href="/login" style={{display:"inline-block",padding:"12px 18px",borderRadius:9,border:"1px solid #d8dee7",color:"#17283d",textDecoration:"none"}}>{ar?"تسجيل الدخول":"Sign in"}</Link>
 </div></div></main>;
}
