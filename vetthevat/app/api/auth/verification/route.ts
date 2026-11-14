import {webAuthHandler} from "@/lib/server/web-auth/http";
import {webAuthServices} from "@/lib/server/web-auth/runtime";
export const runtime="nodejs";
export async function POST(request:Request){return webAuthHandler(request,webAuthServices());}
