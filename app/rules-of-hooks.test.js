const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

// Regression for React error #310 on "/": hooks called after an early return
// in a component render a different number of hooks once auth loading ends.
test("client pages and components never call hooks conditionally", async () => {
  const { ESLint } = require("eslint");
  const hooks = require("eslint-plugin-react-hooks");
  const tseslint = require("typescript-eslint");
  const eslint = new ESLint({
    cwd: path.resolve(__dirname, ".."),
    overrideConfigFile: true,
    overrideConfig: [{
      files: ["**/*.tsx"],
      languageOptions: { parser: tseslint.parser, parserOptions: { ecmaFeatures: { jsx: true } } },
      plugins: { "react-hooks": hooks },
      rules: { "react-hooks/rules-of-hooks": "error" },
    }],
  });
  const results = await eslint.lintFiles(["app/**/*.tsx", "components/**/*.tsx"]);
  const violations = results.flatMap((result) => result.messages
    .filter((message) => message.ruleId === "react-hooks/rules-of-hooks")
    .map((message) => `${path.relative(process.cwd(), result.filePath)}:${message.line} ${message.message}`));
  assert.deepEqual(violations, []);
});
