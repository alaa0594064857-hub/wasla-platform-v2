import { authClient } from "./auth-client";
import { API_BASE_URL, WaslaApiError } from "./api";
async function req<T>(path:string, method:"GET"|"POST"|"PATCH"="GET", body?:Record<string,unknown>):Promise<T>{
 const cookie=await authClient.getCookie(); if(!cookie) throw new WaslaApiError("AUTHENTICATION_REQUIRED",401);
 let response:Response; try { response=await fetch(API_BASE_URL+path,{method,headers:{Accept:"application/json",Cookie:cookie,...(body?{"Content-Type":"application/json"}:{})},...(body?{body:JSON.stringify(body)}:{})}); } catch { throw new WaslaApiError("NETWORK_ERROR"); }
 const result=await response.json() as {success:boolean;error?:string}&T; if(!response.ok||!result.success) throw new WaslaApiError(result.error||"REQUEST_FAILED",response.status); return result;
}
export type Conversation={id:string;peer_id:string;peer_name:string;last_message:string|null;unread_count:number};
export type ChatMessage={id:string;sender_id:string;sender_name:string;body:string;created_at:string};
export type Recipient={recipient_id:string;display_name:string;entity_type:string;category:string|null};
export const getConversations=async()=> (await req<{conversations:Conversation[]}>("/api/messages")).conversations||[];
export const searchRecipients=async(q:string)=> (await req<{recipients:Recipient[]}>("/api/messages?recipients="+encodeURIComponent(q))).recipients||[];
export const startConversation=(recipientId:string)=>req<{conversationId:string}>("/api/messages","POST",{recipientId});
export const getConversation=async(id:string)=> (await req<{messages:ChatMessage[]}>("/api/messages/"+id)).messages||[];
export const sendMessage=(id:string,body:string)=>req<{message:ChatMessage}>("/api/messages/"+id,"POST",{body});
export type WaslaNotification={id:string;type:string;titleAr:string;titleEn:string;bodyAr:string;bodyEn:string;actionUrl:string|null;readAt:string|null;createdAt:string};
export const getNotifications=()=>req<{notifications:WaslaNotification[];unreadCount:number}>("/api/notifications");
export const markNotificationRead=(id:string)=>req<{notification:{id:string}}>("/api/notifications/"+id+"/read","PATCH",{});
export const markAllNotificationsRead=()=>req<{markedRead:number}>("/api/notifications/read-all","PATCH",{});
export type TradeOpportunity={id:string;opportunity_type:"buyer_request"|"supplier_offer";title:string;description:string;product_category:string|null;quantity:string|null;quantity_unit:string|null;target_country:string|null;destination_country:string|null;currency:string|null;target_unit_price:string|null;review_status:string;created_at:string};
export const getTradeOpportunities=async()=> (await req<{opportunities:TradeOpportunity[]}>("/api/trade-opportunities")).opportunities||[];
export const createTradeOpportunity=(input:{accountId:string;opportunityType:"buyer_request"|"supplier_offer";title:string;description:string;productCategory:string;quantity?:number;quantityUnit?:string;targetCountry?:string;destinationCountry?:string;currency?:string;targetUnitPrice?:number})=>req<{opportunity:TradeOpportunity;message:string}>("/api/trade-opportunities","POST",input);