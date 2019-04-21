"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ts = require("typescript");
const Lint = require("tslint");
/**
 * Rule for disallowing blank lines around the content of blocks.
 */
class Rule extends Lint.Rules.AbstractRule {
    /**
     * Apply the rule.
     */
    apply(sourceFile) {
        return this.applyWithWalker(new NoBlockPaddingWalker(sourceFile, this.getOptions()));
    }
}
Rule.BEFORE_FAILURE_STRING = "Blocks must not start with blank lines";
Rule.AFTER_FAILURE_STRING = "Blocks must not end with blank lines";
exports.Rule = Rule;
/**
 * Walker for checking block padding.
 */
class NoBlockPaddingWalker extends Lint.RuleWalker {
    /**
     * Apply this rule to interfaces.
     */
    visitInterfaceDeclaration(node) {
        this.visitBlockNode(node);
        super.visitInterfaceDeclaration(node);
    }
    /**
     * Apply this rule to classes.
     */
    visitClassDeclaration(node) {
        this.visitBlockNode(node);
        super.visitClassDeclaration(node);
    }
    /**
     * Add failures to blank lines surrounding a block's content.
     */
    visitBlockNode(node) {
        const sourceFile = node.getSourceFile();
        const children = node.getChildren();
        const openBraceIndex = children.findIndex((n) => n.kind === ts.SyntaxKind.OpenBraceToken);
        if (openBraceIndex !== -1) {
            const nextToken = children[openBraceIndex + 1];
            if (nextToken) {
                const startLine = this.getStartIncludingComments(sourceFile, nextToken);
                const openBraceToken = children[openBraceIndex];
                if (ts.getLineAndCharacterOfPosition(sourceFile, openBraceToken.getEnd()).line + 1 < startLine) {
                    this.addFailureAt(openBraceToken.getEnd(), openBraceToken.getEnd(), Rule.BEFORE_FAILURE_STRING);
                }
            }
        }
        const closeBraceIndex = children.findIndex((n) => n.kind === ts.SyntaxKind.CloseBraceToken);
        if (closeBraceIndex >= 2) {
            const previousToken = children[closeBraceIndex - 1];
            if (previousToken) {
                let endLine = ts.getLineAndCharacterOfPosition(sourceFile, previousToken.getEnd()).line;
                const closeBraceToken = children[closeBraceIndex];
                if (this.getStartIncludingComments(sourceFile, closeBraceToken) > endLine + 1) {
                    this.addFailureAt(closeBraceToken.getStart(), closeBraceToken.getStart(), Rule.AFTER_FAILURE_STRING);
                }
            }
        }
    }
    /**
     * getStart() doesn't account for comments while this does.
     */
    getStartIncludingComments(sourceFile, node) {
        // This gets the line the node starts on without counting comments.
        let startLine = ts.getLineAndCharacterOfPosition(sourceFile, node.getStart()).line;
        // Adjust the start line for the comments.
        const comments = ts.getLeadingCommentRanges(sourceFile.text, node.pos) || [];
        comments.forEach((c) => {
            const commentStartLine = ts.getLineAndCharacterOfPosition(sourceFile, c.pos).line;
            if (commentStartLine < startLine) {
                startLine = commentStartLine;
            }
        });
        return startLine;
    }
}
