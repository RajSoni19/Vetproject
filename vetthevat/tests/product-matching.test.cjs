const test=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {loadSource}=require('./load-source.cjs');
const {extractPackEvidence,normalizeProductText,suggestProductMatches}=loadSource('lib/server/procurement/product-matching');

const companyId=randomUUID(),otherCompanyId=randomUUID(),supplierId=randomUUID(),otherSupplierId=randomUUID(),productId=randomUUID(),otherProductId=randomUUID();
const product={id:productId,company_id:companyId,name:'Fresh Apples',variant:'Royal Gala Grade A',unit:'kg'};

test('normalized exact descriptions suggest one canonical product without auto-confirming',()=>{
 const suggestions=suggestProductMatches({companyId,line:{supplierId,description:'FRESH apples — Royal Gala Grade A'},products:[product,product],aliases:[]});
 assert.equal(normalizeProductText('Fresh Apples — Royal Gala Grade A'),'fresh apples royal gala grade a');
 assert.deepEqual(suggestions,[{productId,confidence:'exact normalized name',itemsPerPack:null,contentPerItem:null,unit:null}]);
});

test('supplier aliases for two suppliers converge on the same canonical product',()=>{
 const aliases=[
  {company_id:companyId,supplier_id:supplierId,description:'Apple 6 x 500 g',product_id:productId,items_per_pack:'6',content_per_item:'500',unit:'g'},
  {company_id:companyId,supplier_id:otherSupplierId,description:'Apple 6 x 500 g',product_id:productId,items_per_pack:'6',content_per_item:'500',unit:'g'},
 ];
 const first=suggestProductMatches({companyId,line:{supplierId,description:'Apple 6 x 500 g'},products:[product],aliases});
 const second=suggestProductMatches({companyId,line:{supplierId:otherSupplierId,description:'Apple 6 x 500 g'},products:[product],aliases});
 assert.equal(first[0].productId,productId);
 assert.equal(second[0].productId,productId);
 assert.equal(second[0].confidence,'exact supplier alias');
});

test('different pack sizes retain distinct conversions for the same product',()=>{
 const smaller=suggestProductMatches({companyId,line:{supplierId,description:'Fresh Apples Royal Gala Grade A 6 x 500 g'},products:[product],aliases:[]})[0];
 const larger=suggestProductMatches({companyId,line:{supplierId,description:'Fresh Apples Royal Gala Grade A 2 x 1 kg'},products:[product],aliases:[]})[0];
 assert.deepEqual(extractPackEvidence('6 x 500 g'),{itemsPerPack:'6',contentPerItem:'500',unit:'g'});
 assert.deepEqual(extractPackEvidence('2×1 kg'),{itemsPerPack:'2',contentPerItem:'1',unit:'kg'});
 assert.equal(smaller.productId,larger.productId);
 assert.deepEqual([smaller.itemsPerPack,smaller.contentPerItem,smaller.unit],['6','500','g']);
 assert.deepEqual([larger.itemsPerPack,larger.contentPerItem,larger.unit],['2','1','kg']);
});

test('different specifications, incompatible units, and foreign-company products are not merged',()=>{
 const candidates=suggestProductMatches({
  companyId,
  line:{supplierId,description:'Fresh Apples Royal Gala Grade B 6 x 500 g'},
  products:[
   product,
   {...product,id:otherProductId,variant:'Royal Gala Grade B'},
   {...product,id:randomUUID(),unit:'l'},
   {...product,id:randomUUID(),company_id:otherCompanyId,variant:'Royal Gala Grade B'},
  ],
  aliases:[{company_id:otherCompanyId,supplier_id:supplierId,description:'Fresh Apples Royal Gala Grade B 6 x 500 g',product_id:otherProductId,items_per_pack:'6',content_per_item:'500',unit:'g'}],
 });
 assert.deepEqual(candidates.map(candidate=>candidate.productId),[otherProductId]);
});

test('pack evidence supports liquid and each dimensions without guessing unknown packs',()=>{
 assert.deepEqual(extractPackEvidence('12 x 250 ml'),{itemsPerPack:'12',contentPerItem:'250',unit:'ml'});
 assert.deepEqual(extractPackEvidence('Pack of 6'),{itemsPerPack:'6',contentPerItem:null,unit:null});
 assert.equal(extractPackEvidence('assorted produce'),null);
});
