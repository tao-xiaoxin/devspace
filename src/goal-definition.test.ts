import assert from "node:assert/strict";
import {
  normalizeGoalDefinition,
  parseGoalDefinition,
  serializeGoalDefinition,
} from "./goal-definition.js";

const normalized = normalizeGoalDefinition({
  objective: " Ship lightweight goal flow ",
  scope: {
    in: [" goal tools ", " resolve_skill "],
    out: [" dashboards ", ""],
  },
  verification: [" npm test ", " npm run typecheck "],
  stopConditions: [" Need product clarification "],
});

assert.deepEqual(normalized, {
  objective: "Ship lightweight goal flow",
  scope: {
    in: ["goal tools", "resolve_skill"],
    out: ["dashboards"],
  },
  verification: ["npm test", "npm run typecheck"],
  stopConditions: ["Need product clarification"],
});

const serialized = serializeGoalDefinition(normalized);
const parsed = parseGoalDefinition(serialized);
assert.equal(parsed.legacy, false);
assert.deepEqual(parsed.definition, normalized);

const legacy = parseGoalDefinition("Ship the feature");
assert.equal(legacy.legacy, true);
assert.deepEqual(legacy.definition, {
  objective: "Ship the feature",
});
