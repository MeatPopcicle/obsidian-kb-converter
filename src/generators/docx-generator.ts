import {
	Document,
	Packer,
	Paragraph,
	TextRun,
	HeadingLevel,
	Table,
	TableRow,
	TableCell,
	WidthType,
	AlignmentType,
	BorderStyle,
	ShadingType,
	ImageRun,
	convertInchesToTwip,
	IImageOptions,
	IStylesOptions
} from 'docx';

// Company template styles (from company-reference.docx)
const COMPANY_STYLES = {
	// Fonts
	bodyFont: 'Tenorite',
	codeFont: 'Consolas',

	// Sizes (in half-points, so 22 = 11pt)
	bodySize: 22,
	heading1Size: 32,  // 16pt
	heading2Size: 28,  // 14pt
	heading3Size: 24,  // 12pt
	heading4Size: 24,  // 12pt
	heading5Size: 24,  // 12pt
	heading6Size: 24,  // 12pt

	// Colors
	headingColor: '4F81BD',  // Blue accent
	bodyColor: '000000',     // Black
	linkColor: '4F81BD',     // Blue accent
};
import { Root, Content, Paragraph as MdParagraph, Heading, Text, Strong, Emphasis, InlineCode, Code, List, ListItem, Table as MdTable, TableRow as MdTableRow, TableCell as MdTableCell, Image, Link } from 'mdast';
import { Callout } from '../parsers/callout-plugin';
import { KBConverterSettings } from '../settings';
import { createCalloutParagraphs } from './callout-styles';
import { createStyledTable } from './table-styles';
import { createCodeBlock } from './code-styles';

export interface ImageResolver {
	resolve(filename: string): Promise<{ buffer: ArrayBuffer; width?: number; height?: number } | null>;
}

export class DocxGenerator {
	private children: (Paragraph | Table)[] = [];
	private settings: KBConverterSettings;
	private imageResolver: ImageResolver | null;
	private numbering: any[] = [];
	private currentListId = 0;
	private skipNextList = false;  // Flag to skip TOC list

	constructor(settings: KBConverterSettings, imageResolver: ImageResolver | null = null) {
		this.settings = settings;
		this.imageResolver = imageResolver;
	}

	async generate(ast: Root): Promise<ArrayBuffer> {
		this.children = [];
		this.skipNextList = false;

		// Process all top-level nodes
		for (const node of ast.children) {
			await this.processNode(node);
		}

		const doc = new Document({
			styles: {
				default: {
					document: {
						run: {
							font: COMPANY_STYLES.bodyFont,
							size: COMPANY_STYLES.bodySize,
							color: COMPANY_STYLES.bodyColor
						}
					},
					heading1: {
						run: {
							font: COMPANY_STYLES.bodyFont,
							size: COMPANY_STYLES.heading1Size,
							bold: true,
							color: COMPANY_STYLES.headingColor
						},
						paragraph: {
							spacing: { before: 480, after: 120 }
						}
					},
					heading2: {
						run: {
							font: COMPANY_STYLES.bodyFont,
							size: COMPANY_STYLES.heading2Size,
							bold: true,
							color: COMPANY_STYLES.headingColor
						},
						paragraph: {
							spacing: { before: 200, after: 120 }
						}
					},
					heading3: {
						run: {
							font: COMPANY_STYLES.bodyFont,
							size: COMPANY_STYLES.heading3Size,
							bold: true,
							color: COMPANY_STYLES.headingColor
						},
						paragraph: {
							spacing: { before: 200, after: 120 }
						}
					},
					heading4: {
						run: {
							font: COMPANY_STYLES.bodyFont,
							size: COMPANY_STYLES.heading4Size,
							italics: true,
							color: COMPANY_STYLES.headingColor
						},
						paragraph: {
							spacing: { before: 200, after: 120 }
						}
					},
					heading5: {
						run: {
							font: COMPANY_STYLES.bodyFont,
							size: COMPANY_STYLES.heading5Size,
							color: COMPANY_STYLES.headingColor
						},
						paragraph: {
							spacing: { before: 200, after: 120 }
						}
					},
					heading6: {
						run: {
							font: COMPANY_STYLES.bodyFont,
							size: COMPANY_STYLES.heading6Size,
							color: COMPANY_STYLES.headingColor
						},
						paragraph: {
							spacing: { before: 200, after: 120 }
						}
					}
				}
			},
			sections: [{
				children: this.children
			}]
		});

		return await Packer.toBuffer(doc);
	}

	private async processNode(node: Content | Callout): Promise<void> {
		switch (node.type) {
			case 'heading':
				this.children.push(...this.createHeading(node));
				break;

			case 'paragraph':
				this.children.push(await this.createParagraph(node));
				break;

			case 'code':
				this.children.push(createCodeBlock(node, this.settings.codeBlockStyle));
				break;

			case 'blockquote':
				// Regular blockquote (callouts are transformed by the plugin)
				for (const child of node.children) {
					await this.processNode(child as Content);
				}
				break;

			case 'list':
				if (this.skipNextList) {
					// Skip TOC list content
					this.skipNextList = false;
				} else {
					await this.processList(node);
				}
				break;

			case 'table':
				this.children.push(createStyledTable(node, this.settings.tableStyle));
				break;

			case 'thematicBreak':
				this.children.push(new Paragraph({
					border: {
						bottom: { style: BorderStyle.SINGLE, size: 6, color: '000000' }
					},
					spacing: { before: 200, after: 200 }
				}));
				break;

			case 'callout':
				const calloutParagraphs = createCalloutParagraphs(
					node as Callout,
					this.settings.calloutStyles
				);
				this.children.push(...calloutParagraphs);
				break;

			default:
				// Skip unknown node types
				break;
		}
	}

	private createHeading(node: Heading): Paragraph[] {
		const level = node.depth;
		const headingLevels: { [key: number]: typeof HeadingLevel[keyof typeof HeadingLevel] } = {
			1: HeadingLevel.HEADING_1,
			2: HeadingLevel.HEADING_2,
			3: HeadingLevel.HEADING_3,
			4: HeadingLevel.HEADING_4,
			5: HeadingLevel.HEADING_5,
			6: HeadingLevel.HEADING_6
		};

		// Check if this is a Table of Contents heading - skip entirely
		const headingText = this.extractTextFromNodes(node.children).toLowerCase();
		if (headingText.includes('table of contents') || headingText === 'toc' || headingText === 'contents') {
			// Set flag to skip the following list (TOC content)
			this.skipNextList = true;
			return [];  // Don't output anything for TOC heading
		}

		const headingParagraph = new Paragraph({
			heading: headingLevels[level] || HeadingLevel.HEADING_1,
			children: this.processInlineContent(node.children)
		});

		return [headingParagraph];
	}

	private extractTextFromNodes(nodes: Content[]): string {
		let text = '';
		for (const node of nodes) {
			if (node.type === 'text') {
				text += node.value;
			} else if ('children' in node && Array.isArray(node.children)) {
				text += this.extractTextFromNodes(node.children as Content[]);
			}
		}
		return text;
	}

	private async createParagraph(node: MdParagraph): Promise<Paragraph> {
		const children = await this.processInlineContentAsync(node.children);

		return new Paragraph({
			children
		});
	}

	private processInlineContent(nodes: Content[], formatting: { bold?: boolean; italics?: boolean } = {}): (TextRun | ImageRun)[] {
		const runs: (TextRun | ImageRun)[] = [];

		for (const node of nodes) {
			switch (node.type) {
				case 'text':
					runs.push(new TextRun({
						text: node.value,
						bold: formatting.bold,
						italics: formatting.italics
					}));
					break;

				case 'strong':
					// Process children with bold formatting added
					runs.push(...this.processInlineContent(node.children, {
						...formatting,
						bold: true
					}));
					break;

				case 'emphasis':
					// Process children with italic formatting added
					runs.push(...this.processInlineContent(node.children, {
						...formatting,
						italics: true
					}));
					break;

				case 'inlineCode':
					runs.push(new TextRun({
						text: node.value,
						font: this.settings.codeBlockStyle.fontName,
						size: this.settings.codeBlockStyle.fontSize * 2, // Half-points
						bold: formatting.bold,
						italics: formatting.italics,
						shading: {
							type: ShadingType.SOLID,
							color: this.settings.codeBlockStyle.background
						}
					}));
					break;

				case 'link':
					// For now, just include the text with current formatting
					runs.push(...this.processInlineContent(node.children, formatting));
					break;

				case 'break':
					runs.push(new TextRun({ break: 1 }));
					break;

				default:
					// Handle other inline elements
					if ('value' in node && typeof node.value === 'string') {
						runs.push(new TextRun({
							text: node.value,
							bold: formatting.bold,
							italics: formatting.italics
						}));
					}
					break;
			}
		}

		return runs;
	}

	private async processInlineContentAsync(nodes: Content[]): Promise<(TextRun | ImageRun)[]> {
		const runs: (TextRun | ImageRun)[] = [];

		for (const node of nodes) {
			if (node.type === 'image' && this.imageResolver) {
				const imageData = await this.imageResolver.resolve(node.url);
				if (imageData) {
					runs.push(new ImageRun({
						data: imageData.buffer,
						transformation: {
							width: imageData.width || 400,
							height: imageData.height || 300
						},
						type: 'png'  // Will be detected from buffer
					}));
				}
			} else {
				runs.push(...this.processInlineContent([node]));
			}
		}

		return runs;
	}

	private async processList(node: List): Promise<void> {
		const isOrdered = node.ordered || false;

		for (let i = 0; i < node.children.length; i++) {
			const item = node.children[i];
			await this.processListItem(item, isOrdered, i);
		}
	}

	private async processListItem(node: ListItem, isOrdered: boolean, index: number, depth: number = 0): Promise<void> {
		for (const child of node.children) {
			if (child.type === 'paragraph') {
				const runs = await this.processInlineContentAsync(child.children);
				const indentTwips = 720 + (depth * 360);  // 0.5 inch base + 0.25 inch per level

				this.children.push(new Paragraph({
					children: [
						new TextRun({
							text: isOrdered ? `${index + 1}. ` : '• '
						}),
						...runs
					],
					indent: {
						left: indentTwips,
						hanging: 360  // Hanging indent for bullet/number
					},
					spacing: { after: 120 }  // 6pt spacing after list items
				}));
			} else if (child.type === 'list') {
				// Nested list - increment depth
				await this.processListWithDepth(child, depth + 1);
			}
		}
	}

	private async processListWithDepth(node: List, depth: number): Promise<void> {
		const isOrdered = node.ordered || false;

		for (let i = 0; i < node.children.length; i++) {
			const item = node.children[i];
			await this.processListItem(item, isOrdered, i, depth);
		}
	}
}
