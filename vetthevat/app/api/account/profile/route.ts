import {webAuthHandler} from "@/lib/server/web-auth/http";
import {webAuthServices} from "@/lib/server/web-auth/runtime";

export const runtime="nodejs";
export async function GET(request:Request){return webAuthHandler(request,webAuthServices());}
export async function PUT(request:Request){return webAuthHandler(request,webAuthServices());}
