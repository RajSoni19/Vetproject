import {ApiError,uuid} from "@/lib/server/api-v1";
export function operationTelemetry(input:{requestId:string;operation:"invoice.save"|"bank.allocate"|"document.upload"|"session.verify";status:number;durationMs:number}){
  if(!["invoice.save","bank.allocate","document.upload","session.verify"].includes(input.operation)||!Number.isInteger(input.status)||input.status<100||input.status>599||!Number.isFinite(input.durationMs)||input.durationMs<0)throw new ApiError(503,"UNAVAILABLE","Invalid monitoring event.");
  // Construct allowlist only: never spread request/error/header/domain objects.
  return {requestId:uuid(input.requestId),operation:input.operation,status:input.status,durationMs:Math.round(input.durationMs)};
}
export interface MonitoringPort {emit(event:ReturnType<typeof operationTelemetry>):void;}
