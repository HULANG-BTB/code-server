"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Lint = require("tslint");
/**
 * Curly statement newlines rule.
 */
class Rule extends Lint.Rules.AbstractRule {
    /**
     * Apply the rule.
     */
    apply(sourceFile) {
        return this.applyWithWalker(new CurlyStatementNewlinesWalker(sourceFile, this.getOptions()));
    }
}
Rule.FAILURE_STRING = "Curly statements must separate with newlines";
exports.Rule = Rule;
/**
 * Curly statement newlines walker.
 */
class CurlyStatementNewlinesWalker extends Lint.RuleWalker {
    /**
     * Visit if statements.
     */
    visitIfStatement(node) {
        const splitLength = node.getFullText().trim().split("\n").length;
        if (splitLength <= 2) {
            this.addFailureAt(node.getStart(), node.getWidth(), Rule.FAILURE_STRING);
        }
        super.visitIfStatement(node);
    }
}
