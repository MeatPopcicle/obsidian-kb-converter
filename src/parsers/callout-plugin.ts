import { Plugin } from 'unified';
import { Root, Blockquote, Paragraph, Text } from 'mdast';
import { visit } from 'unist-util-visit';

/**
 * Custom mdast node type for Obsidian callouts
 */
export interface Callout {
	type: 'callout';
	calloutType: string;  // note, tip, warning, danger, info, question
	title: string | null;
	children: Array<Paragraph | Text>;
}

// Extend mdast types to include our custom callout node
declare module 'mdast' {
	interface RootContentMap {
		callout: Callout;
	}
}

/**
 * Remark plugin to transform Obsidian callouts into custom AST nodes
 *
 * Transforms:
 * > [!warning] Important Notice
 * > This is a warning callout.
 * > Multiple lines of content.
 *
 * Into a callout node with type, title, and children
 */
export const calloutPlugin: Plugin<[], Root> = () => {
	return (tree: Root) => {
		visit(tree, 'blockquote', (node: Blockquote, index, parent) => {
			if (!parent || index === undefined) return;

			// Check if this blockquote is a callout
			const firstChild = node.children[0];
			if (!firstChild || firstChild.type !== 'paragraph') return;

			const firstParagraph = firstChild as Paragraph;
			if (!firstParagraph.children.length) return;

			const firstTextNode = firstParagraph.children[0];
			if (firstTextNode.type !== 'text') return;

			const text = firstTextNode.value;

			// Match callout syntax: [!type] Optional Title
			const calloutMatch = text.match(/^\[!(\w+)\]\s*(.*)/);
			if (!calloutMatch) return;

			const calloutType = calloutMatch[1].toLowerCase();
			const title = calloutMatch[2] || null;

			// Extract content (everything after the callout marker)
			const contentChildren: Array<Paragraph> = [];

			// Handle remaining text in the first paragraph after the callout marker
			const remainingText = text.substring(calloutMatch[0].length).trim();
			const remainingInlineContent = firstParagraph.children.slice(1);

			if (remainingText || remainingInlineContent.length > 0) {
				const newParagraph: Paragraph = {
					type: 'paragraph',
					children: []
				};
				if (remainingText) {
					newParagraph.children.push({ type: 'text', value: remainingText });
				}
				newParagraph.children.push(...remainingInlineContent);
				if (newParagraph.children.length > 0) {
					contentChildren.push(newParagraph);
				}
			}

			// Add remaining blockquote children as content
			for (let i = 1; i < node.children.length; i++) {
				const child = node.children[i];
				if (child.type === 'paragraph') {
					contentChildren.push(child);
				}
			}

			// Create the callout node
			const calloutNode: Callout = {
				type: 'callout',
				calloutType,
				title,
				children: contentChildren
			};

			// Replace the blockquote with our callout node
			(parent.children as any[])[index] = calloutNode;
		});
	};
};
