import {createHash} from "node:crypto";
import {ApiError,uuid} from "@/lib/server/api-v1";
import {maxDocumentBytes,validateDocumentSignature} from "@/lib/document-validation";
import type {InvoiceMime} from "@/lib/server/stage1/documents";

export type StoredOriginal={key:string;version:string;sha256:string;byteSize:number};
export const supplierLogoMimes=["image/jpeg","image/png","image/webp"] as const;
export type SupplierLogoMime=typeof supplierLogoMimes[number];
export type StoredPrivateAsset={key:string;version:string;sha256:string;byteSize:number;mime:SupplierLogoMime};
export const maxSupplierLogoBytes=5*1024*1024;
export const defaultSupplierLogoBytes=2*1024*1024;
export interface PrivateOriginalStore {
  put(input:{companyId:string;documentId:string;mime:InvoiceMime;bytes:Uint8Array}):Promise<StoredOriginal>;
  read(original:StoredOriginal):Promise<Uint8Array>;
}
export interface PrivateAssetStore {
  putAsset(input:{companyId:string;supplierId:string;assetId:string;mime:SupplierLogoMime;bytes:Uint8Array}):Promise<StoredPrivateAsset>;
  readAsset(asset:StoredPrivateAsset):Promise<Uint8Array>;
}
export function originalKey(companyId:string,documentId:string,sha256:string){
  if(!/^[a-f0-9]{64}$/.test(sha256))throw new ApiError(400,"INVALID_REQUEST","Invalid original digest.");
  return `companies/${uuid(companyId).toLowerCase()}/documents/${uuid(documentId).toLowerCase()}/${sha256}`;
}
export function checkOriginal(original:StoredOriginal){
  if(!/^companies\/[a-f0-9-]{36}\/documents\/[a-f0-9-]{36}\/[a-f0-9]{64}$/.test(original.key)||original.key.split('/')[4]!==original.sha256||!original.version||original.version==="null"||original.version.length>1024||!Number.isSafeInteger(original.byteSize)||original.byteSize<1||original.byteSize>maxDocumentBytes)throw new ApiError(503,"UNAVAILABLE","Original identity is invalid.");
}
export function uploadMetadata(input:{companyId:string;documentId:string;mime:InvoiceMime;bytes:Uint8Array}){
  try{validateDocumentSignature(input.mime,input.bytes.byteLength,input.bytes);}catch{throw new ApiError(400,"INVALID_REQUEST","Invalid document contents.");}
  const sha256=createHash("sha256").update(input.bytes).digest("hex");
  return {key:originalKey(input.companyId,input.documentId,sha256),sha256,byteSize:input.bytes.byteLength};
}
export function supplierLogoKey(companyId:string,supplierId:string,assetId:string,sha256:string){
  if(!/^[a-f0-9]{64}$/.test(sha256))throw new ApiError(400,"INVALID_REQUEST","Invalid supplier image digest.");
  return `companies/${uuid(companyId).toLowerCase()}/suppliers/${uuid(supplierId).toLowerCase()}/logos/${uuid(assetId).toLowerCase()}/${sha256}`;
}
export function checkPrivateAsset(asset:StoredPrivateAsset){
  if(!/^companies\/[a-f0-9-]{36}\/suppliers\/[a-f0-9-]{36}\/logos\/[a-f0-9-]{36}\/[a-f0-9]{64}$/.test(asset.key)||asset.key.split('/')[6]!==asset.sha256||!asset.version||asset.version==="null"||asset.version.length>1024||!supplierLogoMimes.includes(asset.mime)||!Number.isSafeInteger(asset.byteSize)||asset.byteSize<1||asset.byteSize>maxSupplierLogoBytes)throw new ApiError(503,"UNAVAILABLE","Supplier image identity is invalid.");
}
export function supplierLogoUploadLimit(env:Readonly<Record<string,string|undefined>>){
  const configured=env.SAAS_SUPPLIER_LOGO_MAX_BYTES;
  if(configured===undefined)return defaultSupplierLogoBytes;
  if(!/^\d+$/.test(configured))throw new ApiError(503,"UNAVAILABLE","Supplier image size limit is invalid.");
  const limit=Number(configured);
  if(!Number.isSafeInteger(limit)||limit<256*1024||limit>maxSupplierLogoBytes)throw new ApiError(503,"UNAVAILABLE","Supplier image size limit is invalid.");
  return limit;
}
export function supplierLogoMetadata(input:{companyId:string;supplierId:string;assetId:string;mime:SupplierLogoMime;bytes:Uint8Array;maxBytes?:number}){
  const {bytes,mime}=input;
  const maxBytes=input.maxBytes??maxSupplierLogoBytes;
  if(bytes.byteLength<1||bytes.byteLength>maxBytes||!supplierLogoMimes.includes(mime))throw new ApiError(413,"INVALID_REQUEST","Supplier images must be JPG, PNG or WEBP within the configured size limit.");
  const valid=mime==="image/jpeg"
    ?bytes.length>=3&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff
    :mime==="image/png"
      ?bytes.length>=8&&Buffer.from(bytes.subarray(0,8)).equals(Buffer.from([137,80,78,71,13,10,26,10]))
      :bytes.length>=12&&Buffer.from(bytes.subarray(0,4)).toString("ascii")==="RIFF"&&Buffer.from(bytes.subarray(8,12)).toString("ascii")==="WEBP";
  if(!valid)throw new ApiError(400,"INVALID_REQUEST","Invalid supplier image contents.");
  const sha256=createHash("sha256").update(bytes).digest("hex");
  return {key:supplierLogoKey(input.companyId,input.supplierId,input.assetId,sha256),sha256,byteSize:bytes.byteLength,mime};
}
