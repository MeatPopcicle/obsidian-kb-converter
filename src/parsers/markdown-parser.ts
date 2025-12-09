import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import { Root } from 'mdast';
import { calloutPlugin } from './callout-plugin';
import { wikiLinkPlugin } from '../utils/wiki-link-remover';

export interface ParseOptions {
	removeWikiLinks?: boolean;
	convertWikiLinksToText?: boolean;
}

/**
 * Parse markdown content into an AST using remark
 */
export function parseMarkdown(content: string, options: ParseOptions = {}): Root {
	let processor = unified()
		.use(remarkParse)
		.use(remarkGfm)  // Tables, strikethrough, tasklists, autolinks
		.use(calloutPlugin);  // Obsidian callouts

	// Handle wiki-links based on options
	if (options.removeWikiLinks) {
		processor = processor.use(wikiLinkPlugin, { mode: 'remove' });
	} else if (options.convertWikiLinksToText) {
		processor = processor.use(wikiLinkPlugin, { mode: 'text' });
	}

	const tree = processor.parse(content);

	// Run transformers
	const result = processor.runSync(tree);

	return result as Root;
}
