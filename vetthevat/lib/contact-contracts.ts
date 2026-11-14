export const enquiryCategories=["VAT management","ORS","Account support","Other"] as const;
export class ContactValidationError extends Error {readonly fields:Record<string,string>;constructor(fields:Record<string,string>){super("Please check the highlighted fields.");this.fields=fields;}}
export function validateContact(value:unknown){
 const fields:Record<string,string>={};if(!value||typeof value!=="object"||Array.isArray(value))throw new ContactValidationError({form:"Invalid contact form."});
 const v=value as Record<string,unknown>;if(Object.keys(v).some(k=>!["fullName","businessName","email","category","message","consent"].includes(k)))throw new ContactValidationError({form:"Unexpected contact fields."});
 const field=(key:string,label:string,max:number)=>{const raw=v[key],text=typeof raw==="string"?raw.normalize("NFKC").trim():"";if(!text||text.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text))fields[key]=`${label} is required and must be at most ${max} characters.`;return text;};
 const fullName=field("fullName","Full name",120),businessName=field("businessName","Business name",200),email=field("email","Email",254).toLowerCase(),message=field("message","Message",5000);
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))fields.email="Enter a valid email address.";
 if(!enquiryCategories.includes(v.category as typeof enquiryCategories[number]))fields.category="Select an enquiry category.";if(v.consent!==true)fields.consent="Consent is required so we can respond to your enquiry.";
 if(Object.keys(fields).length)throw new ContactValidationError(fields);
 return {fullName,businessName,email,category:v.category as typeof enquiryCategories[number],message,consent:true as const};
}
