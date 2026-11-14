import { hash, verify } from "@node-rs/argon2";
import { randomBytes, createHash, createHmac, createCipheriv, createDecipheriv, timingSafeEqual } from "node:crypto";
import { ApiError, requireSameOrigin } from "@/lib/server/api-v1";

// Library const-enum values: Argon2id=2; version 0x13=1. Numeric constants avoid
// ambient const-enum access under Next's isolatedModules compilation.
export const passwordOptions={algorithm:2,version:1,memoryCost:19456,timeCost:2,parallelism:1,outputLen:32};
export function passwordInput(value:unknown):string {
 if(typeof value!=="string"||value.length<12||value.length>128||Buffer.byteLength(value,"utf8")>512||/[\u0000]/.test(value))throw new ApiError(400,"INVALID_REQUEST","Use a password of 12–128 characters.");
 return value;
}
export async function passwordHash(value:string){return hash(passwordInput(value),passwordOptions);}
export async function passwordMatches(encoded:string,password:string){try{return encoded.startsWith("$argon2id$")&&await verify(encoded,password);}catch{return false;}}
let dummy:Promise<string>|undefined;
export function dummyPasswordHash(){return dummy??=(hash(randomBytes(32).toString("base64url"),passwordOptions));}
export function opaqueToken(){return randomBytes(32).toString("base64url");}
export function tokenHash(value:string){return createHash("sha256").update(value).digest("hex");}
export function validToken(value:unknown):value is string{return typeof value==="string"&&/^[A-Za-z0-9_-]{43}$/.test(value);}
export function secretKey(secret:string,key:string){return createHmac("sha256",secret).update(key).digest("hex");}
export function sessionBinding(secret:string,id:string,hash:string){return secretKey(secret,`session:${id}:${hash}`);}
export function csrfToken(secret:string,binding:string){return secretKey(secret,binding);}
export function protectRequest(request:Request,origin:string,binding?:string,secret?:string){
 requireSameOrigin(request,origin);
 const site=request.headers.get("sec-fetch-site");
 if(site&&site!=="same-origin")throw new ApiError(403,"FORBIDDEN","Request protection failed.");
 if(binding){const expected=csrfToken(secret!,binding),supplied=request.headers.get("x-csrf-token")??"";if(!/^[a-f0-9]{64}$/.test(supplied)||!timingSafeEqual(Buffer.from(supplied),Buffer.from(expected)))throw new ApiError(403,"FORBIDDEN","Request protection failed.");}
}
export function encryptNotification(value:unknown,key:string){const iv=randomBytes(12),cipher=createCipheriv("aes-256-gcm",Buffer.from(key,"hex"),iv);const ciphertext=Buffer.concat([cipher.update(JSON.stringify(value),"utf8"),cipher.final()]).toString("base64");return {ciphertext,iv:iv.toString("hex"),tag:cipher.getAuthTag().toString("hex")};}
export function decryptNotification(value:{ciphertext:string;iv:string;tag:string},key:string){const decipher=createDecipheriv("aes-256-gcm",Buffer.from(key,"hex"),Buffer.from(value.iv,"hex"));decipher.setAuthTag(Buffer.from(value.tag,"hex"));return JSON.parse(Buffer.concat([decipher.update(Buffer.from(value.ciphertext,"base64")),decipher.final()]).toString("utf8"));}
