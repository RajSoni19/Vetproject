export const runtime='nodejs';
export function GET(){return Response.json({live:true},{headers:{'cache-control':'no-store'}});}
