import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import { getConversations, searchRecipients, startConversation, getConversation, sendMessage, type Conversation, type ChatMessage, type Recipient } from "./communications";
export default function MessagesCenter({rtl}:{rtl:boolean}) {
 const [items,setItems]=useState<Conversation[]>([]),[active,setActive]=useState(""),[messages,setMessages]=useState<ChatMessage[]>([]);
 const [query,setQuery]=useState(""),[body,setBody]=useState(""),[recipients,setRecipients]=useState<Recipient[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const label=(a:string,b:string)=>rtl?a:b;
 async function refresh(){try{setItems(await getConversations());setError("");}catch{setError(label("تعذر تحميل المحادثات","Could not load conversations"));}}
 useEffect(()=>{void refresh();},[]);
 async function search(){if(query.trim().length<2)return;setBusy(true);try{setRecipients(await searchRecipients(query.trim()));}catch{setError(label("تعذر البحث","Search failed"));}finally{setBusy(false);}}
 async function open(id:string){setActive(id);setBusy(true);try{setMessages(await getConversation(id));}catch{setError(label("تعذر تحميل الرسائل","Could not load messages"));}finally{setBusy(false);}}
 async function begin(id:string){setBusy(true);try{const r=await startConversation(id);setRecipients([]);setQuery("");await refresh();await open(r.conversationId);}catch{setError(label("تعذر بدء المحادثة","Could not start conversation"));}finally{setBusy(false);}}
 async function send(){if(!active||!body.trim())return;setBusy(true);try{await sendMessage(active,body.trim());setBody("");await open(active);await refresh();}catch{setError(label("تعذر إرسال الرسالة","Could not send message"));}finally{setBusy(false);}}
 const input={borderWidth:1 as const,borderColor:"#D8D1C2",borderRadius:9,padding:10,color:"#14283F" as const};
 return <View style={{gap:9,borderTopWidth:1,borderColor:"#ECE6D9",paddingTop:14}}>
 <Text style={{fontSize:18,fontWeight:"900",color:"#14283F",textAlign:rtl?"right":"left"}}>{label("الرسائل","Messages")}</Text>
 <View style={{flexDirection:rtl?"row-reverse":"row",gap:7}}><TextInput value={query} onChangeText={setQuery} placeholder={label("ابحث عن شخص أو شركة","Find a person or business")} style={[input,{flex:1}]}/><Pressable onPress={()=>void search()} style={{backgroundColor:"#14283F",padding:11,borderRadius:9}}><Text style={{color:"white"}}>{label("بحث","Search")}</Text></Pressable></View>
 {recipients.map(x=><Pressable key={x.recipient_id} onPress={()=>void begin(x.recipient_id)} style={{padding:10,backgroundColor:"#F7F4EC",borderRadius:8}}><Text style={{color:"#14283F"}}>{x.display_name} · {x.entity_type}</Text></Pressable>)}
 {items.map(x=><Pressable key={x.id} onPress={()=>void open(x.id)} style={{padding:11,borderRadius:9,backgroundColor:active===x.id?"#EEE9DD":"#F8F8F6"}}><Text style={{fontWeight:"800",color:"#14283F",textAlign:rtl?"right":"left"}}>{x.peer_name} {Number(x.unread_count)>0?"("+x.unread_count+")":""}</Text><Text style={{color:"#626A72",textAlign:rtl?"right":"left"}}>{x.last_message||label("ابدأ المحادثة","Start conversation")}</Text></Pressable>)}
 {active?<><View style={{maxHeight:240,gap:7}}>{messages.map(m=><View key={m.id} style={{padding:9,backgroundColor:"#F7F4EC",borderRadius:8}}><Text style={{fontWeight:"700",color:"#14283F",textAlign:rtl?"right":"left"}}>{m.sender_name}</Text><Text style={{color:"#39424B",textAlign:rtl?"right":"left"}}>{m.body}</Text></View>)}</View><View style={{flexDirection:rtl?"row-reverse":"row",gap:7}}><TextInput value={body} onChangeText={setBody} placeholder={label("اكتب رسالة...","Write a message...")} multiline style={[input,{flex:1}]}/><Pressable onPress={()=>void send()} style={{backgroundColor:"#14283F",padding:12,borderRadius:9,justifyContent:"center"}}><Text style={{color:"white"}}>{label("إرسال","Send")}</Text></Pressable></View></>:null}
 {busy?<ActivityIndicator color="#14283F"/>:null}{error?<Text style={{color:"#B42318"}}>{error}</Text>:null}
 </View>;
}