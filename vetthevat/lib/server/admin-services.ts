import "server-only";
import {webAuthServices} from "@/lib/server/web-auth/runtime";
export function administratorAuthServices(){return webAuthServices();}
export function administratorLoginServices(){return webAuthServices();}
export function webLoginConfiguration(){const services=webAuthServices();return {enabled:Boolean(services),emailDeliveryEnabled:true};}
