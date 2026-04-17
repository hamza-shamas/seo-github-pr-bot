import type { Rule } from "../types";
import { robotsTxtRule } from "./robotsTxt";
import { sitemapXmlRule } from "./sitemapXml";
import { headTitleRule } from "./headTitle";
import { headDescriptionRule } from "./headDescription";
import { jsonLdRule } from "./jsonLd";

// Five-rule v1 set — covers the spec ("at least 3") with the lowest-risk,
// highest-signal checks. Other rule files (og-tags, heading-hierarchy,
// llms-txt) live in this folder and can be re-added by importing them
// here when we're ready to wire their fix generators.
export const RULES: Rule[] = [
  robotsTxtRule,
  sitemapXmlRule,
  headTitleRule,
  headDescriptionRule,
  jsonLdRule,
];
