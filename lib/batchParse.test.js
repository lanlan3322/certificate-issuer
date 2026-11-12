const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const ts = require("typescript");

function load(file, dependencies = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync(`${__dirname}/${file}`, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function("require", "module", "exports", code)(
    (name) => dependencies[name] ?? require(name), module, module.exports
  );
  return module.exports;
}

const constants = load("constants.ts");
const certificate = load("certificate.ts", { "./trustvc": {}, "./constants": constants });
const { parseCSV, parseExcel, generateSampleCSV } = load("batchParse.ts", {
  "./certificate": certificate,
  "./constants": constants,
  "read-excel-file/browser": {
    default: async () => [
      ["recipientName", "recipientEmail", "certificateType", "description", "issueDate", "courseLength", "hasValidity"],
      ["Alice", "alice@example.com", "Professional Certificate", "Completed course", new Date("2026-11-12T00:00:00Z"), 40, false],
    ],
  },
});

test("downloaded CSV round-trips all issuing columns with dated, lifetime and default rows", () => {
  const csv = generateSampleCSV();
  assert.equal(csv.split("\n")[0], "recipientName,recipientEmail,certificateType,description,certificateNo,courseLength,issueDate,signedDate,hasValidity,validFrom,validUntil");
  const rows = parseCSV(csv);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map((row) => row.errors), [[], [], []]);
  assert.equal(rows[0].certificateNo, "FTA-001");
  assert.equal(rows[0].courseLength, 40);
  assert.equal(rows[0].hasValidity, true);
  assert.equal(rows[0].issueDate, rows[0].signedDate);
  assert.equal(rows[0].issueDate, rows[0].validFrom);
  assert.ok(rows[0].validUntil > rows[0].validFrom);
  assert.equal(rows[1].hasValidity, false);
  assert.equal(rows[1].validUntil, undefined);
  assert.equal(rows[2].hasValidity, undefined);
  assert.equal(rows[2].issueDate, undefined);
});

test("legacy CSV and quoted descriptions retain their values without overrides", () => {
  const [row] = parseCSV('recipientName,recipientEmail,certificateType,description\nAlice,alice@example.com,Professional Certificate,"Completed governance, risk and compliance"');
  assert.deepEqual(row.errors, []);
  assert.equal(row.description, "Completed governance, risk and compliance");
  for (const key of ["certificateNo", "courseLength", "issueDate", "signedDate", "hasValidity", "validFrom", "validUntil"]) {
    assert.equal(row[key], undefined);
  }
});

test("invalid optional values are reported before issuance", () => {
  const header = "recipientName,recipientEmail,certificateType,description,courseLength,issueDate,signedDate,hasValidity,validFrom,validUntil";
  for (const values of [
    "40 hours,2026-02-30,not-a-date,yes,2026-11-12,2026-11-11",
    "-1,2026-11-12,2026-11-12,true,2026-11-12,2026-11-11",
    "1.5,2026-11-12,2026-11-12,true,2026-11-12,2026-11-11",
  ]) {
    const [row] = parseCSV(`${header}\nAlice,alice@example.com,Professional Certificate,Completed course,${values}`);
    assert.ok(row.errors.some((error) => error.includes("Course length")));
    assert.ok(row.errors.some((error) => error.includes("Valid until")));
    if (values.startsWith("40 hours")) {
      assert.ok(row.errors.some((error) => error.includes("Issue date")));
      assert.ok(row.errors.some((error) => error.includes("Signed date")));
      assert.ok(row.errors.some((error) => error.includes("Has validity")));
    }
  }
});

test("Excel date cells, numeric course length and boolean validity use the same schema", async () => {
  const [row] = await parseExcel({});
  assert.deepEqual(row.errors, []);
  assert.equal(row.issueDate, "2026-11-12");
  assert.equal(row.courseLength, 40);
  assert.equal(row.hasValidity, false);
});
