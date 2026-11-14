const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

function catalog(){
 const source=fs.readFileSync('lib/i18n/catalog.ts','utf8');
 const compiled=require('sucrase').transform(source,{transforms:['typescript','imports']}).code,exports={};
 vm.runInNewContext(compiled,{Intl,exports});
 return exports;
}

test('listed locale messages are valid subsets and coverage labels remain honest',()=>{
 const {locales,messages}=catalog(),keys=Object.keys(messages['en-GB']).sort();
 assert.equal(locales.length,12);
 for(const locale of locales){assert.ok(Object.keys(messages[locale.code]).every(key=>keys.includes(key)),`${locale.code} has an unknown key`);assert.ok(locale.code==='en-GB'?locale.support==='complete':locale.support==='partial');}
});

test('authenticated workspace session controls are localized in the five supported languages',()=>{
 const {message}=catalog();
 for(const key of ['authenticatedSecureWorkspace','authenticatedSignOut','authenticatedSigningOut','authenticatedSignOutError','authenticatedSessionVerifyError','authenticatedSessionConnectionError']){
  for(const locale of ['hi-IN','gu-IN','es-ES','ar'])assert.notEqual(message(locale,key),message('en-GB',key),`${locale}.${key} should be translated`);
 }
 assert.equal(message('en-GB','authenticatedSignOut'),'Sign out');
});

test('analytics and ORS shopping labels are translated for Hindi, Gujarati, Spanish and Arabic with English fallback elsewhere',()=>{
 const {message,messages}=catalog(),keys=Object.keys(messages['en-GB']).filter(key=>(key.startsWith('analytics')||key.startsWith('filter')||key.startsWith('direction')||key.startsWith('tab')||key.startsWith('ors')||key.startsWith('opsOrs')||key.startsWith('vat')||key.startsWith('report')||key.startsWith('nav')||key.startsWith('overview')||key.startsWith('audit')||key.startsWith('auth')||key.startsWith('onboarding')||key.startsWith('doc')||key.startsWith('support')||key.startsWith('manual')||key.startsWith('detail')||key.startsWith('shell')||key.startsWith('team')||key.startsWith('accountProfile')||key.startsWith('security'))&&!['tabOrs','tabVat','orsPriorityNormal','orsMaterial','opsOrsFieldSku','analyticsTableVat','vatAmount','reportVat','overviewActor','onboardingNo','supportTopicVat','detailOcr','detailDocumentBytes'].includes(key));
 for(const locale of ['hi-IN','gu-IN','es-ES','ar'])for(const key of keys)assert.notEqual(message(locale,key),message('en-GB',key),`${locale}.${key} should be translated`);
 assert.equal(message('fr-FR','analyticsTitle'),message('en-GB','analyticsTitle'));
});

test('locale fallback, RTL direction and numeric formatting preserve source values',()=>{
 const {message,localeDirection,formatCurrency,formatNumber,messages}=catalog();
 assert.equal(message('ar','language'),messages.ar.language);
 assert.equal(localeDirection('ar'),'rtl');
 assert.equal(localeDirection('ur-PK'),'rtl');
 assert.equal(localeDirection('hi-IN'),'ltr');
 assert.equal(formatNumber(1234.5,'en-GB'),new Intl.NumberFormat('en-GB').format(1234.5));
 assert.equal(formatCurrency(123.45,'GBP','en-GB'),new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(123.45));
});

test('currency strings keep exact source decimals while localizing analytics values and date-only records',()=>{
 const {formatCurrencyString,formatDate}=catalog();
 assert.equal(formatCurrencyString('1234.50','GBP','en-GB'),'£1,234.50');
 assert.equal(formatCurrencyString('-0.01','EUR','de-DE'),new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR'}).format(-0.01));
 assert.equal(formatCurrencyString('123456789012345.67','GBP','en-GB'),'£123,456,789,012,345.67');
 assert.equal(formatCurrencyString('1.234','GBP','de-DE'),'1.234');
 assert.equal(formatDate('2026-01-01','en-GB',{dateStyle:'short'}),new Intl.DateTimeFormat('en-GB',{dateStyle:'short'}).format(new Date('2026-01-01T12:00:00')));
});

test('global locale choice persists independently of workspace form and company state',()=>{
 const provider=fs.readFileSync('components/locale-provider.tsx','utf8');
 assert.match(provider,/localStorage\.setItem\(storageKey,\s*next\)/);
 assert.match(provider,/vtv_locale=.*SameSite=Lax/);
 assert.doesNotMatch(provider,/selectedCompany|companyId|cart|form\.reset/);
 assert.match(provider,/syncAccountLocale/);
 assert.match(provider,/preferredLocale/);
 assert.match(provider,/x-csrf-token/);
 assert.match(provider,/sequenceAtStart=writeSequence\.current/);
 assert.match(provider,/queueAccountPreference\(chosenLocale\.current,writeSequence\.current\)/);
 const auth=fs.readFileSync('components/authenticated-session.tsx','utf8');assert.match(auth,/syncAccountLocale\(\)/);
 assert.match(auth,/then\(synced=>\{if\(!synced\)localeSyncStarted\.current=false;\}\)/);
});

test('authenticated VAT and invoice reports use the translated company-scoped routes',()=>{
 const shell=fs.readFileSync('components/server-workspace.tsx','utf8'),vat=fs.readFileSync('components/server-vat-overview.tsx','utf8'),reports=fs.readFileSync('components/server-reports.tsx','utf8'),legacy=fs.readFileSync('app/app/vat/page.tsx','utf8');
 assert.match(shell,/manualEnabled&&path==='\/app\/vat'.*<ServerVatOverview/);
 assert.match(vat,/businessData\(companyId,"vat-report\?/);
 assert.match(vat,/formatCurrency\(/);
 assert.match(reports,/useLocale\(/);
 assert.match(reports,/formatCurrency\(/);
 assert.doesNotMatch(legacy,/useAppState|buildVatReport/);
});

test('analytics dashboard localizes exact decimal currency strings and date-only records',()=>{
 const source=fs.readFileSync('components/server-analytics.tsx','utf8'),chart=fs.readFileSync('components/analytics-chart.tsx','utf8');
 assert.match(source,/formatCurrencyString/);assert.match(source,/formatDate\(String\(r\[k\]\),locale/);assert.match(source,/currency=\{data\.filters\.currency\}/);assert.match(chart,/formatCurrencyString\(row\.value,currency,locale\)/);
});

test('authenticated support UI is localized while keeping the company-scoped PostgreSQL API',()=>{
 const source=fs.readFileSync('components/server-support.tsx','utf8');
 assert.match(source,/useLocale\(/);
 assert.match(source,/\/api\/account\/support/);
 assert.match(source,/x-company-id/);
 assert.match(source,/supportCreateTicket/);
 assert.match(source,/supportSaved/);
 assert.match(source,/formatDate\(message\.created_at,locale/);
});

test('manual VAT, invoice and contact screens use localized labels and locale-aware currency formatting',()=>{
 const source=fs.readFileSync('components/manual-invoice-workspace.tsx','utf8');
 assert.match(source,/useLocale\(/);
 assert.match(source,/formatCurrency\(/);
 assert.match(source,/manualInvoiceNumber/);
 assert.match(source,/manualAddLine/);
 assert.match(source,/manualCompanyInvoices/);
 assert.match(source,/api\('invoices\?/);
 assert.match(source,/api\('contacts/);
 assert.match(source,/contactOptionAfter/);
 assert.match(source,/loadMoreInvoiceContacts/);
 assert.match(source,/manualLoadMoreSuppliers/);
 assert.match(source,/manualLoadMoreCustomers/);
});

test('authenticated record detail uses translated company records and clean-only document retrieval',()=>{
 const source=fs.readFileSync('components/server-record-details.tsx','utf8');
 assert.match(source,/useLocale\(/);
 assert.match(source,/businessData\(companyId/);
 assert.match(source,/value\.state==='clean'/);
 assert.match(source,/value\.state!=='clean'/);
 assert.match(source,/formatCurrency\(/);
 assert.match(source,/detailRevisionHistory/);
});

test('invoice attachment and OCR controls use localized copy while keeping the authenticated document API',()=>{
 const source=fs.readFileSync('components/server-invoice-documents.tsx','utf8');
 assert.match(source,/useLocale\(/);assert.match(source,/api\('invoices\/'.*\/attachments/);assert.match(source,/api\('documents\/'.*\/extraction/);assert.match(source,/x-company-id/);assert.match(source,/x-csrf-token/);assert.match(source,/idempotency-key/);assert.match(source,/invoiceDocumentTitle/);assert.match(source,/invoiceDocumentNote/);assert.match(source,/invoiceDocumentAttached/);
 const {message}=catalog();for(const locale of ['hi-IN','gu-IN','es-ES','ar'])for(const key of ['invoiceDocumentTitle','invoiceDocumentNote','invoiceDocumentAttach','invoiceDocumentOcrPending','invoiceDocumentOperationFailed'])assert.notEqual(message(locale,key),message('en-GB',key),`${locale}.${key} should be translated`);
});

test('authenticated workspace shell localizes company switching and keeps its authorized selector flow',()=>{
 const source=fs.readFileSync('components/server-workspace.tsx','utf8');
 assert.match(source,/useLocale\(/);
 assert.match(source,/api\/account\/company-selection/);
 assert.match(source,/shellMembershipScope/);
 assert.match(source,/shellCompanySaved/);
 assert.match(source,/shellSelectAuthorizedCompany/);
 assert.match(source,/teamRole"\+company\.role/);
 assert.doesNotMatch(source,/\{company\.role\}/);
 assert.match(source,/shellSelectCompanyRecords/);
 assert.doesNotMatch(source,/Select a company to open reports/);
});

test('ORS operations headings, forms and actions use complete Hindi, Gujarati, Spanish and Arabic catalogue entries',()=>{
 const source=fs.readFileSync('components/ors-workspace.tsx','utf8');
 assert.match(source,/opsOrsFormCounterparty/);
 assert.match(source,/opsOrsFormRequisition/);
 assert.match(source,/opsOrsApprove/);
 assert.match(source,/opsOrsRecordReturn/);
 assert.match(source,/t\("opsOrsNoRecords"\)/);
 assert.match(source,/opsFieldKeys\[label\]\?t\(opsFieldKeys\[label\]\)/);
 assert.match(source,/columnKeys\[c\]\?t\(columnKeys\[c\]\)/);
 assert.match(source,/stateKeys\[value\.toLowerCase\(\)\]\)return t\(stateKeys\[value\.toLowerCase\(\)\]\)/);
 assert.match(source,/opsOrsSavedRefreshFailed/);
 assert.match(source,/opsOrsSessionExpired/);
});

test('team workspace uses authenticated membership APIs instead of browser-local role records',()=>{
 const source=fs.readFileSync('components/server-team-workspace.tsx','utf8'),page=fs.readFileSync('app/app/team/page.tsx','utf8');
 assert.match(page,/ServerTeamWorkspace/);assert.match(source,/api\/account\/companies/);assert.match(source,/api\/account\/team\?companyId=/);assert.match(source,/api\/auth\/session/);assert.match(source,/x-csrf-token/);assert.match(source,/idempotency-key/);assert.match(source,/action:"accept"/);assert.match(source,/action:"invite"/);assert.match(source,/action:"revoke"/);assert.match(source,/action:"change"/);assert.match(source,/role==="Owner"/);assert.doesNotMatch(source,/saveTeamMember|localStorage/);
 const {message}=catalog();for(const locale of ['hi-IN','gu-IN','es-ES','ar'])for(const key of ['teamTitle','teamInviteAction','teamInvitationAccepted','teamSchemaUnavailable','teamRoleOwner','teamRoleProcurement'])assert.notEqual(message(locale,key),message('en-GB',key),`${locale}.${key} should be translated`);
});

test('team invitation links land on a public sign-in continuation before authenticated acceptance',()=>{
 const landing=fs.readFileSync('components/team-invitation-landing.tsx','utf8'),page=fs.readFileSync('app/team-invitation/page.tsx','utf8'),service=fs.readFileSync('lib/server/saas/team.ts','utf8');assert.match(service,/\/team-invitation\?invitation=/);assert.match(page,/referrer:"no-referrer"/);assert.match(page,/\^\[A-Za-z0-9_-\]\{43\}\$/);assert.match(landing,/window\.history\.replaceState/);assert.match(landing,/api\/auth\/session/);assert.match(landing,/action:"accept"/);assert.match(landing,/api\/account\/company-selection/);assert.match(landing,/x-csrf-token/);assert.match(landing,/onSignedIn/);assert.match(landing,/teamInvitationLoginHelp/);assert.match(landing,/teamInvitationSelectionFailed/);
});

test('account profile edits use the authenticated PostgreSQL profile API and localized states',()=>{
 const source=fs.readFileSync('components/account-profile.tsx','utf8');assert.match(source,/api\/account\/profile/);assert.match(source,/api\/auth\/session/);assert.match(source,/x-csrf-token/);assert.match(source,/body:JSON\.stringify\(\{fullName:name\}\)/);assert.match(source,/accountProfileEditingUnavailable/);assert.doesNotMatch(source,/saveSettings|localStorage/);
 const {message}=catalog();for(const locale of ['hi-IN','gu-IN','es-ES','ar'])for(const key of ['accountProfileTitle','accountProfileFullName','accountProfileVerified','accountProfileSaveFailed'])assert.notEqual(message(locale,key),message('en-GB',key),`${locale}.${key} should be translated`);
});

test('password and session controls retain CSRF protection and use locale-aware security states',()=>{
 const password=fs.readFileSync('components/password-change.tsx','utf8'),sessions=fs.readFileSync('components/web-sessions.tsx','utf8');assert.match(password,/api\/auth\/change-password/);assert.match(password,/x-csrf-token/);assert.match(password,/currentPassword,newPassword/);assert.match(password,/securityPasswordMismatch/);assert.match(sessions,/api\/auth\/sessions/);assert.match(sessions,/api\/auth\/revoke-session/);assert.match(sessions,/x-csrf-token/);assert.match(sessions,/formatDate\(row\.created_at,locale/);assert.match(sessions,/disabled=\{busy!==""\}/);
 const {message}=catalog();for(const locale of ['hi-IN','gu-IN','es-ES','ar'])for(const key of ['securityChangePassword','securityPasswordMismatch','securitySessionsTitle','securitySessionRevokeFailed'])assert.notEqual(message(locale,key),message('en-GB',key),`${locale}.${key} should be translated`);
});

test('settings route delegates exclusively to the authenticated PostgreSQL account and security workspace',()=>{
 const page=fs.readFileSync('app/app/settings/page.tsx','utf8'),shell=fs.readFileSync('components/server-workspace.tsx','utf8');
 assert.doesNotMatch(page,/useAppState|saveSettings|saveCompany|localStorage/);assert.match(shell,/const account=path==='\/app\/settings'/);assert.match(shell,/account\?<div className="grid gap-6"><AccountProfile\/>/);assert.match(shell,/<WebSessions\/>/);assert.match(shell,/<PasswordChange\/>/);
});

test('company detail route uses authorized PostgreSQL context and selection instead of browser-local edit/archive actions',()=>{
 const component=fs.readFileSync('components/server-company-details.tsx','utf8'),shell=fs.readFileSync('components/server-workspace.tsx','utf8'),page=fs.readFileSync('app/app/companies/[id]/page.tsx','utf8');assert.match(shell,/companyDetail\?\u003cServerCompanyDetails/);assert.match(component,/api\/account\/company-context\?companyId=/);assert.match(component,/api\/account\/company-selection/);assert.match(component,/x-csrf-token/);assert.match(component,/companyWorkspaceLimits/);assert.doesNotMatch(component,/saveCompany|archive|localStorage/);assert.doesNotMatch(page,/useAppState|saveCompany|Archive company/);
 const {message}=catalog();for(const locale of ['hi-IN','gu-IN','es-ES','ar'])for(const key of ['companyWorkspaceTitle','companyWorkspaceRole','companyWorkspaceSelect','companyWorkspaceLimits'])assert.notEqual(message(locale,key),message('en-GB',key),`${locale}.${key} should be translated`);
});

test('company management lists authorized memberships from the account API and links to secure details',()=>{
 const source=fs.readFileSync('components/server-company-onboarding.tsx','utf8');assert.match(source,/api\/account\/companies/);assert.match(source,/setCompanies\(Array\.isArray\(body\.companies\)/);assert.match(source,/companies\.map\(company/);assert.match(source,/\/app\/companies\/"\+encodeURIComponent\(company\.id\)/);assert.match(source,/companyWorkspaceYourCompanies/);assert.doesNotMatch(source,/useAppState|localStorage|saveCompany/);assert.doesNotMatch(source,/onboardingBillingAccount.{0,80}account\.id/);assert.doesNotMatch(source,/onboardingPendingSubscription.{0,100}account\.id/);
 const {message}=catalog();for(const locale of ['hi-IN','gu-IN','es-ES','ar'])for(const key of ['companyWorkspaceYourCompanies','companyWorkspaceOpen','companyWorkspaceNoCompanies'])assert.notEqual(message(locale,key),message('en-GB',key),`${locale}.${key} should be translated`);
});
