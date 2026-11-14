const test = require('node:test');
const assert = require('node:assert/strict');
const {loadSource} = require('./load-source.cjs');
const {activeWorkspaceRoute,workspaceNavigation,workspaceBreadcrumb} = loadSource('lib/workspace-navigation');
test('invoice subroutes activate one most-specific navigation entry', () => {
  for (const [route, expected] of [['/app/invoices','/app/invoices'],['/app/invoices/upload','/app/invoices/upload'],['/app/invoices/new','/app/invoices/new'],['/app/invoices/synthetic-id','/app/invoices']]) {
    assert.equal(activeWorkspaceRoute(route),expected);
    assert.equal(workspaceNavigation.filter(item=>item.href===activeWorkspaceRoute(route)).length,1);
  }
  assert.equal(activeWorkspaceRoute('/app/invoices-unrelated'),undefined);
  assert.equal(activeWorkspaceRoute('/app/admin'),undefined);
  assert.equal(workspaceBreadcrumb('/app/invoices/synthetic-id'),'Invoice details');
});
