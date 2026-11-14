const crypto = require("node:crypto");

const catalogVerifiedConstraints = new Set([
  "documents_object_version_check",
  "team_invitations_email_check"
]);
const dumpControlLine = /^\s*\\(?:un)?restrict(?:\s|$)/;

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  }
  return value;
}

function canonicalDump(sql, { verifiedConstraints = [] } = {}) {
  let lines = sql.replace(/\r\n/g, "\n").split("\n").filter(line => !dumpControlLine.test(line));
  const names = new Set(verifiedConstraints);
  if ([...names].some(name => !catalogVerifiedConstraints.has(name))) {
    throw new Error("Unapproved constraint formatting exception.");
  }
  for (const name of names) {
    const linePattern = new RegExp(`^\\s*CONSTRAINT ${name} CHECK \\(`);
    const matches = lines.reduce((found, line, index) => {
      if (linePattern.test(line.trim())) found.push(index);
      return found;
    }, []);
    if (matches.length !== 1) throw new Error(`Expected exactly one catalog-verified ${name} statement.`);
    lines = lines.filter((_, index) => index !== matches[0]);
  }
  return lines.join("\n");
}

function effectiveAcl(rows) {
  return rows.map(row => ({
    object: row.object.startsWith("database:") ? "database:<current>" : row.object,
    grantor: row.grantor,
    grantee: row.grantee,
    privilege: row.privilege,
    grantable: row.grantable === true
  })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

function firstDifference(expected, actual) {
  if (JSON.stringify(stable(expected)) === JSON.stringify(stable(actual))) return null;
  const expectedArray = Array.isArray(expected) ? expected : [expected];
  const actualArray = Array.isArray(actual) ? actual : [actual];
  const length = Math.max(expectedArray.length, actualArray.length);
  for (let index = 0; index < length; index++) {
    if (JSON.stringify(stable(expectedArray[index])) !== JSON.stringify(stable(actualArray[index]))) {
      return { index, expected: expectedArray[index] ?? null, actual: actualArray[index] ?? null };
    }
  }
  return { expected, actual };
}

function compareSnapshots(source, restored, verifiedConstraints = []) {
  const schemaSource = canonicalDump(source.schemaDump, { verifiedConstraints });
  const schemaRestored = canonicalDump(restored.schemaDump, { verifiedConstraints });
  const checks = {
    schema: schemaSource === schemaRestored ? null : firstDifference(schemaSource.split("\n"), schemaRestored.split("\n")),
    database: firstDifference(source.database, restored.database),
    extensions: firstDifference(source.extensions, restored.extensions),
    tables: firstDifference(source.tables, restored.tables),
    relations: firstDifference(source.relations, restored.relations),
    schemas: firstDifference(source.schemas, restored.schemas),
    routines: firstDifference(source.routines, restored.routines),
    constraints: firstDifference(source.constraints, restored.constraints),
    policies: firstDifference(source.policies, restored.policies),
    triggers: firstDifference(source.triggers, restored.triggers),
    effectiveAcls: firstDifference(effectiveAcl(source.effectiveAcls), effectiveAcl(restored.effectiveAcls)),
    roles: firstDifference(source.roles, restored.roles)
  };
  return { pass: Object.values(checks).every(value => value === null), checks };
}

function catalogConstraintsEquivalent(source, restored) {
  const constraints = [...catalogVerifiedConstraints];
  return constraints.every(name => {
    const matches = snapshot => snapshot.constraints.filter(row => row.name === name && row.type === "c");
    const left = matches(source);
    const right = matches(restored);
    return left.length === 1 && right.length === 1 &&
      JSON.stringify(stable(left[0])) === JSON.stringify(stable(right[0]));
  });
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

module.exports = {
  canonicalDump,
  catalogConstraintsEquivalent,
  compareSnapshots,
  effectiveAcl,
  sha256
};
