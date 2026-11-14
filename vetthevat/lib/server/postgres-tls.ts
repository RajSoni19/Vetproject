import {readFileSync} from "node:fs";
import {TLSSocket,checkServerIdentity} from "node:tls";
// pg 8.16.3 exposes its negotiated transport here. Fail closed if that contract
// changes. pg_stat_ssl describes the database-side hop, not a hosted proxy's
// client-facing TLS session; never use it as proof of our transport.
export function assertPostgresTransport(client:unknown,host:string){
 const stream=(client as {connection?:{stream?:unknown}})?.connection?.stream;
 if(!(stream instanceof TLSSocket)||stream.destroyed||stream.encrypted!==true||stream.authorized!==true||!['TLSv1.2','TLSv1.3'].includes(stream.getProtocol()??'')||checkServerIdentity(host,stream.getPeerCertificate()))throw Error('Verified PostgreSQL transport required');
}
export function postgresTls(database:{tls?:boolean;caFile?:string}){
 if(!database.tls)return false as const;
 return {rejectUnauthorized:true,minVersion:'TLSv1.2' as const,...(database.caFile?{ca:readFileSync(database.caFile,'utf8')}: {})};
}
