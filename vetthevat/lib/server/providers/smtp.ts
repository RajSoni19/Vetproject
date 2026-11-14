import {ApiError} from "@/lib/server/api-v1";
import {isIP} from "node:net";
import {readFileSync} from "node:fs";

export type SmtpConfiguration={host:string;port:number;secure:boolean;user:string;password:string;fromName:string;fromEmail:string;tlsCa?:Buffer;tlsServername?:string};
export type SmtpMessage={to:string;subject:string;text:string;html:string;reference:string};
export type SmtpTransport={sendMail(message:Record<string,unknown>):Promise<{messageId?:string;accepted?:unknown[];rejected?:unknown[]}>};
const email=/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

export function readSmtpConfiguration(env:Readonly<Record<string,string|undefined>>):SmtpConfiguration|undefined{
 if(env.SMTP_ENABLED!=="1")return undefined;
 const host=env.SMTP_HOST??"",port=Number(env.SMTP_PORT),secure=env.SMTP_SECURE,user=env.SMTP_USER??"",password=env.SMTP_PASSWORD??"",fromName=env.SMTP_FROM_NAME??"",fromEmail=env.SMTP_FROM_EMAIL??"";
 if(!(isIP(host)!==0||/^(?=.{1,253}$)(?:localhost|(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)(?:\.(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?))*)$/.test(host))||!Number.isInteger(port)||port<1||port>65535||!['true','false'].includes(secure??'')||!user||user.length>254||/[\r\n\x00]/.test(user)||password.length<8||password.length>1024||/[\r\n\x00]/.test(password)||!fromName.trim()||fromName.length>100||/[\r\n\x00]/.test(fromName)||!email.test(fromEmail))return undefined;
 let tlsCa:Buffer|undefined,tlsServername:string|undefined;
 if(env.SMTP_TLS_CA_FILE||env.SMTP_TLS_SERVERNAME){
  if(!['test','development'].includes(env.WEB_AUTH_ENV??'')||!['localhost','127.0.0.1'].includes(host)||env.SMTP_TLS_SERVERNAME!=='localhost'||!env.SMTP_TLS_CA_FILE)return undefined;
  try{tlsCa=readFileSync(env.SMTP_TLS_CA_FILE);if(!tlsCa.includes(Buffer.from('-----BEGIN CERTIFICATE-----')))return undefined;tlsServername='localhost';}catch{return undefined;}
 }
 return {host,port,secure:secure==='true',user,password,fromName:fromName.trim(),fromEmail,tlsCa,tlsServername};
}

export function smtpTransportOptions(config:SmtpConfiguration){
 return {host:config.host,port:config.port,secure:config.secure,auth:{user:config.user,pass:config.password},requireTLS:!config.secure,tls:{rejectUnauthorized:true,minVersion:"TLSv1.2",...(config.tlsCa?{ca:config.tlsCa,servername:config.tlsServername}: {})},connectionTimeout:10000,greetingTimeout:10000,socketTimeout:15000,pool:false};
}
function nodemailerTransport(config:SmtpConfiguration):SmtpTransport{
 const nodemailer=require("nodemailer") as {createTransport(options:Record<string,unknown>):SmtpTransport};
 return nodemailer.createTransport(smtpTransportOptions(config));
}

export function smtpMailer(config:SmtpConfiguration,transport?:SmtpTransport){
 const sender=transport??nodemailerTransport(config),domain=config.fromEmail.slice(config.fromEmail.lastIndexOf("@")+1).toLowerCase();
 return {async send(message:SmtpMessage){
  if(!email.test(message.to)||!message.subject||message.subject.length>200||/[\r\n\x00]/.test(message.subject)||Buffer.byteLength(message.text)+Buffer.byteLength(message.html)>131072||!/^[A-Za-z0-9/_-]{16,200}$/.test(message.reference))throw new ApiError(400,"INVALID_REQUEST","Invalid email message.");
  const messageId=`<${message.reference.replace(/[^A-Za-z0-9._-]/g,"_")}@${domain}>`;
  try{
   const result=await sender.sendMail({from:{name:config.fromName,address:config.fromEmail},to:message.to,subject:message.subject,text:message.text,html:message.html,messageId,headers:{"X-VTV-Delivery-Reference":message.reference}});
   const accepted=(result.accepted??[]).some(value=>String(typeof value==="object"&&value!==null&&"address" in value?(value as {address:string}).address:value).toLowerCase()===message.to.toLowerCase());
   if(!accepted||result.messageId!==messageId)throw Error();
   return {accepted:true as const,messageId,delivered:false as const};
  }catch{throw new ApiError(503,"UNAVAILABLE","SMTP acceptance could not be confirmed. Retry using the same delivery reference.");}
 }};
}
