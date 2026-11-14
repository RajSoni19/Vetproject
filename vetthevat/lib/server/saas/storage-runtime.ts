import "server-only";
import {readPrivateS3Configuration} from "@/lib/server/saas/s3-config";
import {privateS3Store} from "@/lib/server/saas/s3-storage";
import {readR2Configuration,r2OriginalStore} from "@/lib/server/providers/r2";
import {localPrivateOriginals} from "@/lib/server/saas/local-originals";
import {serverversePrivateOriginals} from "@/lib/server/saas/serververse-originals";
import type {PrivateAssetStore} from "@/lib/server/saas/object-storage";
export function privateOriginals(){if(process.env.VTV_PRIVATE_ORIGINALS_ENABLED==='1'){if(process.env.R2_ENABLED==='1'||process.env.SAAS_OBJECT_STORAGE_ENABLED==='1')return undefined;return serverversePrivateOriginals(process.env);}if(process.env.R2_ENABLED==='1'){const r2=readR2Configuration(process.env);return r2?r2OriginalStore(r2):undefined;}if(process.env.SAAS_OBJECT_STORAGE_ENABLED==='1'){const config=readPrivateS3Configuration(process.env);return config?privateS3Store(config):undefined;}return localPrivateOriginals(process.env,process.cwd());}
export function privateAssets():PrivateAssetStore|undefined{if(process.env.VTV_PRIVATE_ORIGINALS_ENABLED==='1'){if(process.env.R2_ENABLED==='1'||process.env.SAAS_OBJECT_STORAGE_ENABLED==='1')return undefined;return serverversePrivateOriginals(process.env);}if(process.env.R2_ENABLED==='1'){const r2=readR2Configuration(process.env);return r2?r2OriginalStore(r2):undefined;}if(process.env.SAAS_OBJECT_STORAGE_ENABLED==='1'){const config=readPrivateS3Configuration(process.env);return config?privateS3Store(config):undefined;}return localPrivateOriginals(process.env,process.cwd());}
