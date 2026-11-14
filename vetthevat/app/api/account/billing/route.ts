import {webAuthHandler} from "@/lib/server/web-auth/http";
import {webAuthServices} from "@/lib/server/web-auth/runtime";
export const runtime="nodejs";
export function GET(request:Request){return webAuthHandler(request,webAuthServices());}
export function POST(request:Request){return webAuthHandler(request,webAuthServices());}
