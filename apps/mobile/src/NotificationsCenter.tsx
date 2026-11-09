import React,{useEffect,useState} from "react";
import {ActivityIndicator,Pressable,Text,View} from "react-native";
import {getNotifications,markAllNotificationsRead,markNotificationRead,type WaslaNotification} from "./communications";
export default function NotificationsCenter({rtl}:{rtl:boolean}){
 const [items,setItems]=useState<WaslaNotification[]>([]),[unread,setUnread]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const label=(a:string,b:string)=>rtl?a:b;
 async function load(){setBusy(true);try{const r=await getNotifications();setItems(r.notifications);setUnread(r.unreadCount);setError("");}catch{setError(label("تعذر تحميل الإشعارات","Could not load notifications"));}finally{setBusy(false);}}
 useEffect(()=>{void load();},[]);
 async function read(id:string){try{await markNotificationRead(id);await load();}catch{setError(label("تعذر تحديث الإشعار","Could not update notification"));}}
 async function readAll(){try{await markAllNotificationsRead();await load();}catch{setError(label("تعذر تحديث الإشعارات","Could not update notifications"));}}
 return <View style={{gap:9,borderTopWidth:1,borderColor:"#ECE6D9",paddingTop:14}}>
 <View style={{flexDirection:rtl?"row-reverse":"row",justifyContent:"space-between",alignItems:"center"}}><Text style={{fontSize:18,fontWeight:"900",color:"#14283F"}}>{label("الإشعارات","Notifications")} ({unread})</Text><Pressable onPress={()=>void readAll()}><Text style={{color:"#A17B3D",fontWeight:"700"}}>{label("قراءة الكل","Mark all read")}</Text></Pressable></View>
 {items.map(n=><Pressable key={n.id} onPress={()=>void read(n.id)} style={{padding:11,borderRadius:9,backgroundColor:n.readAt?"#F8F8F6":"#EEE9DD",gap:4}}><Text style={{fontWeight:"800",color:"#14283F",textAlign:rtl?"right":"left"}}>{rtl?n.titleAr:n.titleEn}</Text><Text style={{color:"#626A72",textAlign:rtl?"right":"left"}}>{rtl?n.bodyAr:n.bodyEn}</Text><Text style={{color:"#A17B3D",fontSize:11}}>{n.readAt?label("مقروء","Read"):label("غير مقروء · اضغط للتحديد كمقروء","Unread · tap to mark read")}</Text></Pressable>)}
 {busy?<ActivityIndicator color="#14283F"/>:null}{!busy&&!items.length?<Text style={{color:"#626A72"}}>{label("لا توجد إشعارات حالياً","No notifications yet")}</Text>:null}{error?<Text style={{color:"#B42318"}}>{error}</Text>:null}
 </View>;
}