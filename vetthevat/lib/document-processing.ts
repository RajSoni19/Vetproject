export type ProcessingRecord={state:string;inspection?:string|null;extraction?:string|null;inspection_job?:{state:string;attempts:number;lease_until?:string|null}|null;extraction_job?:{state:string;attempts:number;error_code?:string|null}|null;completed?:boolean};
export function documentProcessing(record:ProcessingRecord){
 if(record.state==='rejected')return {step:'Failed',message:'Security inspection rejected this file. Upload a safe replacement; this file cannot be reviewed.',error:true,retry:false};
 if(record.state==='missing')return {step:'Failed',message:'The original is unavailable. Ask your workspace administrator to check private storage.',error:true,retry:false};
 const scan=record.inspection_job,ocr=record.extraction_job;
 if((scan?.attempts??0)>=5&&scan?.state!=='completed'||(ocr?.attempts??0)>=5&&ocr?.state!=='completed')return {step:'Failed',message:'The processing retry limit was reached. An administrator must review this job before any further attempt.',error:true,retry:false};
 if(scan?.state==='failed'||ocr?.state==='failed'||record.extraction==='failed')return {step:'Failed',message:ocr?.error_code==='INVALID_DOCUMENT'?'OCR could not read this document. Upload a clearer, supported original.':'Secure processing failed. Check service availability and retry if this upload is eligible.',error:true,retry:ocr?.error_code!=='INVALID_DOCUMENT'&&ocr?.error_code!=='REVIEW_REQUIRED'};
 if(record.completed)return {step:'Completed',message:'The document has been reviewed and saved.',error:false,retry:false};
 if(record.state==='clean'&&record.extraction==='completed')return {step:'Ready for Review',message:'Security inspection and OCR are complete. Review extracted values before saving.',error:false,retry:false};
 if(record.state==='clean')return {step:'Extracting',message:'Security inspection passed. Product and invoice text extraction is queued or running.',error:false,retry:false};
 if(scan?.state==='processing')return {step:'Scanning',message:'The original is being inspected by the secure processing service.',error:false,retry:false};
 return {step:'Uploaded',message:record.inspection==='error'?'The scanner is waiting for a safe retry. Your original remains quarantined.':'The original is stored securely and waiting for security inspection.',error:false,retry:false};
}
