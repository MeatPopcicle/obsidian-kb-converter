import { Plugin } from 'unified';
import { Root, Text, Paragraph } from 'mdast';
import { visit } from 'unist-util-visit';

export interface WikiLinkOptions {
	mode: 'remove' | 'text';  // remove entirely or convert to plain text
}

/**
 * Remark plugin to handle Obsidian wiki-links
 *
 * Handles:
 * - [[page]] - simple wiki-link
 * - [[page|display text]] - wiki-link with alias
 * - ![[image.png]] - embedded images (handled separately)
 */
export const wikiLinkPlugin: Plugin<[WikiLinkOptions?], Root> = (options = { mode: 'remove' }) => {
	return (tree: Root) => {
		visit(tree, 'text', (node: Text, index, parent) => {
			if (!parent || index === undefined) return;

			const text = node.value;

			// Pattern for wiki-links (not image embeds)
			// Matches [[page]] or [[page|alias]]
			const wikiLinkPattern = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;

			let match;
			let lastIndex = 0;
			const newNodes: Text[] = [];
			let hasChanges = false;

			while ((match = wikiLinkPattern.exec(text)) !== null) {
				hasChanges = true;

				// Add text before the match
				if (match.index > lastIndex) {
					newNodes.push({
						type: 'text',
						value: text.substring(lastIndex, match.index)
					});
				}

				// Handle the wiki-link based on mode
				if (options.mode === 'text') {
					// Convert to plain text (use alias if present, otherwise page name)
					const displayText = match[2] || match[1];
					newNodes.push({
						type: 'text',
						value: displayText
					});
				}
				// If mode is 'remove', we don't add anything

				lastIndex = match.index + match[0].length;
			}

			// Add remaining text after last match
			if (hasChanges) {
				if (lastIndex < text.length) {
					newNodes.push({
						type: 'text',
						value: text.substring(lastIndex)
					});
				}

				// Replace the node with new nodes
				if (newNodes.length === 0) {
					// Remove the node entirely if nothing left
					(parent.children as any[]).splice(index, 1);
				} else if (newNodes.length === 1) {
					node.value = newNodes[0].value;
				} else {
					// Replace with multiple nodes
					(parent.children as any[]).splice(index, 1, ...newNodes);
				}
			}
		});
	};
};

/**
 * Resolve Obsidian image embeds to file references
 *
 * Transforms ![[image.png]] or ![[image.png|400]] to image info
 * Returns array of {filename, width?} objects found in text
 */
export function extractImageEmbeds(text: string): Array<{ filename: string; width?: number }> {
	const imagePattern = /!\[\[([^\]|]+)(?:\|(\d+))?\]\]/g;
	const images: Array<{ filename: string; width?: number }> = [];

	let match;
	while ((match = imagePattern.exec(text)) !== null) {
		images.push({
			filename: match[1],
			width: match[2] ? parseInt(match[2]) : undefined
		});
	}

	return images;
}
