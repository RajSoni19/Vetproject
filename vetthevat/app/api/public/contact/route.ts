import {contactHandler,contactRuntime} from "@/lib/server/contact";

export const runtime="nodejs";

// Enquiries are accepted only when they can actually be stored and delivered.
// Without a configured contact store, say so: never confirm an enquiry that
// would be discarded.
export async function POST(request:Request){
  const configured=contactRuntime();
  if(configured)return contactHandler(configured)(request);
  return Response.json(
    {error:{code:"UNAVAILABLE",message:"Online enquiries are temporarily unavailable. Please email vetthevat@gmail.com or call 07306 361031."}},
    {status:503,headers:{"cache-control":"no-store","retry-after":"300"}}
  );
}

export async function GET(){return new Response(null,{status:405,headers:{allow:"POST","cache-control":"no-store"}});}
