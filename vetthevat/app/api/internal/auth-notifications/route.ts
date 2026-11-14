import {authNotificationHandler} from "@/lib/server/web-auth/notifications";
import {webAuthServices} from "@/lib/server/web-auth/runtime";
export const runtime="nodejs";
export async function POST(request:Request){return authNotificationHandler(request,webAuthServices());}
